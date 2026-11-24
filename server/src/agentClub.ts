import { v4 as uuidv4 } from 'uuid';
import db from './db';

export const INCENTIVE_METRICS = [
  { key: 'enquiries', label: 'Enquiries sent this month' },
  { key: 'bookings', label: 'Bookings confirmed this month' },
  { key: 'revenue', label: 'Revenue confirmed this month' },
] as const;

export const DEFAULT_LOYALTY = {
  tiers: [
    { name: 'Partner', lifetime: 0, multiplier: 1, nightPrice: 8000 },
    { name: 'Silver', lifetime: 50000, multiplier: 1.25, nightPrice: 6000 },
    { name: 'Gold', lifetime: 200000, multiplier: 1.5, nightPrice: 5000 },
  ],
};

export interface LoyaltyTier {
  name: string;
  lifetime: number;
  multiplier: number;
  nightPrice: number;
}

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function loyaltyTiers(): LoyaltyTier[] {
  const row = db.prepare(`SELECT value FROM settings WHERE key='agent_loyalty'`).get() as { value: string } | undefined;
  let parsed: { tiers?: unknown } | null = null;
  if (row?.value) {
    try { parsed = JSON.parse(row.value); } catch { parsed = null; }
  }
  const raw = Array.isArray(parsed?.tiers) ? parsed!.tiers : DEFAULT_LOYALTY.tiers;
  const tiers = raw.map((item: any) => ({
    name: String(item?.name || 'Partner').slice(0, 40),
    lifetime: Math.max(0, Number(item?.lifetime) || 0),
    multiplier: Math.max(1, Number(item?.multiplier) || 1),
    nightPrice: Math.max(1, Math.round(Number(item?.nightPrice) || 8000)),
  })).sort((a, b) => a.lifetime - b.lifetime);
  if (!tiers.length || tiers[0].lifetime !== 0) {
    tiers.unshift({ name: 'Partner', lifetime: 0, multiplier: 1, nightPrice: tiers[0]?.nightPrice || 8000 });
  }
  return tiers;
}

export function saveLoyalty(tiers: LoyaltyTier[]) {
  const clean = tiers
    .map(t => ({
      name: String(t.name || '').trim().slice(0, 40),
      lifetime: Math.max(0, Math.round(Number(t.lifetime) || 0)),
      multiplier: Math.max(1, Number(t.multiplier) || 1),
      nightPrice: Math.max(1, Math.round(Number(t.nightPrice) || 0)),
    }))
    .filter(t => t.name)
    .sort((a, b) => a.lifetime - b.lifetime);
  if (!clean.length) return { error: 'Add at least one tier' };
  clean[0].lifetime = 0;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('agent_loyalty', JSON.stringify({ tiers: clean }));
  return { tiers: clean };
}

export function walletBalance(agentId: string) {
  return (db.prepare('SELECT COALESCE(SUM(amount),0) as n FROM agent_wallet WHERE agent_id=?').get(agentId) as { n: number }).n;
}

export function lifetimeEarned(agentId: string) {
  return (db.prepare('SELECT COALESCE(SUM(amount),0) as n FROM agent_wallet WHERE agent_id=? AND amount>0').get(agentId) as { n: number }).n;
}

export function tierFor(lifetime: number, tiers = loyaltyTiers()) {
  let current = tiers[0];
  for (const tier of tiers) {
    if (lifetime >= tier.lifetime) current = tier;
  }
  const next = tiers.find(t => t.lifetime > current.lifetime) || null;
  return { current, next };
}

export function walletView(agentId: string) {
  const balance = Math.round(walletBalance(agentId));
  const lifetime = Math.round(lifetimeEarned(agentId));
  const { current, next } = tierFor(lifetime);
  const into = current.nightPrice > 0 ? balance % current.nightPrice : 0;
  return {
    balance,
    lifetime,
    tier: current.name,
    multiplier: current.multiplier,
    nightPrice: current.nightPrice,
    nextTier: next?.name || null,
    nextTierAt: next?.lifetime ?? null,
    rupeesToTier: next ? Math.max(0, next.lifetime - lifetime) : 0,
    nightsReady: current.nightPrice > 0 ? Math.floor(balance / current.nightPrice) : 0,
    rupeesToNextNight: balance > 0 && into === 0 ? 0 : current.nightPrice - into,
  };
}

