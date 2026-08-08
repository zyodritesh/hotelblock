/**
 * Browser calls same-origin `/api/*`, which Next.js rewrites to the Nest API.
 * This avoids localhost/CORS failures in cloud previews and remote browsers.
 */
const API_URL =
  typeof window === 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    : '/api';

export type PropertySummary = {
  id: string;
  name: string;
  code: string;
  businessDate: string;
  timezone: string;
  currency: string;
};

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  tenantSlug: string;
  roles: string[];
  permissions: string[];
  properties: PropertySummary[];
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
};

function errorMessage(payload: unknown, status: number): string {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object') {
    const p = payload as { message?: unknown; error?: unknown };
    if (typeof p.message === 'string') return p.message;
    if (Array.isArray(p.message)) return p.message.join(', ');
    if (typeof p.message === 'object' && p.message && 'message' in p.message) {
      const nested = (p.message as { message?: unknown }).message;
      if (typeof nested === 'string') return nested;
    }
    if (typeof p.error === 'string') return p.error;
  }
  return `Request failed (${status})`;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(errorMessage(payload, status));
    this.status = status;
    this.payload = payload;
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export function formatINR(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (['confirmed', 'checked_in', 'active', 'vacant_clean', 'passed', 'captured'].includes(s))
    return 'ok';
  if (['hold', 'tentative', 'mapping', 'cleaning', 'inspection', 'warn'].includes(s))
    return 'warn';
  if (['cancelled', 'no_show', 'failed', 'ooo', 'oos', 'danger'].includes(s)) return 'danger';
  if (['checked_out', 'occupied', 'info'].includes(s)) return 'info';
  return 'neutral';
}

export function prettyStatus(status: string) {
  return status.replaceAll('_', ' ');
}
