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
  const trustToken = typeof window !== 'undefined' ? localStorage.getItem('ca_device_trust_token') : null;
  const totpEnrolled = typeof window !== 'undefined' ? localStorage.getItem('ca_totp_enrolled') : null;
  const deviceId = getOrCreateDeviceId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
    ...(options.headers as Record<string, string>),
  };

  if (totpEnrolled === 'true' && !headers['X-Firebase-Totp-Enrolled']) {
    headers['X-Firebase-Totp-Enrolled'] = 'true';
  }

  if (trustToken && !headers['X-Device-Trust-Token']) {
    headers['X-Device-Trust-Token'] = trustToken;
  }

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

/**
 * Securely downloads or opens an authenticated file (e.g. Checked Copy, Detailed Report)
 * using the client's Bearer token.
 */
export async function downloadAuthenticatedFile(
  endpoint: string,
  options: {
    filename?: string;
    openInNewTab?: boolean;
  } = {}
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ca_exam_checker_token') : null;
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let errMsg = 'Failed to download file';
    try {
      const errData = await response.json();
      errMsg = errData.error || errData.message || errMsg;
    } catch {
      errMsg = `Download failed with HTTP ${response.status}: ${response.statusText}`;
    }
    throw new ApiError(errMsg, response.status);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  if (options.openInNewTab) {
    const newWindow = window.open(blobUrl, '_blank');
    if (!newWindow) {
      // If popup blocked, fallback to download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = options.filename || 'download.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } else {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = options.filename || 'download.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
}