function addWallet(agentId: string, amount: number, reason: string, extra: { leadId?: string | null; incentiveId?: string | null; month?: string | null; note?: string | null } = {}) {
  const rupees = Math.round(amount);
  if (!rupees) return 0;
  db.prepare(`INSERT INTO agent_wallet (id, agent_id, amount, reason, lead_id, incentive_id, month, note, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    uuidv4(), agentId, rupees, reason, extra.leadId || null, extra.incentiveId || null, extra.month || null, extra.note || null, new Date().toISOString(),
  );
  return rupees;
}

export function commissionAmount(agent: { commission_type?: string; commission_rate?: number }, revenue: number, multiplier: number) {
  const rate = Number(agent.commission_rate) || 0;
  if (rate <= 0) return 0;
  const base = agent.commission_type === 'fixed' ? rate : (Number(revenue) || 0) * rate / 100;
  return Math.round(base * multiplier);
}

export function awardCommission(agentId: string, leadId: string, revenue: number) {
  const existing = db.prepare(`SELECT 1 FROM agent_wallet WHERE agent_id=? AND lead_id=? AND reason='commission'`).get(agentId, leadId);
  if (existing) return 0;
  const agent = db.prepare('SELECT commission_type, commission_rate FROM agents WHERE id=?').get(agentId) as { commission_type?: string; commission_rate?: number } | undefined;
  if (!agent) return 0;
  const { current } = tierFor(lifetimeEarned(agentId));
  const amount = commissionAmount(agent, revenue, current.multiplier);
  if (!amount) return 0;
  const label = agent.commission_type === 'fixed'
    ? `₹${amount.toLocaleString('en-IN')} per confirmed booking`
    : `${agent.commission_rate}% of ₹${Math.round(revenue).toLocaleString('en-IN')}`;
  return addWallet(agentId, amount, 'commission', { leadId, month: monthKey(), note: label });
}

export function metricActual(agentId: string, metric: string, month = monthKey()) {
  if (metric === 'enquiries') {
    return (db.prepare(`SELECT COUNT(*) as c FROM leads WHERE agent_id=? AND substr(created_at,1,7)=?`).get(agentId, month) as { c: number }).c;
  }
  if (metric === 'bookings') {
    return (db.prepare(`SELECT COUNT(*) as c FROM leads WHERE agent_id=? AND stage='Closed Won' AND substr(updated_at,1,7)=?`).get(agentId, month) as { c: number }).c;
  }
  if (metric === 'revenue') {
    return (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as n FROM leads WHERE agent_id=? AND stage='Closed Won' AND substr(updated_at,1,7)=?`).get(agentId, month) as { n: number }).n;
  }
  return 0;
}

export function settleIncentives(agentId: string) {
  const month = monthKey();
  const rows = db.prepare('SELECT * FROM agent_incentives WHERE agent_id=?').all(agentId) as any[];
  const posted: { task: string; amount: number }[] = [];
  for (const row of rows) {
    const already = db.prepare(`SELECT 1 FROM agent_wallet WHERE incentive_id=? AND month=? AND reason='incentive'`).get(row.id, month);
    if (already) continue;
    const actual = metricActual(agentId, row.metric, month);
    if (actual < Number(row.target_value)) continue;
    const { current } = tierFor(lifetimeEarned(agentId));
    const revenue = metricActual(agentId, 'revenue', month);
    const base = row.pay_type === 'percent' ? revenue * Number(row.rate) / 100 : Number(row.rate);
    const amount = Math.round(base * current.multiplier);
    if (amount <= 0) continue;
    addWallet(agentId, amount, 'incentive', { incentiveId: row.id, month, note: row.task });
    posted.push({ task: row.task, amount });
  }
  return posted;
}

export function incentiveProgress(agentId: string) {
  const month = monthKey();
  const rows = db.prepare('SELECT * FROM agent_incentives WHERE agent_id=? ORDER BY created_at').all(agentId) as any[];
  return rows.map(row => {
    const actual = metricActual(agentId, row.metric, month);
    const paid = db.prepare(`SELECT amount FROM agent_wallet WHERE incentive_id=? AND month=? AND reason='incentive'`).get(row.id, month) as { amount: number } | undefined;
    return {
      id: row.id,
      task: row.task,
      metric: row.metric,
      target_value: row.target_value,
      pay_type: row.pay_type,
      rate: row.rate,
      actual,
      paid: Boolean(paid),
      paid_amount: paid ? paid.amount : 0,
    };
  });
}

export function readCommission(body: Record<string, unknown>) {
  const type = body.commission_type === 'fixed' ? 'fixed' : body.commission_type === 'percent' ? 'percent' : null;
  if (!type && body.commission_rate === undefined && body.commission_type === undefined) return null;
  const rate = Number(body.commission_rate);
  if (!Number.isFinite(rate) || rate < 0) return { error: 'Enter a commission of zero or more' };
  if ((type || 'percent') === 'percent' && rate > 100) return { error: 'Commission percent cannot be more than 100' };
  return { type: type || 'percent', rate };
}

export function readIncentive(body: Record<string, unknown>) {
  const task = String(body.task || '').trim();
  const metric = String(body.metric || '');
  const payType = body.pay_type === 'percent' ? 'percent' : body.pay_type === 'fixed' ? 'fixed' : '';
  const target = Number(body.target_value);
  const rate = Number(body.rate);
  if (!task) return { error: 'Name the incentive' };
  if (!INCENTIVE_METRICS.some(m => m.key === metric)) return { error: 'Choose what the incentive measures' };
  if (!payType) return { error: 'Choose a fixed amount or a percent' };
  if (!Number.isFinite(target) || target <= 0) return { error: 'Enter a target above zero' };
  if (!Number.isFinite(rate) || rate <= 0) return { error: 'Enter how much the incentive pays' };
  if (payType === 'percent' && rate > 100) return { error: 'Percent cannot be more than 100' };
  return { task, metric, pay_type: payType, target_value: target, rate };
}
