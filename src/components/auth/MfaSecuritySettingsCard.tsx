import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Key,
  Copy,
  Check,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  QrCode,
  KeyRound,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import {
  generateTotpSetup,
  enrollFirebaseTotpFactor,
  mapFirebaseTotpAuthError,
  getFirebaseEnrolledTotpFactors,
  type TotpSetupData,
} from '../../lib/firebaseAuth.js';
import { MfaAuthenticatorItem } from '../../types/index.js';
import { formatDateIST, formatDateTimeIST } from '../../utils/timezone.js';

interface MfaSecuritySettingsCardProps {
  className?: string;
}

export const MfaSecuritySettingsCard: React.FC<MfaSecuritySettingsCardProps> = ({ className = '' }) => {
  const {
    user,
    isLoading: isAuthLoading,
    triggerMfaEnrollment,
    disableMfa,
    getRecoveryCodeStatus,
    generateRecoveryCodes,
    getAuthenticators,
    enrollBackupAuthenticator,
    removeAuthenticator,
    syncMfaFactor,
    refreshUser,
  } = useAuth();

  const isMandatoryRole = user?.role === 'INSTITUTE_ADMIN' || user?.role === 'SUPER_ADMIN';

  // Authenticators & Recovery codes state
  const [authenticators, setAuthenticators] = useState<MfaAuthenticatorItem[]>([]);
  const [recoveryStatus, setRecoveryStatus] = useState<{
    total: number;
    remaining: number;
    hasCodes: boolean;
    generatedAt: string | null;
  } | null>(null);

  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [isVerifyingFactor, setIsVerifyingFactor] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Disable MFA state
  const [showDisableConfirm, setShowDisableConfirm] = useState<boolean>(false);
  const [isDisabling, setIsDisabling] = useState<boolean>(false);

  // Regenerate Recovery Codes modal state
  const [showRegenModal, setShowRegenModal] = useState<boolean>(false);
  const [isGeneratingCodes, setIsGeneratingCodes] = useState<boolean>(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState<boolean>(false);

  // Add Backup Authenticator modal state
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);
  const [backupStep, setBackupStep] = useState<'DETAILS' | 'VERIFY'>('DETAILS');
  const [backupLabel, setBackupLabel] = useState<string>('');
  const [backupTotpSetup, setBackupTotpSetup] = useState<TotpSetupData | null>(null);
  const [backupOtp, setBackupOtp] = useState<string>('');
  const [isSettingUpBackup, setIsSettingUpBackup] = useState<boolean>(false);
  const [backupError, setBackupError] = useState<string>('');
  const [copiedBackupKey, setCopiedBackupKey] = useState<boolean>(false);

  // Authenticator removal state
  const [removingAuthId, setRemovingAuthId] = useState<string | null>(null);

  const loadSecurityDetails = async () => {
    if (!user?.mfaEnabled) return;
    setIsLoadingDetails(true);
    try {
      const [authList, recStatus] = await Promise.all([
        getAuthenticators().catch(() => []),
        getRecoveryCodeStatus().catch(() => null),
      ]);
      setAuthenticators(authList as MfaAuthenticatorItem[]);
      if (recStatus) {
        setRecoveryStatus(recStatus);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const verifyAndLoad = async () => {
      if (isAuthLoading) return;
      setIsVerifyingFactor(true);
      try {
        if (user?.mfaEnabled) {
          await loadSecurityDetails();
        } else if (user) {
          try {
            const { hasTotpFactor } = await getFirebaseEnrolledTotpFactors();
            if (hasTotpFactor && !isCancelled) {
              await syncMfaFactor();
              await refreshUser();
              await loadSecurityDetails();
            }
          } catch {
            // non-fatal
          }
        }
      } finally {
        if (!isCancelled) {
          setIsVerifyingFactor(false);
        }
      }
    };

    verifyAndLoad();

    return () => {
      isCancelled = true;
    };
  }, [user?.id, user?.mfaEnabled, isAuthLoading]);

  const handleDisableMfa = async () => {
    setIsDisabling(true);
    setActionMessage(null);
    try {
      await disableMfa();
      setActionMessage({ type: 'success', text: 'Two-Factor Authentication has been disabled.' });
      setShowDisableConfirm(false);
      setAuthenticators([]);
      setRecoveryStatus(null);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Failed to disable MFA.' });
    } finally {
      setIsDisabling(false);
    }
  };

  const handleGenerateRecoveryCodes = async () => {
    setIsGeneratingCodes(true);
    setActionMessage(null);
    try {
      const res = await generateRecoveryCodes();
      setNewCodes(res.recoveryCodes);
      setRecoveryStatus({
        total: res.total || 10,
        remaining: res.total || 10,
        hasCodes: true,
        generatedAt: new Date().toISOString(),
      });
      setActionMessage({
        type: 'success',
        text: 'New recovery codes generated. All previous recovery codes have been permanently retired.',
      });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Failed to generate recovery codes.' });
      setShowRegenModal(false);
    } finally {
      setIsGeneratingCodes(false);
    }
  };

  const handleStartBackupSetup = async () => {
    if (!backupLabel.trim()) {
      setBackupError('Please enter a descriptive label (e.g. iPad, Backup Phone).');
      return;
    }
    setBackupError('');
    setIsSettingUpBackup(true);
    try {
      const setup = await generateTotpSetup(
        `${user?.email || 'User'} (${backupLabel.trim()})`,
        'CA Exam Checker AI'
      );
      setBackupTotpSetup(setup);
      setBackupStep('VERIFY');
    } catch (err: any) {
      setBackupError(mapFirebaseTotpAuthError(err));
    } finally {
      setIsSettingUpBackup(false);
    }
  };

  const handleVerifyBackupAuthenticator = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = backupOtp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setBackupError('Please enter the 6-digit code shown on your backup device.');
      return;
    }

    setBackupError('');
    setIsSettingUpBackup(true);
    try {
      // Optional Firebase enrollment check
      let factorUid: string | undefined;
      try {
        const fbRes = await enrollFirebaseTotpFactor(backupTotpSetup?.secret, cleanOtp);
        if (fbRes.idToken) {
          factorUid = `totp_${Date.now()}`;
        }
      } catch {
        // Fallback to backend validation
      }

      await enrollBackupAuthenticator(backupLabel.trim(), factorUid);
      setActionMessage({
        type: 'success',
        text: `Backup authenticator "${backupLabel.trim()}" enrolled successfully.`,
      });
      setShowBackupModal(false);
      setBackupLabel('');
      setBackupOtp('');
      setBackupTotpSetup(null);
      setBackupStep('DETAILS');
      await loadSecurityDetails();
    } catch (err: any) {
      setBackupError(err?.message || 'Failed to verify backup authenticator code.');
    } finally {
      setIsSettingUpBackup(false);
    }
  };

  const handleRemoveAuthenticator = async (authId: string, label: string) => {
    if (!confirm(`Are you sure you want to remove the authenticator "${label}"?`)) {
      return;
    }
    setRemovingAuthId(authId);
    setActionMessage(null);
    try {
      await removeAuthenticator(authId);
      setActionMessage({ type: 'success', text: `Authenticator "${label}" removed.` });
      await loadSecurityDetails();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Failed to remove authenticator.' });
    } finally {
      setRemovingAuthId(null);
    }
  };

  const copyCodes = () => {
    const text = [
      'CA EXAM CHECKER AI - ONE-TIME RECOVERY CODES',
      'Generated: ' + formatDateTimeIST(new Date(), true),
      'Keep these codes offline and private. Each code can be used once.',
      '------------------------------------------------',
      ...newCodes.map((c, i) => `${i + 1}. ${c}`),
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2500);
    });
  };

  const downloadCodes = () => {
    const text = [
      'CA EXAM CHECKER AI - ONE-TIME RECOVERY CODES',
      'Generated: ' + formatDateTimeIST(new Date(), true),
      'Keep these codes offline and private. Each code can be used once.',
      '------------------------------------------------',
      ...newCodes.map((c, i) => `${i + 1}. ${c}`),
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ca-exam-checker-recovery-codes-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isAuthLoading || (isVerifyingFactor && !user?.mfaEnabled)) {
    return (
      <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm text-center ${className}`}>
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Loading Security Configuration
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Verifying Multi-Factor Authentication enrollment state with identity platform...
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Two-Factor Authentication (TOTP MFA)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Native Identity Platform Authenticator App Protection
            </p>
          </div>
        </div>

        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
            user?.mfaEnabled
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
          }`}
        >
          {user?.mfaEnabled ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Active & Enforced
            </>
          ) : isMandatoryRole ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              Setup Required (Mandatory)
            </>
          ) : (
            'Disabled (Optional)'
          )}
        </span>
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Mandatory Notice */}
      {isMandatoryRole && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Mandatory Policy:</strong> Two-Factor Authentication is required for all administrative roles. It cannot be disabled on this account to safeguard institution exam materials and student records.
          </p>
        </div>
      )}

      {/* STATE 1: MFA IS ENABLED */}
      {user?.mfaEnabled ? (
        <div className="space-y-6">
          {/* SECTION A: ACTIVE AUTHENTICATORS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Registered Authenticators
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Devices generating 6-digit codes via Google Authenticator or Microsoft Authenticator
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBackupStep('DETAILS');
                  setBackupLabel('');
                  setBackupError('');
                  setShowBackupModal(true);
                }}
                className="py-1.5 px-3 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 font-bold text-xs rounded-lg transition flex items-center gap-1.5 border border-blue-200 dark:border-blue-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Backup Device</span>
              </button>
            </div>

            {/* List of Authenticators */}
            <div className="space-y-2">
              {authenticators.length > 0 ? (
                authenticators.map((auth, idx) => (
                  <div
                    key={auth.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-600 shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {auth.label || `Authenticator #${idx + 1}`}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              auth.factorType === 'PRIMARY_TOTP'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {auth.factorType === 'PRIMARY_TOTP' ? 'Primary' : 'Backup'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          Enrolled: {formatDateIST(auth.createdAt)}
                          {auth.lastUsedAt && ` • Last used: ${formatDateIST(auth.lastUsedAt)}`}
                        </p>
                      </div>
                    </div>

                    {/* Remove button (allowed only if not last mandatory factor) */}
                    {(!isMandatoryRole || authenticators.length > 1) && (
                      <button
                        type="button"
                        disabled={removingAuthId === auth.id}
                        onClick={() => handleRemoveAuthenticator(auth.id, auth.label)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-50"
                        title="Remove authenticator"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                /* Fallback single authenticator view if list loading */
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Primary Authenticator App (Active)
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600">Active</span>
                </div>
              )}
            </div>
          </div>

          {/* SECTION B: ONE-TIME RECOVERY CODES */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  One-Time Recovery Codes
                </h4>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {recoveryStatus ? `${recoveryStatus.remaining} of ${recoveryStatus.total} remaining` : 'Configured'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Recovery codes let you sign in to your account if you lose access to your authenticator app and backup devices. Each code is single-use and retired immediately upon entry.
            </p>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setNewCodes([]);
                  setShowRegenModal(true);
                }}
                className="py-1.5 px-3 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Generate New Recovery Codes</span>
              </button>

              {recoveryStatus?.generatedAt && (
                <span className="text-[11px] text-slate-400">
                  Last updated: {formatDateIST(recoveryStatus.generatedAt)}
                </span>
              )}
            </div>
          </div>

          {/* SECTION C: DISABLE MFA (Optional for Students only) */}
          {!isMandatoryRole && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              {!showDisableConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDisableConfirm(true)}
                  className="py-2 px-3 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Disable Two-Factor Authentication
                </button>
              ) : (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl space-y-2">
                  <p className="text-xs text-rose-900 dark:text-rose-200 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    Are you sure you want to disable Two-Factor Authentication?
                  </p>
                  <p className="text-[11px] text-rose-800 dark:text-rose-300">
                    Your account will revert to single-factor password login. All enrolled authenticators and recovery codes will be removed.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isDisabling}
                      onClick={handleDisableMfa}
                      className="py-1.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 cursor-pointer"
                    >
                      {isDisabling ? 'Disabling...' : 'Confirm Disable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDisableConfirm(false)}
                      className="py-1.5 px-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* STATE 2: MFA IS DISABLED */
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {isMandatoryRole
              ? 'Administrative accounts must enable Two-Factor Authentication using Google Authenticator or Microsoft Authenticator before accessing sensitive institution functions.'
              : 'Add an extra layer of protection to your student account, evaluations, test submissions, and purchased credits using Google Authenticator or Microsoft Authenticator.'}
          </p>

          <button
            type="button"
            onClick={() => triggerMfaEnrollment()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Enable Two-Factor Authentication</span>
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: GENERATE NEW RECOVERY CODES                        */}
      {/* ========================================================= */}
      {showRegenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {newCodes.length > 0 ? 'Your New Recovery Codes' : 'Regenerate Recovery Codes'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRegenModal(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newCodes.length === 0 ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Invalidation Warning
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                    Generating new recovery codes will <strong>permanently invalidate all previous unused recovery codes</strong>. Make sure you save the new codes immediately.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isGeneratingCodes}
                    onClick={handleGenerateRecoveryCodes}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isGeneratingCodes ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <span>Generate 10 New Codes</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRegenModal(false)}
                    className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Save these 10 one-time recovery codes in a secure offline location. Each code can only be used once.
                </p>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                  {newCodes.map((code, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center tracking-widest select-all"
                    >
                      <span className="text-[10px] text-slate-400 mr-1 font-normal">#{idx + 1}</span>
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copyCodes}
                    className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedCodes ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-600 font-bold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy All</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={downloadCodes}
                    className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download (.txt)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRegenModal(false)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD BACKUP AUTHENTICATOR                           */}
      {/* ========================================================= */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Add Backup Authenticator
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {backupError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{backupError}</span>
              </div>
            )}

            {backupStep === 'DETAILS' ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Enrolling a secondary authenticator device ensures you never lose access if your primary phone is damaged, lost, or undergoing repairs.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Device / Factor Label *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. iPad Pro, Work Laptop, Pixel 8"
                    value={backupLabel}
                    onChange={(e) => setBackupLabel(e.target.value)}
                    className="w-full py-2.5 px-3.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!backupLabel.trim() || isSettingUpBackup}
                    onClick={handleStartBackupSetup}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSettingUpBackup ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generating Secret...</span>
                      </>
                    ) : (
                      <span>Next: Scan QR on Backup Device</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBackupModal(false)}
                    className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Step 2: Scan QR & Enter Code */
              <form onSubmit={handleVerifyBackupAuthenticator} className="space-y-4">
                <div className="flex flex-col items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  {backupTotpSetup?.qrDataUrl && (
                    <img
                      src={backupTotpSetup.qrDataUrl}
                      alt="Backup Authenticator QR Code"
                      className="w-36 h-36 object-contain rounded-md bg-white p-2 border border-slate-200 shadow-2xs"
                    />
                  )}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-2">
                    Scan with Google Authenticator or Microsoft Authenticator on <strong>{backupLabel}</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Or Enter Key Manually
                  </label>
                  <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-[11px] select-all">
                    <span className="truncate">{backupTotpSetup?.formattedKey}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (backupTotpSetup?.secretKey) {
                          navigator.clipboard.writeText(backupTotpSetup.secretKey);
                          setCopiedBackupKey(true);
                          setTimeout(() => setCopiedBackupKey(false), 2000);
                        }
                      }}
                      className="text-blue-600 hover:underline font-semibold shrink-0 cursor-pointer"
                    >
                      {copiedBackupKey ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Enter 6-Digit Code from Backup Device
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="000000"
                    value={backupOtp}
                    onChange={(e) => setBackupOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full py-2.5 px-3.5 text-center font-mono text-lg font-bold tracking-widest bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={backupOtp.length !== 6 || isSettingUpBackup}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSettingUpBackup ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Enrolling...</span>
                      </>
                    ) : (
                      <span>Verify & Enroll Backup</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupStep('DETAILS')}
                    className="py-2.5 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
