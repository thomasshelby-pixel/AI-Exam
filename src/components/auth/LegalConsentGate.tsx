import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest, ApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { ShieldCheck, FileText, LockKeyhole, Loader2, RefreshCw } from 'lucide-react';

interface LegalConsentStatus {
  required: boolean;
  termsVersion: string;
  privacyVersion: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  needsAcceptance: boolean;
}

const isStudent = (role: unknown) => String(role || '').toUpperCase() === 'STUDENT';

export const LegalConsentGate: React.FC = () => {
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const latestStatusRequest = useRef(0);
  const statusOwner = useRef<string | null>(null);
  const [status, setStatus] = useState<LegalConsentStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [pageError, setPageError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    const requestId = ++latestStatusRequest.current;

    if (authLoading || !isAuthenticated || !token || !user || !isStudent(user.role)) {
      statusOwner.current = null;
      setStatus(null);
      setPageError('');
      setTermsAccepted(false);
      setPrivacyAccepted(false);
      setChecking(false);
      return;
    }

    // Never reuse another account's result or checkbox choices after logout/account switching.
    const userId = String(user.id || '');
    if (statusOwner.current !== userId) {
      statusOwner.current = userId;
      setStatus(null);
      setTermsAccepted(false);
      setPrivacyAccepted(false);
    }

    setChecking(true);
    setPageError('');
    try {
      const response = await apiRequest<{ success: boolean; legalConsent: LegalConsentStatus }>(
        '/api/auth/legal-consent/status'
      );
      if (requestId === latestStatusRequest.current) {
        setStatus(response.legalConsent);
      }
    } catch (error) {
      if (requestId !== latestStatusRequest.current) return;
      if (error instanceof ApiError && error.status === 401) {
        // Do not silently hide the mandatory gate when the server cannot verify this session.
        setStatus(null);
        setPageError('Your sign-in session could not be verified. Please sign in again, then review the current policies.');
      } else {
        setPageError(error instanceof Error ? error.message : 'Could not verify the current policy acceptance.');
      }
    } finally {
      if (requestId === latestStatusRequest.current) setChecking(false);
    }
  }, [authLoading, isAuthenticated, token, user]);

  useEffect(() => {
    void loadStatus();

    // Policy links may open a separate tab (or a WebView may return to this page).
    // Re-check server truth whenever this tab becomes visible or navigation returns.
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void loadStatus();
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);

    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [loadStatus, location.pathname]);

  const acceptPolicies = async () => {
    if (!status || !termsAccepted || !privacyAccepted || saving) return;
    setSaving(true);
    setPageError('');
    try {
      const response = await apiRequest<{ success: boolean; legalConsent: LegalConsentStatus }>(
        '/api/auth/legal-consent/accept',
        {
          method: 'POST',
          body: JSON.stringify({
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: status.termsVersion,
            privacyVersion: status.privacyVersion,
          }),
        }
      );
      setStatus(response.legalConsent);
      setTermsAccepted(false);
      setPrivacyAccepted(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not save your acceptance. Please retry.');
      if (error instanceof ApiError && error.status === 409) {
        // A policy version changed after the screen was loaded. Force a fresh,
        // affirmative choice for both documents before recording the new versions.
        setTermsAccepted(false);
        setPrivacyAccepted(false);
        setStatus(null);
        void loadStatus();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || !user || !isStudent(user.role) || (!checking && !status?.needsAcceptance && !pageError)) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title">
      <section className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-7">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Policy update · Version 2.0</p>
            <h2 id="legal-consent-title" className="mt-1 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">Please review and accept our updated policies</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              We have clarified the rules for fair use of both free and paid facilities, how relevant security information may be used to investigate suspected abuse, and the review process before a final suspension, termination or account closure/deletion.
            </p>
          </div>
        </div>

        {checking && !status && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your current acceptance…
          </div>
        )}

        {pageError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {pageError}
            <button type="button" onClick={() => void loadStatus()} className="ml-2 inline-flex items-center gap-1 font-bold underline">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}

        {status?.needsAcceptance && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                <FileText className="h-4 w-4 text-blue-600" /> Read Terms &amp; Conditions v{status.termsVersion}
              </a>
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                <LockKeyhole className="h-4 w-4 text-blue-600" /> Read Privacy Policy v{status.privacyVersion}
              </a>
            </div>

            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <strong>Important fair-use rule:</strong> Misuse of any free, promotional, institute-funded or paid facility—including creating multiple accounts to bypass free-evaluation limits—may result in temporary restrictions during review and, if substantiated, account suspension, termination or account closure/deletion after notice and a reasonable opportunity to respond. Urgent temporary restrictions may be applied where reasonably necessary to protect security or prevent harm. Unused paid entitlements remain subject to the applicable purchase terms and law; this update does not automatically forfeit them.
            </div>

            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                  required
                />
                <span>
                  I have read and consent to the updated <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="font-bold text-blue-700 underline dark:text-blue-300">Privacy Policy</a>, including the use of relevant account, usage, device and security information to detect and investigate suspected misuse.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                  required
                />
                <span>
                  <strong>I agree with all the Terms &amp; Conditions.</strong> I have read the updated <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="font-bold text-blue-700 underline dark:text-blue-300">Terms &amp; Conditions</a>, including the rules against abusing any free or paid facility and the notice and opportunity-to-respond process before a final suspension, termination or account closure/deletion, where applicable.
                </span>
              </label>
            </div>
          </>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Your acceptance of each document version is recorded with a timestamp and security audit details. Both checkboxes must be selected to continue.
          </p>
          <button
            type="button"
            onClick={() => void acceptPolicies()}
            disabled={!status?.needsAcceptance || !termsAccepted || !privacyAccepted || saving || checking}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {saving ? 'Saving acceptance…' : 'Accept and Continue'}
          </button>
        </div>
      </section>
    </div>
  );
};
