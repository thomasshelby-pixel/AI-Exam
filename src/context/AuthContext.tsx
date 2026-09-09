import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types/index.js';
import { apiRequest } from '../api/client.js';

export interface SuspendedAccountInfo {
  reason: string;
  suspendedAt: string;
  userId: string;
  revocationToken: string;
}

interface AuthContextType {
  user: User | null;
  profile: Record<string, unknown> | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  suspendedAccount: SuspendedAccountInfo | null;
  clearSuspension: () => void;
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

  const clearSuspension = () => setSuspendedAccount(null);

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
        setUser(response.user);
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
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

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
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/institute/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

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
      setToken(null);
      setUser(null);
      setProfile(null);
      setSuspendedAccount(null);
    }
  };

  const isAuthenticated = !!user && !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        token,
        isAuthenticated,
        isLoading,
        suspendedAccount,
        clearSuspension,
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
