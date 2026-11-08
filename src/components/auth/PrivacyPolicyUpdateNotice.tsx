import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { BookOpen, Check, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

interface NoticeResponse {
  success: boolean;
  notice: { version: string; acknowledged: boolean };
}

/**
 * Announces a published Privacy Policy version to every authenticated role.
 * This is a notice acknowledgement only; it does not collect legal consent.
 */
export const PrivacyPolicyUpdateNotice: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [version, setVersion] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadNotice = useCallback(async () => {
    if (isLoading || !isAuthenticated || !user?.id) {
      setVisible(false);
      setVersion(null);
      return;
    }

    setChecking(true);
    setError('');
    try {
      const response = await apiRequest<NoticeResponse>('/api/auth/policy-update/status');
      setVersion(response.notice.version);
      setVisible(!response.notice.acknowledged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the Privacy Policy update.');
    } finally {
      setChecking(false);
    }
  }, [isAuthenticated, isLoading, user?.id]);

  useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  const acknowledge = async () => {
    if (!version || saving) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest<NoticeResponse>('/api/auth/policy-update/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ policyVersion: version }),
      });
      setVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your acknowledgement. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || !user || !visible) {
    if (error && isAuthenticated && user && !checking) {
      return (
        <div className="fixed bottom-4 right-4 z-[10001] max-w-sm rounded-xl border border-rose-200 bg-white p-4 text-sm text-slate-800 shadow-xl">
          <p>{error}</p>
          <button type="button" onClick={() => void loadNotice()} className="mt-2 inline-flex items-center gap-2 font-semibold text-slate-900 underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry policy check
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-[#101729]/65 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="privacy-update-title">
      <section className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#e8e7e2] bg-[#f8f7f3] p-5 shadow-2xl sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#101729] text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <span className="rounded-md border border-[#e8e7e2] bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-[#586174]">
            PRIVACY · v{version}
          </span>
        </div>

        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c24c66]">Important account notice</p>
        <h2 id="privacy-update-title" className="mt-2 font-serif text-2xl font-semibold tracking-tight text-[#101729] sm:text-3xl">
          We've updated our Privacy Policy.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#596274]">
          The updated policy explains how information submitted through CA Exam Checker may be used to develop and improve our evaluation systems.
        </p>

        <div className="my-5 rounded-xl border border-[#e8e7e2] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#101729]">
            <BookOpen className="h-4 w-4 text-[#c24c66]" />
            What has been clarified
          </div>
          <p className="mt-2 text-sm leading-6 text-[#596274]">
            Submitted answer sheets, question papers and reference materials, evaluation results, question mapping, marks, corrections and feedback may be processed to test, validate, develop and improve our AI-assisted evaluation systems.
          </p>
          <p className="mt-3 text-xs leading-5 text-[#788296]">
            This use remains subject to applicable law, appropriate safeguards and any separate consent that may be legally required.
          </p>
        </div>

        <div className="rounded-lg bg-[#f0eee8] px-4 py-3 text-xs leading-5 text-[#687386]">
          Acknowledging this notice confirms that you have seen the update. It does not itself constitute consent where separate consent is required by applicable law.
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#e8e7e2] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#d9d8d1] bg-white px-4 py-2.5 text-sm font-semibold text-[#101729] transition hover:bg-[#f4f4f0]">
            Read updated policy
          </a>
          <button
            type="button"
            onClick={() => void acknowledge()}
            disabled={saving || checking}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#101729] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#29344b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Saving…' : "I've read this update"}
          </button>
        </div>
        <p className="mt-3 text-right font-mono text-[10px] text-[#8992a2]">Effective 08 November 2026</p>
      </section>
    </div>
  );
};
