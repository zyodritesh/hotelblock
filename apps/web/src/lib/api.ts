const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(
      typeof payload === 'object' &&
        payload &&
        'message' in payload &&
        typeof (payload as { message: unknown }).message === 'string'
        ? ((payload as { message: string }).message)
        : `Request failed (${status})`,
    );
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
