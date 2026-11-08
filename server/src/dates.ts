export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A follow-up day is empty, or today or later. */
export function followUpDate(value: unknown): { date: string | null; error?: string } {
  const raw = String(value ?? '').trim();
  if (!raw) return { date: null };
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { date: null, error: 'Follow-up date must be a calendar date' };
  if (day < todayISO()) return { date: null, error: 'Follow-up date must be today or later' };
  return { date: day };
}
