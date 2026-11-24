import { v4 as uuidv4 } from 'uuid';
import { METRICS, actualsFor } from './incentiveMetrics';

export interface TaskMetric {
  key: string;
  label: string;
  kind: 'count' | 'revenue';
}

export const TASK_METRICS: TaskMetric[] = [
  { key: 'sales_closure', label: 'Sales closed', kind: 'revenue' },
  ...METRICS.map(m => ({ key: m.key, label: m.label, kind: m.kind })),
  { key: 'agent_calls', label: 'Agent conversations', kind: 'count' },
  { key: 'agent_meetings', label: 'Agent meetings', kind: 'count' },
  { key: 'agent_visits', label: 'Agent visits', kind: 'count' },
  { key: 'whatsapp_groups', label: 'WhatsApp groups', kind: 'count' },
  { key: 'event_calls', label: 'Event conversations', kind: 'count' },
  { key: 'incoming_calls', label: 'Incoming calls', kind: 'count' },
];

const LEAD_KEYS = new Set(METRICS.map(m => m.key));

export function taskMetric(key: string) {
  return TASK_METRICS.find(m => m.key === key);
}

export function taskActual(db: any, userId: string, month: string, key: string): number {
  if (key === 'sales_closure') {
    const row = db.prepare(`SELECT COALESCE(SUM(estimated_revenue),0) as total FROM leads WHERE user_id=? AND stage='Closed Won' AND substr(updated_at,1,7)=?`).get(userId, month) as { total: number };
    return Number(row?.total || 0);
  }
  if (LEAD_KEYS.has(key)) return Number(actualsFor(db, [userId], month)[key] || 0);
  const start = `${month}-01`;
  const end = `${month}-31`;
  if (key === 'agent_calls' || key === 'agent_meetings' || key === 'agent_visits' || key === 'whatsapp_groups') {
    const type = key === 'agent_calls' ? 'Call' : key === 'agent_meetings' ? 'Meeting' : key === 'agent_visits' ? 'Site Visit' : 'WhatsApp';
    return (db.prepare(`SELECT COUNT(*) as c FROM agent_activity_log WHERE user_id=? AND type=? AND substr(contacted_at,1,10) BETWEEN ? AND ?`).get(userId, type, start, end) as { c: number }).c;
  }
  if (key === 'event_calls') {
    return (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE user_id=? AND segment='Events' AND substr(created_at,1,10) BETWEEN ? AND ?`).get(userId, start, end) as { c: number }).c;
  }
  if (key === 'incoming_calls') {
    return (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE user_id=? AND call_type='Inbound' AND substr(created_at,1,10) BETWEEN ? AND ?`).get(userId, start, end) as { c: number }).c;
  }
  return 0;
}

export function validateTaskIncentive(input: Record<string, unknown>) {
  const metric = taskMetric(String(input.metric || ''));
  if (!metric) return { error: 'Choose what the task measures' };
  const task = String(input.task || '').trim();
  if (!task) return { error: 'Write what they must complete' };
  const payType = String(input.pay_type || '');
  if (payType !== 'percent' && payType !== 'fixed') return { error: 'Choose a percentage or a fixed amount' };
  const rate = Number(input.rate);
  const target = Number(input.target_value);
  if (!Number.isFinite(target) || target < 0) return { error: 'The task target cannot be negative' };
  if (!Number.isFinite(rate) || rate <= 0) return { error: payType === 'percent' ? 'Enter the percentage' : 'Enter the amount' };
  if (payType === 'percent') {
    if (metric.kind !== 'revenue') return { error: 'A percentage is for revenue, such as sales closed. For a count, use a fixed amount.' };
    if (rate > 100) return { error: 'Percent cannot be more than 100' };
  }
  if (payType === 'fixed' && target <= 0) return { error: 'Set how much they must complete before the fixed amount is paid' };
  return { row: { task, metric: metric.key, target_value: target, pay_type: payType, rate } };
}

export function earnedFor(metricKey: string, payType: string, rate: number, actual: number, target: number) {
  const metric = taskMetric(metricKey);
  if (!metric) return { amount: 0, complete: false };
  if (payType === 'percent') {
    const complete = target > 0 ? actual >= target : actual > 0;
    return { amount: complete ? Math.round((actual * rate) / 100) : 0, complete };
  }
  const complete = target > 0 && actual >= target;
  return { amount: complete ? Math.round(rate) : 0, complete };
}

