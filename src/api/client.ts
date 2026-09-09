export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  [key: string]: unknown;
}

/**
 * Returns a stable unique device identifier stored in client localStorage.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_render_env';
  try {
    let deviceId = localStorage.getItem('ca_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36));
      localStorage.setItem('ca_device_id', deviceId);
    }
    return deviceId;
  } catch {
    return 'fallback_device_id';
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  accountStatus?: string;
  suspension?: any;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data?.code;
    this.accountStatus = data?.status;
    this.suspension = data?.suspension;
  }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ca_exam_checker_token') : null;
  const deviceId = getOrCreateDeviceId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Only clear token on 401 if it is an unauthenticated token expiration, not a suspended revocation call
    if (response.status === 401 && !endpoint.includes('revocation')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('ca_exam_checker_token');
      }
    }
    const errorMsg = data.error || response.statusText || 'An unexpected error occurred';
    const err = new ApiError(errorMsg, response.status, data);
    // Backward compatibility property assignments
    (err as any).statusCode = response.status;
    (err as any).accountStatus = data?.status;
    (err as any).suspension = data?.suspension;
    (err as any).code = data?.code;
    throw err;
  }

  return data as T;
}

