import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, LoaderCircle, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { apiRequest } from '../../api/client.js';

const CONFIRMATION_PHRASE = 'RECONCILE_DELETED_ACCOUNTS';

interface CleanupPreview {
  generatedAt: string;
  tombstonedAccountCount: number;
  linkedDocumentCount: number;
  linkedDocumentsByCollection: Record<string, number>;
  cloudFileMetadataCount: number;
  legacyAppActivityCount: number;
  accounts: Array<{
    userId: string;
    email: string | null;
    displayName: string | null;
    linkedDocumentCount: number;
    cloudFileCount: number;
  }>;
  warnings: string[];
}

interface CleanupApiResponse {
  success: boolean;
  preview: CleanupPreview;
  result?: {
    runId: string;
    deletedDocuments: number;
    deletedCloudFiles: number;
    deletedLegacyActivity: number;
    skippedAccounts: number;
    preview: CleanupPreview;
  };
  error?: string;
}

function CountTile({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">{icon}{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-900">{value.toLocaleString()}</div>
    </div>
  );
}

export default function DeletedAccountCleanupSection() {
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastResult, setLastResult] = useState<CleanupApiResponse['result'] | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest<CleanupApiResponse>('/api/admin/deleted-accounts/reconcile');
      if (!response.success) throw new Error(response.error || 'Could not load the cleanup preview.');
      setPreview(response.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the cleanup preview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const executeCleanup = async () => {
    if (confirmation.trim() !== CONFIRMATION_PHRASE) {
      setError(`Type ${CONFIRMATION_PHRASE} exactly to confirm.`);
      return;
    }
    const accountCount = preview?.tombstonedAccountCount || 0;
    if (accountCount === 0) {
      setError('No confirmed deleted accounts were found. Nothing will be deleted.');
      return;
    }
    setExecuting(true);
    setError('');
    setSuccess('');
    try {
      const response = await apiRequest<CleanupApiResponse>('/api/admin/deleted-accounts/reconcile', {
        method: 'POST',
        body: JSON.stringify({ confirmation: CONFIRMATION_PHRASE }),
      });
      if (!response.success || !response.result) throw new Error(response.error || 'Cleanup could not be completed.');
      setLastResult(response.result);
      setConfirmation('');
      setSuccess(`Cleanup run ${response.result.runId} completed. ${response.result.deletedDocuments} Firestore records and ${response.result.deletedCloudFiles} cloud files were removed.`);
      setPreview(response.result.preview);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup could not be completed.');
    } finally {
      setExecuting(false);
    }
  };

  const collectionCounts: Array<[string, number]> = Object.entries(preview?.linkedDocumentsByCollection || {})
    .map(([name, count]) => [name, Number(count)] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-rose-700"><ShieldAlert className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Data Integrity</span></div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Deleted Account Cleanup</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Find leftover Firestore records for accounts with a deletion tombstone or explicit legacy deletion status/audit evidence, including student-code aliases, device activity and linked file metadata.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || executing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh preview
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-bold">Safe-scope cleanup only</p>
          <p className="mt-1 text-xs leading-5">The tool targets accounts with a durable <code>users</code> tombstone, an explicit <code>DELETING</code>/<code>DELETED</code> status, or a student-deletion audit record. It never infers deletion merely because an account is missing from one instance's SQLite cache. Legacy candidates get a verified tombstone before cleanup; payment/audit retention records and tombstones are preserved. Preview first, then type the confirmation phrase to execute.</p>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{success}</span></div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CountTile label="Confirmed deleted accounts" value={preview?.tombstonedAccountCount || 0} icon={<ShieldAlert className="h-4 w-4" />} />
        <CountTile label="Linked Firestore records" value={preview?.linkedDocumentCount || 0} icon={<ClipboardCheck className="h-4 w-4" />} />
        <CountTile label="Cloud file metadata" value={preview?.cloudFileMetadataCount || 0} icon={<Trash2 className="h-4 w-4" />} />
        <CountTile label="Legacy app activity" value={preview?.legacyAppActivityCount || 0} icon={<RefreshCw className="h-4 w-4" />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-extrabold text-slate-900">Cleanup preview</h2>
            <p className="mt-1 text-xs text-slate-500">Generated {preview?.generatedAt ? new Date(preview.generatedAt).toLocaleString() : '—'}</p>
          </div>
          {loading && !preview ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Scanning confirmed deleted-account references…</div>
          ) : !preview?.accounts?.length ? (
            <div className="p-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-2 text-sm font-semibold text-slate-700">No confirmed deleted student accounts require cleanup.</p></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-3 font-bold">Account ID</th><th className="px-5 py-3 font-bold">Student</th><th className="px-5 py-3 text-right font-bold">Records</th><th className="px-5 py-3 text-right font-bold">Files</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.accounts.map((account) => (
                      <tr key={account.userId}>
                        <td className="px-5 py-4 font-mono text-[10px] text-slate-600">{account.userId}</td>
                        <td className="px-5 py-4"><div className="font-bold text-slate-800">{account.displayName || 'Deleted student'}</div><div className="mt-1 text-[10px] text-slate-500">{account.email || 'Email unavailable in remaining cloud records'}</div></td>
                        <td className="px-5 py-4 text-right font-bold text-slate-700">{account.linkedDocumentCount}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-700">{account.cloudFileCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.accounts.length >= 100 && <p className="border-t border-slate-100 p-3 text-[11px] text-slate-500">Showing the first 100 accounts. The cleanup plan can include additional tombstoned accounts.</p>}
              {collectionCounts.length > 0 && (
                <div className="border-t border-slate-100 p-5">
                  <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-slate-500">Records by collection</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {collectionCounts.map(([name, count]) => <div key={name} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span className="truncate font-mono text-[11px] text-slate-600">{name}</span><span className="font-bold text-slate-800">{count}</span></div>)}
                  </div>
                </div>
              )}
            </>
          )}
          {!!preview?.warnings?.length && (
            <div className="border-t border-amber-200 bg-amber-50 p-4">
              <h3 className="text-xs font-extrabold text-amber-900">Warnings</h3>
              <ul className="mt-2 space-y-1 text-xs text-amber-800">{preview.warnings.map((warning, index) => <li key={index}>• {warning}</li>)}</ul>
            </div>
          )}
        </section>

        <section className="h-fit rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><Trash2 className="h-5 w-5" /></div>
            <div><h2 className="font-extrabold text-slate-900">Execute reconciliation</h2><p className="mt-1 text-xs text-slate-500">This permanently removes matched cloud records.</p></div>
          </div>
          <div className="mt-4 space-y-3 text-xs leading-5 text-slate-600">
            <p>Before execution, the server reloads tombstones, legacy deletion markers and matching student-deletion audit records, then reconstructs the plan from shared Firestore.</p>
            <p>Payment transaction/audit records and tombstones are intentionally retained. Missing legacy activity that cannot be accessed is reported as a warning.</p>
          </div>
          {lastResult && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-800">Last cleanup run</div>
              <div className="mt-1 break-all font-mono text-[10px] text-slate-500">{lastResult.runId}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-slate-500">Firestore records</div><div className="text-lg font-black text-slate-900">{lastResult.deletedDocuments}</div></div>
                <div><div className="text-slate-500">Cloud files</div><div className="text-lg font-black text-slate-900">{lastResult.deletedCloudFiles}</div></div>
                <div><div className="text-slate-500">Legacy activity</div><div className="text-lg font-black text-slate-900">{lastResult.deletedLegacyActivity}</div></div>
                <div><div className="text-slate-500">Users still visible</div><div className="text-lg font-black text-slate-900">{lastResult.skippedAccounts}</div></div>
              </div>
            </div>
          )}
          <label className="mt-5 block text-xs font-bold text-slate-700">
            Type <code className="rounded bg-slate-100 px-1 py-0.5">{CONFIRMATION_PHRASE}</code> to confirm
            <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder={CONFIRMATION_PHRASE} autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-rose-400" />
          </label>
          <button type="button" onClick={() => void executeCleanup()} disabled={executing || loading || confirmation.trim() !== CONFIRMATION_PHRASE || (preview?.tombstonedAccountCount || 0) === 0} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-xs font-extrabold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
            {executing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {executing ? 'Reconciling…' : 'Clean confirmed deleted accounts'}
          </button>
        </section>
      </div>
    </div>
  );
}
