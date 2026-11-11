import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudDownload,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../../api/client.js';

type RecoveryStatus =
  | 'FIREBASE_ONLY'
  | 'CLOUD_RECORD_RECOVERABLE'
  | 'CLOUD_RECORD_INCOMPLETE'
  | 'PREVIOUSLY_DELETED'
  | 'ROLE_CONFLICT';

interface RecoveryCandidate {
  email: string;
  displayName: string;
  firebaseCreatedAt: string | null;
  lastSignInAt: string | null;
  status: RecoveryStatus;
  statusMessage: string;
}

interface RecoveryReport {
  success: true;
  scannedFirebaseUsers: number;
  googleAccountsFound: number;
  candidates: RecoveryCandidate[];
  counts: Record<RecoveryStatus, number>;
  scanComplete: boolean;
  nextPageToken?: string;
}

interface GoogleAccountRecoverySectionProps {
  onRecovered?: () => void | Promise<void>;
}

const statusMeta: Record<RecoveryStatus, { label: string; className: string }> = {
  FIREBASE_ONLY: { label: 'Firebase only', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  CLOUD_RECORD_RECOVERABLE: { label: 'Cloud record recoverable', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CLOUD_RECORD_INCOMPLETE: { label: 'Cloud record incomplete', className: 'bg-rose-50 text-rose-800 border-rose-200' },
  PREVIOUSLY_DELETED: { label: 'Previously deleted', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  ROLE_CONFLICT: { label: 'Role conflict', className: 'bg-violet-50 text-violet-800 border-violet-200' },
};

export function GoogleAccountRecoverySection({ onRecovered }: GoogleAccountRecoverySectionProps) {
  const [report, setReport] = useState<RecoveryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveringEmail, setRecoveringEmail] = useState('');
  const [copiedEmail, setCopiedEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function scan(pageToken?: string) {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const suffix = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
      const result = await apiRequest<RecoveryReport>(`/api/admin/google-account-recovery${suffix}`);
      setReport((previous) => pageToken && previous
        ? {
            ...result,
            scannedFirebaseUsers: previous.scannedFirebaseUsers + result.scannedFirebaseUsers,
            googleAccountsFound: previous.googleAccountsFound + result.googleAccountsFound,
            candidates: [...previous.candidates, ...result.candidates],
            counts: {
              FIREBASE_ONLY: previous.counts.FIREBASE_ONLY + result.counts.FIREBASE_ONLY,
              CLOUD_RECORD_RECOVERABLE: previous.counts.CLOUD_RECORD_RECOVERABLE + result.counts.CLOUD_RECORD_RECOVERABLE,
              CLOUD_RECORD_INCOMPLETE: previous.counts.CLOUD_RECORD_INCOMPLETE + result.counts.CLOUD_RECORD_INCOMPLETE,
              PREVIOUSLY_DELETED: previous.counts.PREVIOUSLY_DELETED + result.counts.PREVIOUSLY_DELETED,
              ROLE_CONFLICT: previous.counts.ROLE_CONFLICT + result.counts.ROLE_CONFLICT,
            },
          }
        : result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not scan Firebase Google accounts.');
    } finally {
      setLoading(false);
    }
  }

  async function recoverCloudAccount(candidate: RecoveryCandidate) {
    if (candidate.status !== 'CLOUD_RECORD_RECOVERABLE') return;
    setRecoveringEmail(candidate.email);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ success: boolean; message?: string }>(
        '/api/admin/google-account-recovery/recover-cloud-account',
        {
          method: 'POST',
          body: JSON.stringify({ email: candidate.email }),
        }
      );
      setNotice(result.message || `Existing account recovered for ${candidate.email}.`);
      await scan();
      await onRecovered?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not recover the existing cloud account.');
      await scan();
    } finally {
      setRecoveringEmail('');
    }
  }

  async function copyRecoveryInstructions(candidate: RecoveryCandidate) {
    const message = [
      'Your Google sign-in identity is present in Firebase, but the CA Exam Checker student profile was not completed.',
      'Please open https://caexamcheckerai.com/login or the Exam Checker AI app and choose Continue with Google using this exact email address:',
      candidate.email,
      'When prompted, review and accept the current Terms & Conditions (version 2.0) and Privacy Policy (version 3.0) using their separate checkboxes. Then complete your ICAI registration number and CA course in the profile screen.',
      'Use the same Google account; do not create another account with a different email. Existing free-evaluation eligibility is checked by the system and is not guaranteed.',
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(message);
      setCopiedEmail(candidate.email);
      setNotice(`Recovery instructions copied for ${candidate.email}. Share them with the account owner.`);
    } catch {
      setError('Clipboard access is unavailable. Please select and copy the recovery instructions manually.');
      setNotice(message);
    }
  }

  const candidateCount = report?.candidates.length || 0;

  return (
    <section className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Google Account Recovery &amp; Sync</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
              Find verified Google identities that are missing from the student registry or have an existing cloud record that can be restored. Scanning is read-only.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={loading}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? 'Scanning Google accounts…' : 'Scan Google Accounts'}
        </button>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-indigo-100 bg-white/80 p-3 text-[11px] leading-relaxed text-slate-600">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <span>
          Scan does not create accounts or grant credits. Only an existing, complete Firestore student record can be restored by Admin. A Firebase-only identity must complete sign-in and accept current legal terms itself.
        </span>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="whitespace-pre-line">{notice}</span>
        </div>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Firebase users scanned</p>
              <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{report.scannedFirebaseUsers.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Google identities</p>
              <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{report.googleAccountsFound.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Needs action</p>
              <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{candidateCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-white bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Firebase only</p>
              <p className="mt-1 text-lg font-black tabular-nums text-amber-700">{report.counts.FIREBASE_ONLY.toLocaleString()}</p>
            </div>
          </div>

          {!report.scanComplete && report.nextPageToken && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-relaxed text-amber-900">The Firebase directory is larger than one scan batch. Continue scanning to cover the remaining identities.</p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void scan(report.nextPageToken)}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-[11px] font-bold text-amber-900 disabled:opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Scan next batch
              </button>
            </div>
          )}

          {candidateCount === 0 ? (
            <div className="rounded-xl border border-dashed border-indigo-200 bg-white p-5 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
              <p className="mt-2 text-xs font-bold text-slate-800">No unlinked Google accounts found in the scanned range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5 font-bold">Google account</th>
                    <th className="px-3 py-2.5 font-bold">Firebase created</th>
                    <th className="px-3 py-2.5 font-bold">Last sign-in</th>
                    <th className="px-3 py-2.5 font-bold">Recovery status</th>
                    <th className="px-3 py-2.5 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.candidates.map((candidate) => (
                    <tr key={candidate.email} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-bold text-slate-900">{candidate.displayName}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{candidate.email}</p>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-600">
                        {candidate.firebaseCreatedAt ? new Date(candidate.firebaseCreatedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-600">
                        {candidate.lastSignInAt ? new Date(candidate.lastSignInAt).toLocaleString() : 'Never recorded'}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${statusMeta[candidate.status].className}`}>
                          {statusMeta[candidate.status].label}
                        </span>
                        <p className="mt-1.5 max-w-sm text-[10px] leading-relaxed text-slate-500">{candidate.statusMessage}</p>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {candidate.status === 'CLOUD_RECORD_RECOVERABLE' ? (
                          <button
                            type="button"
                            onClick={() => void recoverCloudAccount(candidate)}
                            disabled={Boolean(recoveringEmail)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {recoveringEmail === candidate.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
                            Restore existing record
                          </button>
                        ) : candidate.status === 'FIREBASE_ONLY' ? (
                          <button
                            type="button"
                            onClick={() => void copyRecoveryInstructions(candidate)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedEmail === candidate.email ? 'Copied' : 'Copy user instructions'}
                          </button>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">Manual review</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default GoogleAccountRecoverySection;