export function incentivesForUsers(db: any, userIds: string[], month: string) {
  const byUser: Record<string, any[]> = {};
  if (!userIds.length) return byUser;
  const ph = userIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM person_incentives WHERE month=? AND user_id IN (${ph}) ORDER BY created_at`).all(month, ...userIds) as any[];
  const walletRows = rows.length
    ? db.prepare(`SELECT person_incentive_id, status, amount FROM incentives WHERE month=? AND person_incentive_id IN (${rows.map(() => '?').join(',')})`).all(month, ...rows.map(r => r.id)) as any[]
    : [];
  const wallet = new Map(walletRows.map(w => [w.person_incentive_id, w]));
  for (const row of rows) {
    const metric = taskMetric(row.metric);
    const actual = taskActual(db, row.user_id, month, row.metric);
    const earned = earnedFor(row.metric, row.pay_type, row.rate, actual, row.target_value);
    const posted = wallet.get(row.id);
    const item = {
      id: row.id,
      task: row.task,
      metric: row.metric,
      metric_label: metric?.label || row.metric,
      kind: metric?.kind || 'count',
      target_value: row.target_value,
      actual,
      pay_type: row.pay_type,
      rate: row.rate,
      complete: earned.complete,
      earned: earned.amount,
      wallet_status: posted?.status || null,
      wallet_amount: posted ? Number(posted.amount) : null,
    };
    if (!byUser[row.user_id]) byUser[row.user_id] = [];
    byUser[row.user_id].push(item);
  }
  return byUser;
}

export function insertTaskIncentive(db: any, userId: string, month: string, input: Record<string, unknown>, editorId: string) {
  const checked = validateTaskIncentive(input);
  if (checked.error || !checked.row) return { error: checked.error || 'Invalid incentive' };
  const id = uuidv4();
  db.prepare(`INSERT INTO person_incentives (id,user_id,month,task,metric,target_value,pay_type,rate,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, userId, month, checked.row.task, checked.row.metric, checked.row.target_value, checked.row.pay_type, checked.row.rate, editorId,
  );
  return { id };
}

export function updateTaskIncentive(db: any, id: string, input: Record<string, unknown>) {
  const row = db.prepare('SELECT * FROM person_incentives WHERE id=?').get(id) as any;
  if (!row) return { error: 'Incentive not found' };
  const checked = validateTaskIncentive({
    task: input.task ?? row.task,
    metric: input.metric ?? row.metric,
    target_value: input.target_value ?? row.target_value,
    pay_type: input.pay_type ?? row.pay_type,
    rate: input.rate ?? row.rate,
  });
  if (checked.error || !checked.row) return { error: checked.error || 'Invalid incentive' };
  db.prepare('UPDATE person_incentives SET task=?, metric=?, target_value=?, pay_type=?, rate=? WHERE id=?').run(
    checked.row.task, checked.row.metric, checked.row.target_value, checked.row.pay_type, checked.row.rate, id,
  );
  return { id };
}

export function postTaskIncentive(db: any, id: string, editorId: string) {
  const row = db.prepare('SELECT * FROM person_incentives WHERE id=?').get(id) as any;
  if (!row) return { error: 'Incentive not found', status: 404 };
  const actual = taskActual(db, row.user_id, row.month, row.metric);
  const earned = earnedFor(row.metric, row.pay_type, row.rate, actual, row.target_value);
  if (earned.amount <= 0) {
    return { error: 'This task is not complete yet, so there is nothing to add to the wallet.', status: 400 };
  }
  const existing = db.prepare('SELECT * FROM incentives WHERE person_incentive_id=? AND month=?').get(id, row.month) as any;
  const metric = taskMetric(row.metric);
  const basis = row.pay_type === 'percent'
    ? `${row.rate}% of ${metric?.label || 'sales'} once “${row.task}” is done`
    : `₹${Math.round(row.rate).toLocaleString('en-IN')} because “${row.task}” is done`;
  const note = `${basis}. Done: ${Math.round(actual).toLocaleString('en-IN')} of ${Math.round(row.target_value).toLocaleString('en-IN')}.`;
  const now = new Date().toISOString();
  if (existing) {
    if (existing.status !== 'added') {
      return { error: `This is already in the wallet as ${existing.status}. It was left unchanged.`, status: 409 };
    }
    db.prepare('UPDATE incentives SET title=?, amount=?, note=?, metric=?, updated_at=? WHERE id=?').run(row.task, earned.amount, note, row.metric, now, existing.id);
    db.prepare('INSERT INTO incentive_events (id,incentive_id,action,actor_id,amount,note,created_at) VALUES (?,?,?,?,?,?,?)').run(
      uuidv4(), existing.id, 'edited', editorId, earned.amount, 'Amount refreshed from the task', now,
    );
    return { id: existing.id, amount: earned.amount, updated: true };
  }
  const incentiveId = uuidv4();
  db.prepare(`INSERT INTO incentives (id,scope,user_id,month,title,metric,amount,status,maker_id,note,person_incentive_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'added',?,?,?,?,?)`).run(
    incentiveId, 'individual', row.user_id, row.month, row.task, row.metric, earned.amount, editorId, note, id, now, now,
  );
  db.prepare('INSERT INTO incentive_events (id,incentive_id,action,actor_id,amount,note,created_at) VALUES (?,?,?,?,?,?,?)').run(
    uuidv4(), incentiveId, 'added', editorId, earned.amount, note, now,
  );
  return { id: incentiveId, amount: earned.amount, updated: false };
}
