import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { actualsFor } from './incentiveMetrics';
import { todayISO } from './dates';

type PlanRow = {
  id: string;
  user_id: string;
  month: string;
  focus: string;
  title: string;
  summary: string;
  daily_agent_talks: number;
  lead_rate: number;
  monthly_agent_meetings: number;
  monthly_agent_visits: number;
  monthly_whatsapp_groups: number;
  monthly_wedding_closes: number;
  monthly_corporate_closes: number;
  monthly_revenue: number;
  daily_event_talks: number;
  daily_incoming_calls: number;
  daily_revenue: number;
  name: string;
  email: string;
  role: string;
};

const MONTHS = ['2026-11', '2026-12', '2027-01'];

const KRISHAN_REVENUE: Record<string, number> = {
  '2026-11': 1000000,
  '2026-12': 1500000,
  '2027-01': 3000000,
};

export function workingDays(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    if (new Date(y, m - 1, d).getDay() !== 0) n++;
  }
  return n;
}

function workingDaysThrough(month: string, day: string): number {
  if (day.slice(0, 7) !== month) return day.slice(0, 7) > month ? workingDays(month) : 0;
  const [y, m] = month.split('-').map(Number);
  const end = Number(day.slice(8, 10));
  let n = 0;
  for (let d = 1; d <= end; d++) {
    if (new Date(y, m - 1, d).getDay() !== 0) n++;
  }
  return n;
}

function ensureUser(db: any, name: string, email: string, password: string) {
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, active) VALUES (?,?,?,?,?,1)').run(
    id, name, email, bcrypt.hashSync(password, 10), 'executive',
  );
  return id;
}

function upsertPlan(db: any, userId: string, month: string, plan: Record<string, string | number>) {
  db.prepare(`INSERT INTO sales_plans (
    id, user_id, month, focus, title, summary,
    daily_agent_talks, lead_rate, monthly_agent_meetings, monthly_agent_visits, monthly_whatsapp_groups,
    monthly_wedding_closes, monthly_corporate_closes, monthly_revenue,
    daily_event_talks, daily_incoming_calls, daily_revenue
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(user_id, month) DO UPDATE SET
    focus=excluded.focus, title=excluded.title, summary=excluded.summary,
    daily_agent_talks=excluded.daily_agent_talks, lead_rate=excluded.lead_rate,
    monthly_agent_meetings=excluded.monthly_agent_meetings, monthly_agent_visits=excluded.monthly_agent_visits,
    monthly_whatsapp_groups=excluded.monthly_whatsapp_groups,
    monthly_wedding_closes=excluded.monthly_wedding_closes, monthly_corporate_closes=excluded.monthly_corporate_closes,
    monthly_revenue=excluded.monthly_revenue, daily_event_talks=excluded.daily_event_talks,
    daily_incoming_calls=excluded.daily_incoming_calls, daily_revenue=excluded.daily_revenue
  `).run(
    uuidv4(), userId, month, plan.focus, plan.title, plan.summary,
    plan.daily_agent_talks, plan.lead_rate, plan.monthly_agent_meetings, plan.monthly_agent_visits, plan.monthly_whatsapp_groups,
    plan.monthly_wedding_closes, plan.monthly_corporate_closes, plan.monthly_revenue,
    plan.daily_event_talks, plan.daily_incoming_calls, plan.daily_revenue,
  );
}

function upsertClassicTarget(db: any, userId: string, month: string, calls: number, meetings: number, revenue: number, createdBy: string | null) {
  const existing = db.prepare("SELECT id FROM targets WHERE user_id=? AND month=? AND segment='All'").get(userId, month) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE targets SET calls_target=?, meetings_target=?, revenue_target=? WHERE id=?').run(calls, meetings, revenue, existing.id);
    return;
  }
  db.prepare('INSERT INTO targets (id,user_id,month,segment,calls_target,meetings_target,revenue_target,created_by) VALUES (?,?,?,?,?,?,?,?)').run(
    uuidv4(), userId, month, 'All', calls, meetings, revenue, createdBy,
  );
}

function upsertScore(db: any, userId: string, month: string, metric: string, value: number, weight: number, createdBy: string | null) {
  const existing = db.prepare("SELECT id FROM score_targets WHERE scope='individual' AND user_id=? AND month=? AND metric=?").get(userId, month, metric) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE score_targets SET target_value=?, weight=? WHERE id=?').run(value, weight, existing.id);
    return;
  }
  db.prepare('INSERT INTO score_targets (id,scope,user_id,month,metric,target_value,weight,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
    uuidv4(), 'individual', userId, month, metric, value, weight, createdBy, new Date().toISOString(),
  );
}

