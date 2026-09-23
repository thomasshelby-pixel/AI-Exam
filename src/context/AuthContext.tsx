import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types/index.js';
import { apiRequest, getOrCreateDeviceId } from '../api/client.js';
import { MfaModal } from '../components/auth/MfaModal.js';
import { logMfaDiagnostic } from '../lib/firebaseAuth.js';

export interface SuspendedAccountInfo {
  reason: string;
  suspendedAt: string;
  userId: string;
  revocationToken: string;
}

export interface MfaChallengeState {
  isOpen: boolean;
  mode: 'CHALLENGE' | 'ENROLL' | 'RECOVERY_CODE' | 'MANUAL_RECOVERY';
  mfaSessionToken: string;
  canonicalPhoneE164?: string;
  maskedPhone?: string;
  role?: string;
  onSuccess?: (user: User) => void;
  onCancel?: () => void;
}

interface AuthContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  profile: Record<string, unknown> | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  suspendedAccount: SuspendedAccountInfo | null;
  clearSuspension: () => void;
  mfaChallenge: MfaChallengeState | null;
  triggerMfaEnrollment: (phone?: string) => void;
  triggerMfaChallenge: () => Promise<void>;
  switchMfaMode: (mode: 'CHALLENGE' | 'ENROLL' | 'RECOVERY_CODE' | 'MANUAL_RECOVERY') => void;
  cancelMfaChallenge: () => void;
  closeMfaModal: () => void;
  completeMfaChallenge: (verifiedUser: User) => void;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  verifyMfaChallenge: (otpCode: string) => Promise<User>;
  verifyMfaRecoveryCode: (recoveryCode: string) => Promise<{ user: User; remainingCodes: number; warning?: string }>;
  generateRecoveryCodes: () => Promise<{ recoveryCodes: string[]; total: number }>;
  getRecoveryCodeStatus: () => Promise<{ total: number; remaining: number; hasCodes: boolean; generatedAt: string | null }>;
  getAuthenticators: () => Promise<Array<{ id: string; factorType: string; label: string; createdAt: string; lastUsedAt?: string | null }>>;
  enrollBackupAuthenticator: (label: string, firebaseFactorUid?: string) => Promise<any>;
  removeAuthenticator: (authenticatorId: string) => Promise<void>;
  submitManualRecoveryRequest: (data: { email: string; phone?: string; srnRegNo?: string; reason: string }) => Promise<{ success: boolean; requestId?: string; message?: string }>;
  resendMfaChallenge: () => Promise<void>;
  sendMfaEnrollCode: (phone: string) => Promise<{ maskedPhone: string }>;
  verifyMfaEnroll: (phone: string, otpCode?: string, verificationId?: string, idToken?: string) => Promise<User>;
  syncMfaFactor: (phone?: string) => Promise<User>;
  disableMfa: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  instituteLogin: (email: string, password: string) => Promise<User>;
  instituteRegister: (data: {
    instituteName: string;
    contactPerson: string;
    email: string;
    password: string;
    phone: string;
    address?: string;
    website?: string;
  }) => Promise<{ user: User; institute: any }>;
  register: (data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    icaiRegistrationNumber: string;
    caLevel: string;
    referralCode?: string;
  }) => Promise<User>;
  submitRevocationRequest: (appealReason: string, explanation: string, supportingInfo?: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ca_exam_checker_token'));
  const [suspendedAccount, setSuspendedAccount] = useState<SuspendedAccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallengeState | null>(null);

  const clearSuspension = () => setSuspendedAccount(null);

  const cancelMfaChallenge = () => {
    if (mfaChallenge?.onCancel) {
      mfaChallenge.onCancel();
    }
    setMfaChallenge(null);
  };

  const closeMfaModal = () => {
    setMfaChallenge(null);
  };

  const completeMfaChallenge = (verifiedUser: User) => {
    const onSuccessCb = mfaChallenge?.onSuccess;
    setMfaChallenge(null);
    if (onSuccessCb) {
      onSuccessCb(verifiedUser);
    }
  };

  const triggerMfaEnrollment = () => {
    setMfaChallenge({
      isOpen: true,
      mode: 'ENROLL',
      mfaSessionToken: '',
      role: user?.role,
    });
  };

  const triggerMfaChallenge = async (): Promise<void> => {
    try {
      await apiRequest<{ success: boolean; message: string }>('/api/auth/mfa/send-challenge', {
        method: 'POST',
      });
      setMfaChallenge({
        isOpen: true,
        mode: 'CHALLENGE',
        mfaSessionToken: '',
        role: user?.role,
      });
    } catch {
      setMfaChallenge({
        isOpen: true,
        mode: 'CHALLENGE',
        mfaSessionToken: '',
        role: user?.role,
      });
    }
  };

  const verifyMfaChallenge = async (otpCode: string): Promise<User> => {
    const deviceId = getOrCreateDeviceId();
    let res: { token: string; user: User; trustToken?: string; trustExpiresAt?: string };
    try {
      res = await apiRequest<{ token: string; user: User; trustToken?: string; trustExpiresAt?: string }>(
        '/api/auth/mfa/validate-totp',
        {
          method: 'POST',
          body: JSON.stringify({
            mfaSessionToken: mfaChallenge?.mfaSessionToken,
            otpCode,
            deviceId,
            rememberDevice: true,
          }),
        }
      );
    } catch {
      // Fallback to verify-challenge
      res = await apiRequest<{ token: string; user: User; trustToken?: string }>('/api/auth/mfa/verify-challenge', {
        method: 'POST',
        body: JSON.stringify({
          mfaSessionToken: mfaChallenge?.mfaSessionToken,
          otpCode,
          deviceId,
        }),
      });
    }

    logMfaDiagnostic('backend MFA state synchronized', {
      mfaEnabled: res.user?.mfaEnabled,
      mfaVerified: res.user?.mfaVerified,
    });

    if (res.trustToken) {
      localStorage.setItem('ca_device_trust_token', res.trustToken);
      if (res.user?.id) {
        localStorage.setItem(`ca_device_trust_token_${res.user.id}`, res.trustToken);
      }
      logMfaDiagnostic('trusted device state created');
    }

    localStorage.setItem('ca_exam_checker_token', res.token);
    setToken(res.token);

    const verifiedUser: User = {
      ...res.user,
      mfaEnabled: true,
      mfaVerified: true,
    };
    setUser(verifiedUser);
    setSuspendedAccount(null);
    setIsLoading(false);

    const onSuccessCb = mfaChallenge?.onSuccess;
    setMfaChallenge(null);

    if (onSuccessCb) {
      onSuccessCb(verifiedUser);
    }

    refreshUser().catch(() => {});
    return verifiedUser;
  };

  const resendMfaChallenge = async (): Promise<void> => {
    await apiRequest<{ success: boolean }>('/api/auth/mfa/send-challenge', {
      method: 'POST',
      body: JSON.stringify({
        mfaSessionToken: mfaChallenge?.mfaSessionToken,
      }),
    });
  };

  const sendMfaEnrollCode = async (): Promise<{ success: boolean }> => {
    return { success: true };
  };

  const verifyMfaEnroll = async (codeOrPhone: string, otpCode?: string, verificationId?: string, idToken?: string): Promise<User> => {
    logMfaDiagnostic('enrollment started');
    const deviceId = getOrCreateDeviceId();
    const actualOtp = otpCode || (codeOrPhone && codeOrPhone.length === 6 ? codeOrPhone : undefined);
    const res = await apiRequest<{ token: string; user: User; trustToken?: string }>('/api/auth/mfa/enroll/verify', {
      method: 'POST',
      body: JSON.stringify({
        otpCode: actualOtp,
        idToken,
        mfaSessionToken: mfaChallenge?.mfaSessionToken,
        deviceId,
      }),
    });

    logMfaDiagnostic('backend MFA state synchronized', {
      mfaEnabled: res.user?.mfaEnabled,
      mfaVerified: res.user?.mfaVerified,
    });

    if (res.trustToken) {
      localStorage.setItem('ca_device_trust_token', res.trustToken);
      logMfaDiagnostic('trusted device state created');
    }

    if (res.token) {
      localStorage.setItem('ca_exam_checker_token', res.token);
      setToken(res.token);
    }

    const verifiedUser: User = {
      ...res.user,
      mfaEnabled: true,
      mfaVerified: true,
    };
    setUser(verifiedUser);

    const onSuccessCb = mfaChallenge?.onSuccess;
    setMfaChallenge(null);

    try {
      await refreshUser();
      logMfaDiagnostic('auth state refreshed');
    } catch {
      // Keep verifiedUser
    }

    if (onSuccessCb && verifiedUser) {
      onSuccessCb(verifiedUser);
    }

    return verifiedUser;
  };

  const syncMfaFactor = async (): Promise<User> => {
    logMfaDiagnostic('syncing existing MFA factor');
    const deviceId = getOrCreateDeviceId();
    const res = await apiRequest<{ token: string; user: User; trustToken?: string }>('/api/auth/mfa/sync-factor', {
      method: 'POST',
      body: JSON.stringify({
        mfaSessionToken: mfaChallenge?.mfaSessionToken,
        deviceId,
      }),
    });

    logMfaDiagnostic('backend MFA factor synchronized');

    if (res.trustToken) {
      localStorage.setItem('ca_device_trust_token', res.trustToken);
    }

    if (res.token) {
      localStorage.setItem('ca_exam_checker_token', res.token);
      setToken(res.token);
    }

    const verifiedUser: User = {
      ...res.user,
      mfaEnabled: true,
      mfaVerified: true,
    };
    setUser(verifiedUser);

    try {
      await refreshUser();
    } catch {
      // Keep verifiedUser
    }

    return verifiedUser;
  };

  const switchMfaMode = (mode: 'CHALLENGE' | 'ENROLL' | 'RECOVERY_CODE' | 'MANUAL_RECOVERY') => {
    if (mfaChallenge) {
      setMfaChallenge({
        ...mfaChallenge,
        mode,
      });
    } else {
      setMfaChallenge({
        isOpen: true,
        mode,
        mfaSessionToken: '',
        role: user?.role,
      });
    }
  };

  const verifyMfaRecoveryCode = async (
    recoveryCode: string
  ): Promise<{ user: User; remainingCodes: number; warning?: string }> => {
    const deviceId = getOrCreateDeviceId();
    const res = await apiRequest<{
      token: string;
      user: User;
      trustToken?: string;
      remainingCodes: number;
      warning?: string;
    }>('/api/auth/mfa/recovery-codes/verify', {
      method: 'POST',
      body: JSON.stringify({
        mfaSessionToken: mfaChallenge?.mfaSessionToken,
        recoveryCode,
        deviceId,
      }),
    });

    logMfaDiagnostic('recovery code verified successfully', {
      remainingCodes: res.remainingCodes,
    });

    if (res.trustToken) {
      localStorage.setItem('ca_device_trust_token', res.trustToken);
    }

    if (res.token) {
      localStorage.setItem('ca_exam_checker_token', res.token);
      setToken(res.token);
    }

    const verifiedUser: User = {
      ...res.user,
      mfaEnabled: true,
      mfaVerified: true,
    };
    setUser(verifiedUser);
    setSuspendedAccount(null);

    const onSuccessCb = mfaChallenge?.onSuccess;
    setMfaChallenge(null);

    try {
      await refreshUser();
    } catch {
      // Keep verifiedUser
    }

    if (onSuccessCb) {
      onSuccessCb(verifiedUser);
    }

    return { user: verifiedUser, remainingCodes: res.remainingCodes, warning: res.warning };
  };

  const generateRecoveryCodes = async (): Promise<{ recoveryCodes: string[]; total: number }> => {
    return await apiRequest<{ success: boolean; recoveryCodes: string[]; total: number }>(
      '/api/auth/mfa/recovery-codes/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          mfaSessionToken: mfaChallenge?.mfaSessionToken,
        }),
      }
    );
  };

  const getRecoveryCodeStatus = async (): Promise<{
    total: number;
    remaining: number;
    hasCodes: boolean;
    generatedAt: string | null;
  }> => {
    return await apiRequest('/api/auth/mfa/recovery-codes/status');
  };

  const getAuthenticators = async () => {
    const res = await apiRequest<{ success: boolean; authenticators: any[] }>(
      '/api/auth/mfa/authenticators'
    );
    return res.authenticators || [];
  };

  const enrollBackupAuthenticator = async (label: string, firebaseFactorUid?: string) => {
    return await apiRequest('/api/auth/mfa/backup-authenticator/enroll', {
      method: 'POST',
      body: JSON.stringify({ label, firebaseFactorUid }),
    });
  };

  const removeAuthenticator = async (authenticatorId: string): Promise<void> => {
    await apiRequest('/api/auth/mfa/authenticators/remove', {
      method: 'POST',
      body: JSON.stringify({ authenticatorId }),
    });
    await refreshUser();
  };

  const submitManualRecoveryRequest = async (data: {
    email: string;
    phone?: string;
    srnRegNo?: string;
    reason: string;
  }) => {
    return await apiRequest<{ success: boolean; requestId?: string; message?: string }>(
      '/api/auth/mfa/recovery-request',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  };

  const disableMfa = async (): Promise<void> => {
    await apiRequest('/api/auth/mfa/disable', {
      method: 'POST',
    });
    localStorage.removeItem('ca_totp_enrolled');
    if (user) {
      setUser({ ...user, mfaEnabled: false, mfaPhone: null });
    }
    refreshUser().catch(() => {});
  };

  const handleSuspension = (payload: any): boolean => {
    const susp =
      payload?.suspension ||
      payload?.data?.suspension ||
      (payload?.status === 'SUSPENDED' && payload) ||
      (payload?.accountStatus === 'SUSPENDED' && payload);

    if (susp && (susp.reason || susp.revocationToken || susp.suspendedAt)) {
      setSuspendedAccount({
        reason: susp.reason || 'Account access suspended by the administrator.',
        suspendedAt: susp.suspendedAt || new Date().toISOString(),
        userId: susp.userId || '',
        revocationToken: susp.revocationToken || '',
      });
      return true;
    }
    return false;
  };

  const refreshUser = useCallback(async () => {
    try {
      const storedToken = localStorage.getItem('ca_exam_checker_token');
      const hasCookie = typeof document !== 'undefined' && document.cookie.includes('ca_token=');
      if (!storedToken && !hasCookie) {
        setUser(null);
        setProfile(null);
        setToken(null);
        setIsLoading(false);
        return;
      }

      const response = await apiRequest<{
        user: User | null;
        profile: Record<string, unknown> | null;
        isSuspended?: boolean;
        suspension?: SuspendedAccountInfo;
      }>('/api/auth/me');

      if (response && (response.isSuspended || response.user?.status === 'SUSPENDED') && response.suspension) {
        setSuspendedAccount(response.suspension);
        setUser(null);
        setProfile(null);
        return;
      }

      if (response && response.user) {
        setUser((prev) => {
          const shouldPreserveVerified = prev?.id === response.user!.id && prev?.mfaVerified === true;
          return {
            ...response.user!,
            mfaVerified: shouldPreserveVerified ? true : response.user!.mfaVerified,
          };
        });
        setProfile(response.profile || null);
        if (storedToken) {
          setToken(storedToken);
        } else {
          setToken('authenticated-cookie-session');
        }
      } else {
        localStorage.removeItem('ca_exam_checker_token');
        setUser(null);
        setProfile(null);
        setToken(null);
      }
    } catch (err: any) {
      if (handleSuspension(err) || handleSuspension(err?.data)) {
        setUser(null);
        setProfile(null);
      } else {
        localStorage.removeItem('ca_exam_checker_token');
        setUser(null);
        setProfile(null);
        setToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<User> => {
    try {
      const deviceId = getOrCreateDeviceId();
      const trustToken = typeof window !== 'undefined' ? localStorage.getItem('ca_device_trust_token') : null;
      const res = await apiRequest<{
        token: string;
        user: User;
        mfaRequired?: boolean;
        mfaEnrolled?: boolean;
        mfaSessionToken?: string;
        canonicalPhoneE164?: string;
        maskedPhone?: string;
        role?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceId, trustToken }),
      });

      if (res.mfaRequired && res.mfaSessionToken) {
        return new Promise<User>((resolve, reject) => {
          setMfaChallenge({
            isOpen: true,
            mode: res.mfaEnrolled ? 'CHALLENGE' : 'ENROLL',
            mfaSessionToken: res.mfaSessionToken!,
            canonicalPhoneE164: res.canonicalPhoneE164,
            maskedPhone: res.maskedPhone,
            role: res.role,
            onSuccess: (verifiedUser) => resolve(verifiedUser),
            onCancel: () => reject(new Error('MFA verification was cancelled.')),
          });
        });
      }

      localStorage.setItem('ca_exam_checker_token', res.token);
      setToken(res.token);
      setUser(res.user);
      setSuspendedAccount(null);

      refreshUser().catch(() => {});
      return res.user;
    } catch (err: any) {
      handleSuspension(err) || handleSuspension(err?.data);
      throw err;
    }
  };

  const instituteLogin = async (email: string, password: string): Promise<User> => {
    try {
      const deviceId = getOrCreateDeviceId();
      const trustToken = typeof window !== 'undefined' ? localStorage.getItem('ca_device_trust_token') : null;
      const res = await apiRequest<{
        token: string;
        user: User;
        mfaRequired?: boolean;
        mfaEnrolled?: boolean;
        mfaSessionToken?: string;
        canonicalPhoneE164?: string;
        maskedPhone?: string;
        role?: string;
      }>('/api/auth/institute/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceId, trustToken }),
      });

      if (res.mfaRequired && res.mfaSessionToken) {
        return new Promise<User>((resolve, reject) => {
          setMfaChallenge({
            isOpen: true,
            mode: res.mfaEnrolled ? 'CHALLENGE' : 'ENROLL',
            mfaSessionToken: res.mfaSessionToken!,
            canonicalPhoneE164: res.canonicalPhoneE164,
            maskedPhone: res.maskedPhone,
            role: res.role,
            onSuccess: (verifiedUser) => resolve(verifiedUser),
            onCancel: () => reject(new Error('MFA verification was cancelled.')),
          });
        });
      }

      localStorage.setItem('ca_exam_checker_token', res.token);
      setToken(res.token);
      setUser(res.user);
      setSuspendedAccount(null);

      refreshUser().catch(() => {});
      return res.user;
    } catch (err: any) {
      handleSuspension(err) || handleSuspension(err?.data);
      throw err;
    }
  };

  const instituteRegister = async (data: {
    instituteName: string;
    contactPerson: string;
    email: string;
    password: string;
    phone: string;
    address?: string;
    website?: string;
  }): Promise<{ user: User; institute: any }> => {
    const res = await apiRequest<{ token: string; user: User; institute: any }>('/api/auth/institute/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    localStorage.setItem('ca_exam_checker_token', res.token);
    setToken(res.token);
    setUser(res.user);
    setSuspendedAccount(null);

    refreshUser().catch(() => {});
    return { user: res.user, institute: res.institute };
  };

  const register = async (data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    icaiRegistrationNumber: string;
    caLevel: string;
    referralCode?: string;
  }): Promise<User> => {
    const res = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    localStorage.setItem('ca_exam_checker_token', res.token);
    setToken(res.token);
    setUser(res.user);
    setSuspendedAccount(null);

    refreshUser().catch(() => {});
    return res.user;
  };

  const submitRevocationRequest = async (
    appealReason: string,
    explanation: string,
    supportingInfo?: string
  ): Promise<{ success: boolean; message: string }> => {
    const authHeader = suspendedAccount?.revocationToken
      ? { Authorization: `Bearer ${suspendedAccount.revocationToken}` }
      : {};

    const res = await apiRequest<{ success: boolean; message: string }>('/api/auth/revocation-request', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ appealReason, explanation, supportingInfo }),
    });

    return res;
  };

  const logout = async (): Promise<void> => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      localStorage.removeItem('ca_exam_checker_token');
      localStorage.removeItem('ca_totp_enrolled');
      localStorage.removeItem('ca_device_trust_token');
      setToken(null);
      setUser(null);
      setProfile(null);
      setSuspendedAccount(null);
      setMfaChallenge(null);
    }
  };

  const isAuthenticated = !!user && !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        profile,
        token,
        isAuthenticated,
        isLoading,
        suspendedAccount,
        clearSuspension,
        mfaChallenge,
        triggerMfaEnrollment,
        triggerMfaChallenge,
        switchMfaMode,
        cancelMfaChallenge,
        closeMfaModal,
        completeMfaChallenge,
        setToken,
        verifyMfaChallenge,
        verifyMfaRecoveryCode,
        generateRecoveryCodes,
        getRecoveryCodeStatus,
        getAuthenticators,
        enrollBackupAuthenticator,
        removeAuthenticator,
        submitManualRecoveryRequest,
        resendMfaChallenge,
        sendMfaEnrollCode,
        verifyMfaEnroll,
        syncMfaFactor,
        disableMfa,
        login,
        instituteLogin,
        instituteRegister,
        register,
        submitRevocationRequest,
        logout,
        refreshUser,
      }}
    >
      {children}
      <MfaModal />
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
