export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
