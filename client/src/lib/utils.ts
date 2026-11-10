export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export function formatAxisCurrency(amount: number): string {
  const n = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (n >= 10000000) return `${sign}${(n / 10000000).toFixed(n >= 100000000 ? 0 : 1)}Cr`;
  if (n >= 100000) return `${sign}${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L`;
  if (n >= 1000) return `${sign}${(n / 1000).toFixed(0)}k`;
  return `${sign}${Math.round(n)}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const day = dateStr.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatStay(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  const from = start.slice(0, 10);
  const to = (end || '').slice(0, 10);
  if (!to || to === from) return formatDate(from);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function roleLabel(role?: string | null): string {
  return ({
    admin: 'Admin',
    manager: 'Sales manager',
    executive: 'Sales executive',
    call_center: 'Call center',
    agent: 'Travel agent',
  } as Record<string, string>)[role || ''] || (role || '');
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const SEGMENTS = ['Rooms', 'Corporate', 'Events', 'Banquets'] as const;
export const CALL_TYPES = ['Cold Call', 'Follow-up', 'Inbound', 'Site Tour', 'Email Follow-up'] as const;
export const CALL_OUTCOMES = ['Interested', 'Callback Requested', 'Proposal Sent', 'Not Interested', 'No Answer', 'Closed Won', 'Closed Lost'] as const;
export const PIPELINE_STAGES = ['Prospect', 'Qualified', 'Site Visit', 'Proposal Sent', 'Negotiation', 'Contracted', 'Closed Won', 'Closed Lost'] as const;
export const ACCOUNT_TYPES = ['Corporate', 'Travel Agency', 'Wedding Planner', 'Event Company', 'Government', 'NGO', 'Individual', 'Other'] as const;
export const MEETING_PURPOSES = ['Sales Visit', 'Site Inspection', 'Proposal Presentation', 'Contract Signing', 'Relationship Building', 'Follow-up'] as const;

export const SEGMENT_COLORS: Record<string, string> = {
  Rooms: 'bg-blue-100 text-blue-800',
  Corporate: 'bg-purple-100 text-purple-800',
  Events: 'bg-green-100 text-green-800',
  Banquets: 'bg-orange-100 text-orange-800',
};

export const STAGE_COLORS: Record<string, string> = {
  Prospect: 'bg-gray-100 text-gray-700',
  Qualified: 'bg-blue-100 text-blue-700',
  'Site Visit': 'bg-yellow-100 text-yellow-700',
  'Proposal Sent': 'bg-indigo-100 text-indigo-700',
  Negotiation: 'bg-orange-100 text-orange-700',
  Contracted: 'bg-teal-100 text-teal-700',
  'Closed Won': 'bg-green-100 text-green-700',
  'Closed Lost': 'bg-red-100 text-red-700',
};

export const OUTCOME_COLORS: Record<string, string> = {
  'Interested': 'bg-green-100 text-green-700',
  'Callback Requested': 'bg-yellow-100 text-yellow-700',
  'Proposal Sent': 'bg-blue-100 text-blue-700',
  'Not Interested': 'bg-red-100 text-red-700',
  'No Answer': 'bg-gray-100 text-gray-700',
  'Closed Won': 'bg-emerald-100 text-emerald-700',
  'Closed Lost': 'bg-rose-100 text-rose-700',
};

export function gradeColor(grade: string): string {
  return { A: 'text-green-600', B: 'text-blue-600', C: 'text-yellow-600', D: 'text-red-600' }[grade] || 'text-gray-500';
}

// Agent Network
export const AGENT_TYPES = ['Travel Agent', 'DMC', 'Corporate', 'OTA', 'MICE Agency', 'Wedding Planner', 'Tour Operator', 'Event Company', 'Airlines', 'Consulate / Embassy', 'Other'] as const;
export const AGENT_SPECIALIZATIONS = ['Leisure', 'Business / Corporate', 'MICE', 'Wedding & Social', 'Groups & FIT', 'Adventure', 'Luxury', 'Budget'] as const;
export const AGENT_TIERS = ['A', 'B', 'C', 'D'] as const;
export const AGENT_STATUSES = ['Active', 'Dormant', 'Inactive'] as const;
export const FOLLOW_UP_FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Bi-annual', 'Annual'] as const;
export const ACTIVITY_TYPES = ['Call', 'Email', 'WhatsApp', 'Meeting', 'Site Visit', 'Fam Trip', 'Rate Sheet Sent', 'Newsletter', 'Other'] as const;
export const ACTIVITY_OUTCOMES = ['Interested', 'Sent Rates', 'Booked', 'No Response', 'Follow-up Needed', 'Not Interested', 'Meeting Scheduled'] as const;

export const TIER_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  A: { label: 'Tier A', color: 'bg-yellow-100 text-yellow-800', desc: 'Top Producer' },
  B: { label: 'Tier B', color: 'bg-blue-100 text-blue-800', desc: 'Active' },
  C: { label: 'Tier C', color: 'bg-gray-100 text-gray-700', desc: 'Potential' },
  D: { label: 'Tier D', color: 'bg-red-100 text-red-600', desc: 'Dormant' },
};

export const DUE_STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  'On Track':       { color: 'text-green-700',  bg: 'bg-green-100',  dot: 'bg-green-500',  label: 'On Track' },
  'Due Today':      { color: 'text-yellow-700', bg: 'bg-yellow-100', dot: 'bg-yellow-500', label: 'Due Today' },
  'Overdue':        { color: 'text-red-700',    bg: 'bg-red-100',    dot: 'bg-red-500',    label: 'Overdue' },
  'Never Contacted':{ color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400',   label: 'Never Contacted' },
};

// CSV export
export function exportCSV(filename: string, rows: Record<string, any>[], columns: { key: string; label: string }[]) {
  const header = columns.map(c => `"${c.label}"`).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const v = row[c.key] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function overdueUrgencyColor(daysOverdue: number): string {
  if (daysOverdue === 0) return 'border-l-yellow-400 bg-yellow-50';
  if (daysOverdue <= 3) return 'border-l-orange-400 bg-orange-50';
  return 'border-l-red-500 bg-red-50';
}