export function seedSalesTeam(db: any) {
  const devraj = ensureUser(db, 'Devraj', 'devraj@hotel.com', 'devraj123');
  const krishan = ensureUser(db, 'Krishan', 'krishan@hotel.com', 'krishan123');
  const vivek = ensureUser(db, 'Vivek', 'vivek@hotel.com', 'vivek123');
  const riya = ensureUser(db, 'Riya', 'riya@hotel.com', 'riya123');
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  const maker = admin?.id || null;

  const devrajPlan = {
    focus: 'closer',
    title: 'Lead owner and event closer',
    summary: 'Every lead assigned to Devraj is his. He converts it, including event sales.',
    daily_agent_talks: 0, lead_rate: 0, monthly_agent_meetings: 0, monthly_agent_visits: 0, monthly_whatsapp_groups: 0,
    monthly_wedding_closes: 0, monthly_corporate_closes: 0, monthly_revenue: 0,
    daily_event_talks: 0, daily_incoming_calls: 0, daily_revenue: 0,
  };
  const krishanBase = {
    focus: 'agents',
    title: 'Agent sales',
    summary: '20 agent conversations a day, and 20% of those become leads. Each month: 50 agent meetings, 10 agent visits, 100 WhatsApp groups, 2 weddings and 2 corporate closures. Revenue steps up: November 10 lakh, December 15 lakh, January 30 lakh.',
    daily_agent_talks: 20, lead_rate: 0.2, monthly_agent_meetings: 50, monthly_agent_visits: 10, monthly_whatsapp_groups: 100,
    monthly_wedding_closes: 2, monthly_corporate_closes: 2,
    daily_event_talks: 0, daily_incoming_calls: 0, daily_revenue: 0,
  };
  const vivekBase = {
    focus: 'agents',
    title: 'Agent sales',
    summary: '30 agent conversations a day, and 20% of those become leads. Each month: 100 agent meetings, 2 weddings, 2 corporate closures, and 30 lakh closed.',
    daily_agent_talks: 30, lead_rate: 0.2, monthly_agent_meetings: 100, monthly_agent_visits: 0, monthly_whatsapp_groups: 0,
    monthly_wedding_closes: 2, monthly_corporate_closes: 2, monthly_revenue: 3000000,
    daily_event_talks: 0, daily_incoming_calls: 0, daily_revenue: 0,
  };
  const riyaBase = {
    focus: 'events',
    title: 'Event desk',
    summary: 'Talk to 10 event clients a day and handle 20 incoming calls a day. Close ₹50,000 of sales on every working day (Monday to Saturday).',
    daily_agent_talks: 0, lead_rate: 0, monthly_agent_meetings: 0, monthly_agent_visits: 0, monthly_whatsapp_groups: 0,
    monthly_wedding_closes: 0, monthly_corporate_closes: 0,
    daily_event_talks: 10, daily_incoming_calls: 20, daily_revenue: 50000,
  };

  for (const month of MONTHS) {
    const days = workingDays(month);
    const krishanRevenue = KRISHAN_REVENUE[month];
    const riyaRevenue = 50000 * days;
    upsertPlan(db, devraj, month, devrajPlan);
    upsertPlan(db, krishan, month, { ...krishanBase, monthly_revenue: krishanRevenue });
    upsertPlan(db, vivek, month, vivekBase);
    upsertPlan(db, riya, month, { ...riyaBase, monthly_revenue: riyaRevenue });

    upsertClassicTarget(db, krishan, month, 20 * days, 50, krishanRevenue, maker);
    upsertClassicTarget(db, vivek, month, 30 * days, 100, 3000000, maker);
    upsertClassicTarget(db, riya, month, (10 + 20) * days, 0, riyaRevenue, maker);

    for (const userId of [krishan, vivek]) {
      upsertScore(db, userId, month, 'wedding_closures', 2, 25, maker);
      upsertScore(db, userId, month, 'corporate_closures', 2, 25, maker);
    }
  }
}

function countActivity(db: any, userId: string, type: string, from: string, to: string) {
  return (db.prepare(`SELECT COUNT(*) as c FROM agent_activity_log WHERE user_id=? AND type=? AND substr(contacted_at,1,10) BETWEEN ? AND ?`).get(userId, type, from, to) as { c: number }).c;
}

