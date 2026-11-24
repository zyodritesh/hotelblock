export type MetricKind = 'count' | 'revenue';

export interface MetricDef {
  key: string;
  label: string;
  kind: MetricKind;
  hint: string;
}

export const METRICS: MetricDef[] = [
  { key: 'corporate_closures', label: 'Corporate closures', kind: 'count', hint: 'Closed Won that is Corporate, or a conference, offsite, summit, board meet, or kickoff. Weddings are left out.' },
  { key: 'wedding_closures', label: 'Weddings closed', kind: 'count', hint: 'Closed Won whose title mentions wedding, reception, engagement, or shaadi.' },
  { key: 'wedding_revenue', label: 'Wedding revenue', kind: 'revenue', hint: 'Revenue on those wedding closures.' },
  { key: 'fit_revenue', label: 'FIT revenue', kind: 'revenue', hint: 'Closed Won FIT and individual room stays. Group conferences and weddings are left out.' },
  { key: 'event_revenue', label: 'Event revenue', kind: 'revenue', hint: 'Closed Won in Events, excluding weddings.' },
  { key: 'banquet_revenue', label: 'Banquet revenue', kind: 'revenue', hint: 'Closed Won in Banquets, excluding weddings.' },
  { key: 'rooms_revenue', label: 'Rooms revenue', kind: 'revenue', hint: 'Closed Won in Rooms.' },
  { key: 'corporate_revenue', label: 'Corporate revenue', kind: 'revenue', hint: 'Closed Won in Corporate.' },
];

const WEDDING = `(
  lower(title) LIKE '%wedding%' OR lower(title) LIKE '%shaadi%'
  OR lower(title) LIKE '%reception%' OR lower(title) LIKE '%engagement%'
  OR lower(IFNULL(notes,'')) LIKE '%wedding%'
)`;

const CORPORATE_TITLE = `(
  lower(title) LIKE '%corporate%' OR lower(title) LIKE '%offsite%'
  OR lower(title) LIKE '%conference%' OR lower(title) LIKE '%summit%'
  OR lower(title) LIKE '%board%' OR lower(title) LIKE '%kickoff%'
)`;

const FIT = `(
  lower(' '||title||' '||IFNULL(notes,'')) LIKE '% fit %'
  OR lower(title) LIKE 'fit %'
  OR lower(IFNULL(notes,'')) LIKE '%fit client%'
  OR (
    segment = 'Rooms'
    AND NOT ${WEDDING}
    AND lower(title) NOT LIKE '%conference%'
    AND lower(title) NOT LIKE '%summit%'
    AND lower(title) NOT LIKE '%offsite%'
    AND lower(title) NOT LIKE '%board%'
    AND lower(title) NOT LIKE '%mice%'
    AND lower(title) NOT LIKE '%group%'
    AND lower(title) NOT LIKE '%bulk%'
  )
)`;

function metricSelectSql(): string {
  return `
    SUM(CASE WHEN stage='Closed Won' AND NOT ${WEDDING} AND (segment='Corporate' OR ${CORPORATE_TITLE}) THEN 1 ELSE 0 END) AS corporate_closures,
    SUM(CASE WHEN stage='Closed Won' AND ${WEDDING} THEN 1 ELSE 0 END) AS wedding_closures,
    SUM(CASE WHEN stage='Closed Won' AND ${WEDDING} THEN IFNULL(estimated_revenue,0) ELSE 0 END) AS wedding_revenue,
    SUM(CASE WHEN stage='Closed Won' AND ${FIT} THEN IFNULL(estimated_revenue,0) ELSE 0 END) AS fit_revenue,
    SUM(CASE WHEN stage='Closed Won' AND segment='Events' AND NOT ${WEDDING} THEN IFNULL(estimated_revenue,0) ELSE 0 END) AS event_revenue,
    SUM(CASE WHEN stage='Closed Won' AND segment='Banquets' AND NOT ${WEDDING} THEN IFNULL(estimated_revenue,0) ELSE 0 END) AS banquet_revenue,
    SUM(CASE WHEN stage='Closed Won' AND segment='Rooms' THEN IFNULL(estimated_revenue,0) ELSE 0 END) AS rooms_revenue,
    SUM(CASE WHEN stage='Closed Won' AND segment='Corporate' THEN IFNULL(estimated_revenue,0) ELSE 0 END) AS corporate_revenue
  `;
}

export function emptyActuals(): Record<string, number> {
  return Object.fromEntries(METRICS.map(m => [m.key, 0]));
}

export function actualsFor(db: any, userIds: string[], month: string): Record<string, number> {
  const zeros = emptyActuals();
  if (!userIds.length || !/^\d{4}-\d{2}$/.test(month)) return zeros;
  const ph = userIds.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT ${metricSelectSql()}
    FROM leads
    WHERE substr(updated_at, 1, 7) = ?
      AND user_id IN (${ph})
  `).get(month, ...userIds) as any;
  const out: Record<string, number> = {};
  for (const m of METRICS) out[m.key] = Number(row?.[m.key] || 0);
  return out;
}

export interface TargetRow {
  metric: string;
  target_value: number;
  weight: number;
}

export function scoreFrom(actuals: Record<string, number>, targets: TargetRow[]) {
  const by = new Map(targets.map(t => [t.metric, t]));
  const metrics = METRICS.map(m => {
    const t = by.get(m.key);
    return {
      key: m.key,
      label: m.label,
      kind: m.kind,
      hint: m.hint,
      actual: Number(actuals[m.key] || 0),
      target: Number(t?.target_value || 0),
      weight: Number(t?.weight || 0),
      achievement: 0,
      points: 0,
    };
  });
  const active = metrics.filter(m => m.target > 0);
  const weightSum = active.reduce((s, m) => s + (m.weight > 0 ? m.weight : 1), 0) || 1;
  let total = 0;
  for (const m of metrics) {
    if (m.target <= 0) continue;
    const w = m.weight > 0 ? m.weight : 1;
    m.achievement = Math.min(100, (m.actual / m.target) * 100);
    m.points = m.achievement * (w / weightSum);
    total += m.points;
  }
  return { score: Math.round(total * 10) / 10, metrics };
}

export function incentiveAmount(calc: string, rate: number, actual: number, target: number): number {
  if (calc === 'percent') return Math.round((actual * rate) / 100);
  if (calc === 'on_target') return actual >= target && target > 0 ? Math.round(rate) : 0;
  return Math.round(actual * rate);
}
