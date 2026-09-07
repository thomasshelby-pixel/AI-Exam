export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  [key: string]: unknown;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('ca_exam_checker_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || response.statusText || 'An unexpected error occurred';
    throw new Error(errorMsg);
  }

  return data as T;
}
