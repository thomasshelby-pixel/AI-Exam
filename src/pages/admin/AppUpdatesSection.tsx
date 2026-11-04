import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Download,
  FileArchive,
  FileCheck2,
  LoaderCircle,
  Package,
  RefreshCw,
  Rocket,
  Smartphone,
  Upload,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';

type ReleaseKind = 'APK' | 'OTA';
type ReleaseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface AppUpdateRelease {
  id: string;
  kind: ReleaseKind;
  status: ReleaseStatus;
  versionName: string;
  versionCode?: number;
  mandatory?: boolean;
  releaseNotes?: string;
  checksum: string;
  fileId: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  publishedAt?: string;
  publishedBy?: string;
}

interface AppUpdateResponse {
  success: boolean;
  currentApk: AppUpdateRelease | null;
  currentOta: AppUpdateRelease | null;
  releases: AppUpdateRelease[];
  error?: string;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '—';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string): string {
  if (!value) return 'Not published';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function StatusBadge({ status }: { status: ReleaseStatus }) {
  const styles: Record<ReleaseStatus, string> = {
    DRAFT: 'bg-amber-50 text-amber-800 border-amber-200',
    PUBLISHED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${styles[status]}`}>{status}</span>;
}

export default function AppUpdatesSection() {
  const [data, setData] = useState<AppUpdateResponse | null>(null);
  const [kind, setKind] = useState<ReleaseKind>('APK');
  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [checksum, setChecksum] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [cleaningApks, setCleaningApks] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest<AppUpdateResponse>('/api/admin/app-updates');
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load app releases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadDraft = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!file) {
      setError('Select an APK or OTA bundle first.');
      return;
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(versionName.trim())) {
      setError('Use a semantic version such as 1.2.3.');
      return;
    }
    if (kind === 'APK' && (!/^\d+$/.test(versionCode) || Number(versionCode) < 2)) {
      setError('Android version code must be at least 2 and higher than the currently installed release.');
      return;
    }
    if (kind === 'OTA' && !/^[a-f0-9]{64}$/i.test(checksum.trim())) {
      setError('Paste the SHA-256 checksum produced by the Capgo CLI for this OTA bundle.');
      return;
    }

    const form = new FormData();
    form.append('kind', kind);
    form.append('versionName', versionName.trim());
    if (kind === 'APK') form.append('versionCode', versionCode);
    form.append('mandatory', String(kind === 'APK' && mandatory));
    form.append('releaseNotes', releaseNotes.trim());
    if (kind === 'OTA') form.append('checksum', checksum.trim().toLowerCase());
    form.append('file', file);

    setUploading(true);
    try {
      const response = await apiRequest<{ success: boolean; release: AppUpdateRelease }>('/api/admin/app-updates/upload', {
        method: 'POST',
        body: form,
      });
      setSuccess(`Release ${response.release.id} uploaded as a draft. Review it before publishing.`);
      setFile(null);
      setChecksum('');
      setReleaseNotes('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const publish = async (release: AppUpdateRelease) => {
    const impact = release.kind === 'APK'
      ? 'Android users will be offered this APK. They must confirm installation in Android.'
      : 'Compatible installed app versions can receive this JS/CSS/HTML bundle without installing a new APK.';
    if (!window.confirm(`Publish ${release.id}?\n\n${impact}\n\nContinue only if package/signing compatibility has been verified.`)) return;
    setPublishingId(release.id);
    setError('');
    setSuccess('');
    try {
      const response = await apiRequest<{ success: boolean; release: AppUpdateRelease }>(
        `/api/admin/app-updates/${encodeURIComponent(release.id)}/publish`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      setSuccess(`Published ${response.release.id}. The corresponding update channel is now live.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish release.');
    } finally {
      setPublishingId(null);
    }
  };

  const cleanupPreviousApks = async () => {
    const archived = (data?.releases || []).filter((release) => release.kind === 'APK' && release.status === 'ARCHIVED');
    if (!archived.length) {
      setError('There are no archived APK releases to delete.');
      return;
    }
    const totalBytes = archived.reduce((sum, release) => sum + (Number(release.sizeBytes) || 0), 0);
    const sizeLabel = formatBytes(totalBytes);
    if (!window.confirm(
      `Permanently delete ${archived.length} archived APK release(s) (${sizeLabel}) from Firebase Cloud Storage and Firestore?\n\nThe current live APK will NOT be deleted. Older archived versions will no longer be downloadable from the app update service. This cannot be undone.`
    )) return;

    setCleaningApks(true);
    setError('');
    setSuccess('');
    try {
      const response = await apiRequest<{ deletedCount: number; freedBytes: number; skippedCount: number; message: string }>(
        '/api/admin/app-updates/previous-apks',
        { method: 'DELETE' },
      );
      setSuccess(`${response.message}${response.skippedCount ? ` ${response.skippedCount} release(s) were kept because storage cleanup could not be verified.` : ''}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archived APK cleanup failed.');
    } finally {
      setCleaningApks(false);
    }
  };

  const currentApk = data?.currentApk || null;
  const currentOta = data?.currentOta || null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-700">
            <Smartphone className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.16em]">Release Management</span>
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">App Updates</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Upload a version, validate it, then publish. APK releases handle native changes; OTA bundles handle compatible web-layer changes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(data?.releases || []).some((release) => release.kind === 'APK' && release.status === 'ARCHIVED') && (
            <button type="button" onClick={() => void cleanupPreviousApks()} disabled={cleaningApks || loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-60">
              {cleaningApks ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {cleaningApks ? 'Deleting old APKs…' : 'Delete archived APKs'}
            </button>
          )}
          <button type="button" onClick={() => void refresh()} disabled={loading || cleaningApks} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh releases
          </button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{success}</span></div>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Package className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-extrabold text-slate-900">Android APK</h2>
              <p className="text-xs text-slate-500">Native code, permissions and plugin changes</p>
            </div>
            <StatusBadge status={currentApk ? 'PUBLISHED' : 'DRAFT'} />
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            {currentApk ? (
              <>
                <div className="text-2xl font-black text-slate-900">v{currentApk.versionName}</div>
                <div className="mt-1 text-xs text-slate-500">Version code {currentApk.versionCode} · {formatBytes(currentApk.sizeBytes)}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{currentApk.releaseNotes || 'No release notes supplied.'}</p>
                <p className="mt-3 text-[11px] text-slate-400">Published {formatDate(currentApk.publishedAt)}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">No admin-uploaded APK release yet. The existing public APK source remains available until the first release is published here.</p>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Package ID is fixed to <code className="rounded bg-slate-100 px-1 py-0.5">com.caexamchecker.aiapp</code>. The APK must be signed with the same key as the installed release and its version code must increase.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FileArchive className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-extrabold text-slate-900">Live UI Update (OTA)</h2>
              <p className="text-xs text-slate-500">HTML, CSS and JavaScript bundle</p>
            </div>
            <StatusBadge status={currentOta ? 'PUBLISHED' : 'DRAFT'} />
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            {currentOta ? (
              <>
                <div className="text-2xl font-black text-slate-900">v{currentOta.versionName}</div>
                <div className="mt-1 text-xs text-slate-500">{formatBytes(currentOta.sizeBytes)} · Checksum verified by updater</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{currentOta.releaseNotes || 'No release notes supplied.'}</p>
                <p className="mt-3 text-[11px] text-slate-400">Published {formatDate(currentOta.publishedAt)}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">No OTA bundle published. The updater-enabled APK must be installed once before existing users can receive live UI changes.</p>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Create the compatible ZIP with <code className="rounded bg-slate-100 px-1 py-0.5">npx @capgo/cli bundle zip</code>; upload the generated ZIP and its CLI checksum. OTA cannot change native Android code or permissions.
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Upload a release draft</h2>
            <p className="mt-1 text-xs text-slate-500">Nothing becomes live until you select Publish.</p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => { setKind('APK'); setFile(null); }} className={`rounded-lg px-4 py-2 text-xs font-bold ${kind === 'APK' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>APK release</button>
            <button type="button" onClick={() => { setKind('OTA'); setFile(null); }} className={`rounded-lg px-4 py-2 text-xs font-bold ${kind === 'OTA' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>Live OTA bundle</button>
          </div>
        </div>

        <form onSubmit={uploadDraft} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">
              Version name
              <input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="e.g. 1.0.1" required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500" />
            </label>
            {kind === 'APK' ? (
              <label className="block text-xs font-bold text-slate-700">
                Android version code
                <input inputMode="numeric" value={versionCode} onChange={(e) => setVersionCode(e.target.value)} placeholder="e.g. 2" required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500" />
              </label>
            ) : (
              <label className="block text-xs font-bold text-slate-700">
                Capgo CLI checksum (SHA-256)
                <input value={checksum} onChange={(e) => setChecksum(e.target.value)} placeholder="64-character checksum" required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs font-normal outline-none focus:border-blue-500" />
              </label>
            )}
          </div>

          {kind === 'APK' && (
            <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11px] leading-5 text-blue-900">
              The Android build workflow prints the exact values in its log as <code>Android release version: 1.0.N (versionCode N)</code>. Use that version name and version code for the APK you upload. The APK must keep package ID <code>com.caexamchecker.aiapp</code> and the same signing certificate as the installed app.
            </p>
          )}

          <label className="block text-xs font-bold text-slate-700">
            Release notes
            <textarea value={releaseNotes} onChange={(e) => setReleaseNotes(e.target.value)} placeholder="What changed in this release?" rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500" />
          </label>

          {kind === 'APK' && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="mt-0.5" />
              <span><strong>Mandatory update</strong><span className="mt-0.5 block text-xs text-slate-500">When supported by the installed app updater, the user cannot dismiss the update prompt.</span></span>
            </label>
          )}

          <label className="block rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-blue-400">
            <input type="file" accept={kind === 'APK' ? '.apk,application/vnd.android.package-archive' : '.zip,application/zip'} onChange={(e) => setFile(e.target.files?.[0] || null)} className="sr-only" />
            <CloudUpload className="mx-auto h-7 w-7 text-slate-400" />
            <span className="mt-2 block text-sm font-bold text-slate-800">{file ? file.name : `Choose ${kind === 'APK' ? 'APK' : 'Capgo OTA ZIP'} file`}</span>
            <span className="mt-1 block text-xs text-slate-500">{file ? formatBytes(file.size) : (kind === 'APK' ? 'APK up to 100 MB' : 'Capgo-compatible ZIP up to 45 MB')}</span>
          </label>

          <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
            <p className="max-w-xl text-[11px] leading-5 text-slate-400">
              Upload validates file type, version format, checksum and cloud persistence. It does not verify Android signing certificate cryptographically—check the release build/signing key before publishing.
            </p>
            <button type="submit" disabled={uploading || loading || !file} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Upload draft'}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-extrabold text-slate-900">Release history</h2>
            <p className="mt-1 text-xs text-slate-500">Drafts, published releases and archived versions.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{data?.releases?.length || 0} releases</span>
        </div>
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading releases…</div>
        ) : !data?.releases?.length ? (
          <div className="p-10 text-center"><FileCheck2 className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-600">No admin-managed releases yet.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-3 font-bold">Release</th><th className="px-5 py-3 font-bold">Type</th><th className="px-5 py-3 font-bold">Size</th><th className="px-5 py-3 font-bold">Uploaded</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3 text-right font-bold">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.releases.map((release) => (
                  <tr key={release.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-4"><div className="font-bold text-slate-900">{release.id}</div><div className="mt-1 max-w-sm truncate text-[10px] text-slate-500">{release.releaseNotes || 'No release notes'}</div></td>
                    <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">{release.kind === 'APK' ? <Package className="h-3.5 w-3.5" /> : <FileArchive className="h-3.5 w-3.5" />}{release.kind}{release.versionCode ? ` · #${release.versionCode}` : ''}</span></td>
                    <td className="px-5 py-4 text-slate-600">{formatBytes(release.sizeBytes)}</td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(release.uploadedAt)}</td>
                    <td className="px-5 py-4"><StatusBadge status={release.status} /></td>
                    <td className="px-5 py-4 text-right">
                      {release.status === 'DRAFT' ? (
                        <button type="button" onClick={() => void publish(release)} disabled={publishingId === release.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                          {publishingId === release.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />} Publish
                        </button>
                      ) : release.status === 'PUBLISHED' ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Live</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-400"><Download className="h-3.5 w-3.5" /> Archived</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
