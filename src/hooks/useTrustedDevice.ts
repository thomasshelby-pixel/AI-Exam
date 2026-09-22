import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest, getOrCreateDeviceId, ApiError } from '../api/client.js';

export interface DeviceTrustState {
  /** True if the device has a valid, non-expired 365-day credential stored in the secure HttpOnly cookie */
  isTrusted: boolean;
  /** True while the initial or on-demand check for the HttpOnly credential is in flight */
  isLoading: boolean;
  /** Alias for isLoading */
  isChecking: boolean;
  /** True while a TOTP validation or trust mutation request is pending */
  isValidating: boolean;
  /** True if server-side Two-Factor Authentication is required because the current browser is untrusted */
  requiresTotp: boolean;
  /** Stable unique client device identifier */
  deviceId: string;
  /** ISO date string when device trust expires (365 days from verification) */
  trustExpiresAt: string | null;
  /** ISO date string when device was last recognized */
  lastUsedAt: string | null;
  /** Error message if any operation failed */
  error: string | null;
}

export interface TotpValidationResult {
  success: boolean;
  isTrusted: boolean;
  deviceTrusted?: boolean;
  bypassed?: boolean;
  message: string;
  token?: string;
  trustExpiresAt?: string;
  deviceId?: string;
  user?: any;
  error?: string;
}

export interface UseTrustedDeviceOptions {
  /** Whether to automatically query device trust on mount (defaults to true) */
  autoCheck?: boolean;
  /** Optional user identifier if context is already available */
  userId?: string;
  /** Optional temporary MFA session token from the login challenge phase */
  mfaSessionToken?: string;
  /** Optional callback fired when device trust status is updated */
  onTrustChange?: (isTrusted: boolean) => void;
}

export interface UseTrustedDeviceReturn extends DeviceTrustState {
  /**
   * Re-evaluates whether the device-specific credential stored in the secure HttpOnly cookie
   * is active, valid, and unexpired on the server.
   */
  checkDeviceTrust: (customMfaSessionToken?: string) => Promise<{
    isTrusted: boolean;
    requiresTotp: boolean;
    expiresAt?: string | null;
  }>;

  /**
   * Implements server-side TOTP validation logic ONLY for untrusted browsers.
   * - If the browser is ALREADY trusted via its HttpOnly cookie, server-side TOTP challenge is bypassed.
   * - If the browser is UNTRUSTED, it executes strict server-side TOTP validation against the authenticator,
   *   issues the 365-day secure HttpOnly cookie upon success, and marks the device as trusted.
   */
  validateTotp: (
    otpCode: string,
    options?: {
      mfaSessionToken?: string;
      rememberDevice?: boolean;
      deviceName?: string;
    }
  ) => Promise<TotpValidationResult>;

  /**
   * Explicitly marks this browser as trusted and sets the 365-day secure HttpOnly cookie.
   */
  trustCurrentDevice: (deviceName?: string) => Promise<boolean>;

  /**
   * Revokes trust for this browser, invalidates its record on the server, and clears the HttpOnly cookie.
   */
  revokeCurrentDevice: () => Promise<boolean>;

  /**
   * Revokes all trusted devices for the current user, requiring TOTP on next sign-in across all browsers.
   */
  revokeAllDevices: () => Promise<boolean>;

  /**
   * Clears any active error message.
   */
  clearError: () => void;
}

/**
 * Custom React hook that checks for a device-specific credential stored in a secure HttpOnly cookie
 * and implements server-side TOTP validation logic only for untrusted browsers.
 */
