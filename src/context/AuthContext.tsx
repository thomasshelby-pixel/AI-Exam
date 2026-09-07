import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types/index.js';
import { apiRequest } from '../api/client.js';

interface AuthContextType {
  user: User | null;
  profile: Record<string, unknown> | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  demoLogin: (role?: string) => Promise<User>;
  register: (data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    icaiRegistrationNumber: string;
    caLevel: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ca_exam_checker_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
      }>('/api/auth/me');

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
    } catch {
      localStorage.removeItem('ca_exam_checker_token');
      setUser(null);
      setProfile(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem('ca_exam_checker_token', res.token);
    setToken(res.token);
    setUser(res.user);

    // Refresh profile in background without blocking immediate navigation
    refreshUser().catch(() => {});

    return res.user;
  };

  const demoLogin = async (role: string = 'STUDENT'): Promise<User> => {
    const res = await apiRequest<{ token: string; user: User }>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });

    localStorage.setItem('ca_exam_checker_token', res.token);
    setToken(res.token);
    setUser(res.user);

    refreshUser().catch(() => {});

    return res.user;
  };

  const register = async (data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    icaiRegistrationNumber: string;
    caLevel: string;
  }): Promise<User> => {
    const res = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    localStorage.setItem('ca_exam_checker_token', res.token);
    setToken(res.token);
    setUser(res.user);

    // Refresh profile in background without blocking immediate navigation
    refreshUser().catch(() => {});

    return res.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      localStorage.removeItem('ca_exam_checker_token');
      setToken(null);
      setUser(null);
      setProfile(null);
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
        login,
        register,
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