function countCalls(db: any, userId: string, from: string, to: string, extraSql = '', extra: any[] = []) {
  return (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE user_id=? AND substr(created_at,1,10) BETWEEN ? AND ? ${extraSql}`).get(userId, from, to, ...extra) as { c: number }).c;
}

export function salesPlanReport(db: any, month: string, onlyUserId?: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const today = todayISO();
  const days = workingDays(month);
  const [year, mon] = month.split('-').map(Number);
  const last = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`;
  const elapsed = today.slice(0, 7) === month ? workingDaysThrough(month, today) : today > last ? days : 0;
  const start = `${month}-01`;
  const end = `${month}-31`;
  const params: any[] = [month];
  let where = 'WHERE p.month=?';
  if (onlyUserId) { where += ' AND p.user_id=?'; params.push(onlyUserId); }
  const plans = db.prepare(`
    SELECT p.*, u.name, u.email, u.role
    FROM sales_plans p JOIN users u ON u.id=p.user_id
    ${where}
    ORDER BY CASE p.focus WHEN 'closer' THEN 1 WHEN 'agents' THEN 2 ELSE 3 END, u.name
  `).all(...params) as PlanRow[];

  const people = plans.map(plan => {
    const closures = actualsFor(db, [plan.user_id], month);
    const revenue = (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE user_id=? AND stage='Closed Won' AND substr(updated_at,1,7)=?`).get(plan.user_id, month) as { total: number }).total;
    const revenueToday = today.slice(0, 7) === month
      ? (db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE user_id=? AND stage='Closed Won' AND substr(updated_at,1,10)=?`).get(plan.user_id, today) as { total: number }).total
      : 0;
    const owned = db.prepare(`SELECT
      SUM(CASE WHEN l.stage NOT IN ('Closed Won','Closed Lost') THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN l.stage='Closed Won' THEN 1 ELSE 0 END) as won_count,
      COUNT(*) as total_count
      FROM leads l JOIN lead_owners lo ON lo.lead_id=l.id AND lo.user_id=?`).get(plan.user_id) as any;

    const lines: { label: string; actual: number; target: number; money?: boolean; period: 'today' | 'month' }[] = [];
    const pushDaily = (label: string, actual: number, perDay: number) => {
      if (perDay <= 0) return;
      lines.push({ label, actual, target: perDay, period: 'today' });
    };
    const pushMonth = (label: string, actual: number, target: number, money = false) => {
      if (target <= 0 && actual <= 0 && !money) return;
      if (target <= 0 && !money) return;
      lines.push({ label, actual, target, money, period: 'month' });
    };

    if (plan.focus === 'closer') {
      lines.push({ label: 'Leads assigned to him', actual: Number(owned?.total_count || 0), target: 0, period: 'month' });
      lines.push({ label: 'Converted', actual: Number(owned?.won_count || 0), target: 0, period: 'month' });
      lines.push({ label: 'Still open', actual: Number(owned?.open_count || 0), target: 0, period: 'month' });
      lines.push({ label: 'Event revenue this month', actual: Number(closures.event_revenue || 0), target: 0, money: true, period: 'month' });
    } else {
      const talksToday = countActivity(db, plan.user_id, 'Call', today, today);
      const talksMonth = countActivity(db, plan.user_id, 'Call', start, end);
      const leadsMonth = (db.prepare(`SELECT COUNT(*) as c FROM leads WHERE created_by=? AND substr(created_at,1,7)=?`).get(plan.user_id, month) as { c: number }).c;
      pushDaily('Agent conversations', talksToday, plan.daily_agent_talks);
      const talkTarget = plan.daily_agent_talks * days;
      pushMonth('Agent conversations', talksMonth, talkTarget);
      if (plan.lead_rate > 0 && talkTarget > 0) {
        lines.push({ label: `Leads from agents (${Math.round(plan.lead_rate * 100)}%)`, actual: leadsMonth, target: Math.round(talkTarget * plan.lead_rate), period: 'month' });
      }
      pushMonth('Agent meetings', countActivity(db, plan.user_id, 'Meeting', start, end), plan.monthly_agent_meetings);
      pushMonth('Agent visits', countActivity(db, plan.user_id, 'Site Visit', start, end), plan.monthly_agent_visits);
      pushMonth('WhatsApp groups', countActivity(db, plan.user_id, 'WhatsApp', start, end), plan.monthly_whatsapp_groups);
      pushDaily('Event conversations', countCalls(db, plan.user_id, today, today, "AND segment='Events'"), plan.daily_event_talks);
      pushMonth('Event conversations', countCalls(db, plan.user_id, start, end, "AND segment='Events'"), plan.daily_event_talks * days);
      pushDaily('Incoming calls', countCalls(db, plan.user_id, today, today, "AND call_type='Inbound'"), plan.daily_incoming_calls);
      pushMonth('Incoming calls', countCalls(db, plan.user_id, start, end, "AND call_type='Inbound'"), plan.daily_incoming_calls * days);
      pushDaily('Sales closed', revenueToday, plan.daily_revenue);
      pushMonth('Weddings closed', Number(closures.wedding_closures || 0), plan.monthly_wedding_closes);
      pushMonth('Corporate closures', Number(closures.corporate_closures || 0), plan.monthly_corporate_closes);
      if (plan.monthly_revenue > 0) lines.push({ label: 'Revenue closed', actual: revenue, target: plan.monthly_revenue, money: true, period: 'month' });
    }

    return {
      id: plan.user_id,
      name: plan.name,
      email: plan.email,
      title: plan.title,
      focus: plan.focus,
      summary: plan.summary,
      lines,
    };
  });

  return {
    month,
    today,
    workingDays: days,
    workingDaysElapsed: elapsed,
    week: 'Monday to Saturday',
    people,
  };
}