export function useTrustedDevice(options: UseTrustedDeviceOptions = {}): UseTrustedDeviceReturn {
  const {
    autoCheck = true,
    mfaSessionToken: initialMfaSessionToken,
    onTrustChange,
  } = options;

  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [isTrusted, setIsTrusted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(autoCheck);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [requiresTotp, setRequiresTotp] = useState<boolean>(false);
  const [trustExpiresAt, setTrustExpiresAt] = useState<string | null>(null);
  const [lastUsedAt, setLastUsedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Queries the server to inspect the device-specific credential stored in the secure HttpOnly cookie (ca_trust_token).
   * Because HttpOnly cookies are protected from client JavaScript XSS theft, this check is conducted
   * over an authoritative server round-trip with credentials: 'include'.
   */
  const checkDeviceTrust = useCallback(
    async (customMfaSessionToken?: string) => {
      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const sessionToken = customMfaSessionToken || initialMfaSessionToken;
        const queryParams = new URLSearchParams();
        queryParams.set('deviceId', deviceId);
        if (sessionToken) {
          queryParams.set('mfaSessionToken', sessionToken);
        }

        const res = await apiRequest<{
          success: boolean;
          isTrusted: boolean;
          requiresTotp: boolean;
          expiresAt?: string | null;
          lastUsedAt?: string | null;
          status?: string;
          message?: string;
        }>(`/api/auth/mfa/trusted-device/check?${queryParams.toString()}`, {
          method: 'GET',
        });

        if (isMountedRef.current) {
          const trusted = Boolean(res.isTrusted);
          setIsTrusted(trusted);
          setRequiresTotp(Boolean(res.requiresTotp));
          setTrustExpiresAt(res.expiresAt || null);
          setLastUsedAt(res.lastUsedAt || null);
          setIsLoading(false);

          if (onTrustChange) {
            onTrustChange(trusted);
          }
        }

        return {
          isTrusted: Boolean(res.isTrusted),
          requiresTotp: Boolean(res.requiresTotp),
          expiresAt: res.expiresAt || null,
        };
      } catch (err: any) {
        const errorMsg =
          err instanceof ApiError ? err.message : err?.message || 'Failed to check device trust status.';
        if (isMountedRef.current) {
          // If check fails (e.g. unauthenticated or network error), safely treat as untrusted requiring TOTP
          setIsTrusted(false);
          setRequiresTotp(true);
          setError(errorMsg);
          setIsLoading(false);
        }
        return {
          isTrusted: false,
          requiresTotp: true,
          expiresAt: null,
        };
      }
    },
    [deviceId, initialMfaSessionToken, onTrustChange]
  );

  /**
   * Implements server-side TOTP validation logic ONLY for untrusted browsers.
   */
  const validateTotp = useCallback(
    async (
      otpCode: string,
      callOptions: {
        mfaSessionToken?: string;
        rememberDevice?: boolean;
        deviceName?: string;
      } = {}
    ): Promise<TotpValidationResult> => {
      if (isMountedRef.current) {
        setIsValidating(true);
        setError(null);
      }

      const activeSessionToken = callOptions.mfaSessionToken || initialMfaSessionToken;

      try {
        // Fast-path: If the browser is ALREADY verified as trusted via the HttpOnly cookie,
        // send request to let server authoritatively confirm trust & bypass TOTP code requirements.
        const res = await apiRequest<{
          success: boolean;
          isTrusted: boolean;
          deviceTrusted?: boolean;
          bypassed?: boolean;
          message: string;
          token?: string;
          trustExpiresAt?: string;
          deviceId?: string;
          user?: any;
        }>('/api/auth/mfa/validate-totp', {
          method: 'POST',
          body: JSON.stringify({
            otpCode: otpCode.trim(),
            deviceId,
            mfaSessionToken: activeSessionToken,
            rememberDevice: callOptions.rememberDevice ?? true,
            deviceName: callOptions.deviceName,
          }),
        });

        if (isMountedRef.current) {
          setIsTrusted(true);
          setRequiresTotp(false);
          setTrustExpiresAt(res.trustExpiresAt || null);
          setIsValidating(false);

          if (onTrustChange) {
            onTrustChange(true);
          }
        }

        return {
          success: true,
          isTrusted: true,
          deviceTrusted: true,
          bypassed: res.bypassed,
          message: res.message || 'Device verified and trusted for 365 days.',
          token: res.token,
          trustExpiresAt: res.trustExpiresAt,
          deviceId: res.deviceId || deviceId,
          user: res.user,
        };
      } catch (err: any) {
        const errorMsg =
          err instanceof ApiError ? err.message : err?.message || 'TOTP validation failed. Please try again.';
        if (isMountedRef.current) {
          setError(errorMsg);
          setIsValidating(false);
        }
        return {
          success: false,
          isTrusted: false,
          message: errorMsg,
          error: errorMsg,
        };
      }
    },
    [deviceId, initialMfaSessionToken, onTrustChange]
  );

  /**
   * Explicitly marks this browser as trusted and triggers setting of the 365-day HttpOnly cookie.
   */
  const trustCurrentDevice = useCallback(
    async (deviceName?: string): Promise<boolean> => {
      try {
        const res = await apiRequest<{ success: boolean; trustExpiresAt?: string }>('/api/auth/mfa/trusted-device/check', {
          method: 'POST',
          body: JSON.stringify({ deviceId, deviceName }),
        });

        if (isMountedRef.current && res.success) {
          setIsTrusted(true);
          setRequiresTotp(false);
          if (res.trustExpiresAt) {
            setTrustExpiresAt(res.trustExpiresAt);
          }
        }
        return Boolean(res.success);
      } catch {
        return false;
      }
    },
    [deviceId]
  );

  /**
   * Revokes trust for this browser, invalidates the server-side record, and clears the HttpOnly cookie.
   */
  const revokeCurrentDevice = useCallback(async (): Promise<boolean> => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      await apiRequest('/api/auth/mfa/trusted-device/revoke', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });

      if (isMountedRef.current) {
        setIsTrusted(false);
        setRequiresTotp(true);
        setTrustExpiresAt(null);
        setIsLoading(false);

        if (onTrustChange) {
          onTrustChange(false);
        }
      }
      return true;
    } catch (err: any) {
      const errorMsg =
        err instanceof ApiError ? err.message : err?.message || 'Failed to revoke device trust.';
      if (isMountedRef.current) {
        setError(errorMsg);
        setIsLoading(false);
      }
      return false;
    }
  }, [deviceId, onTrustChange]);

  /**
   * Revokes all trusted devices for the user across all browsers.
   */
  const revokeAllDevices = useCallback(async (): Promise<boolean> => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      await apiRequest('/api/auth/mfa/trusted-devices/revoke-all', {
        method: 'POST',
      });

      if (isMountedRef.current) {
        setIsTrusted(false);
        setRequiresTotp(true);
        setTrustExpiresAt(null);
        setIsLoading(false);

        if (onTrustChange) {
          onTrustChange(false);
        }
      }
      return true;
    } catch (err: any) {
      const errorMsg =
        err instanceof ApiError ? err.message : err?.message || 'Failed to revoke all devices.';
      if (isMountedRef.current) {
        setError(errorMsg);
        setIsLoading(false);
      }
      return false;
    }
  }, [onTrustChange]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initial auto-check on mount
  useEffect(() => {
    if (autoCheck) {
      checkDeviceTrust();
    }
  }, [autoCheck, checkDeviceTrust]);

  return {
    isTrusted,
    isLoading,
    isChecking: isLoading,
    isValidating,
    requiresTotp,
    deviceId,
    trustExpiresAt,
    lastUsedAt,
    error,
    checkDeviceTrust,
    validateTotp,
    trustCurrentDevice,
    revokeCurrentDevice,
    revokeAllDevices,
    clearError,
  };
}
