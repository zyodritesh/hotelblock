import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, requireManagerOrAdmin, ownScope, AuthRequest } from '../middleware/auth';
import { METRICS, actualsFor, scoreFrom, incentiveAmount } from '../incentiveMetrics';

const router = Router();
router.use(authenticate);

function salesPeople() {
  return db.prepare("SELECT id, name, role FROM users WHERE active=1 AND role IN ('executive','manager') ORDER BY name").all() as { id: string; name: string; role: string }[];
}

function monthOk(month: string) {
  return /^\d{4}-\d{2}$/.test(month || '');
}

function targetsFor(scope: string, userId: string | null, month: string) {
  if (scope === 'team') {
    return db.prepare("SELECT metric, target_value, weight FROM score_targets WHERE scope='team' AND month=?").all(month) as any[];
  }
  return db.prepare("SELECT metric, target_value, weight FROM score_targets WHERE scope='individual' AND user_id=? AND month=?").all(userId, month) as any[];
}

function sumByStatus(rows: { status: string; amount: number }[]) {
  const out = { added: 0, approved: 0, paid: 0 };
  for (const r of rows) {
    if (r.status === 'added') out.added += r.amount;
    else if (r.status === 'approved') out.approved += r.amount;
    else if (r.status === 'paid') out.paid += r.amount;
  }
  return out;
}

function logEvent(incentiveId: string, action: string, actorId: string, amount: number, note: string) {
  db.prepare('INSERT INTO incentive_events (id,incentive_id,action,actor_id,amount,note,created_at) VALUES (?,?,?,?,?,?,?)').run(
    uuidv4(), incentiveId, action, actorId, amount, note || '', new Date().toISOString()
  );
}

function attachEvents(rows: any[]) {
  if (!rows.length) return rows;
  const ph = rows.map(() => '?').join(',');
  const events = db.prepare(`
    SELECT e.*, u.name as actor_name
    FROM incentive_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.incentive_id IN (${ph})
    ORDER BY e.created_at ASC
  `).all(...rows.map(r => r.id)) as any[];
  const by: Record<string, any[]> = {};
  for (const e of events) {
    if (!by[e.incentive_id]) by[e.incentive_id] = [];
    by[e.incentive_id].push(e);
  }
  return rows.map(r => ({ ...r, events: by[r.id] || [] }));
}

router.get('/', (req: AuthRequest, res: Response) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const status = String(req.query.status || '');
  const scope = String(req.query.scope || '');
  const allHistory = req.query.all === '1';
  const people = salesPeople();
  const peopleIds = people.map(p => p.id);

  let subject = req.user!.id;
  if (!ownScope(req.user!.role) && req.query.user_id) subject = String(req.query.user_id);
  if (ownScope(req.user!.role)) subject = req.user!.id;
  const subjectUser = db.prepare('SELECT id, name, role FROM users WHERE id=?').get(subject) as any;
  if (!subjectUser) return res.status(404).json({ error: 'User not found' });

  const personalRows = db.prepare("SELECT status, amount FROM incentives WHERE scope='individual' AND user_id=? AND month=?").all(subject, month) as any[];
  const teamRows = db.prepare("SELECT status, amount FROM incentives WHERE scope='team' AND month=?").all(month) as any[];

  const scorecard = scoreFrom(actualsFor(db, [subject], month), targetsFor('individual', subject, month));
  const teamScore = scoreFrom(actualsFor(db, peopleIds, month), targetsFor('team', null, month));

  const visiblePeople = ownScope(req.user!.role) ? people.filter(p => p.id === req.user!.id) : people;
  const peopleSummary = visiblePeople.map(p => {
    const rows = db.prepare("SELECT status, amount FROM incentives WHERE scope='individual' AND user_id=? AND month=?").all(p.id, month) as any[];
    const scored = scoreFrom(actualsFor(db, [p.id], month), targetsFor('individual', p.id, month));
    return { ...p, ...sumByStatus(rows), score: scored.score };
  });

  let q = `
    SELECT i.*,
      eu.name as employee_name,
      mu.name as maker_name,
      au.name as approved_name,
      pu.name as paid_name
    FROM incentives i
    LEFT JOIN users eu ON eu.id = i.user_id
    LEFT JOIN users mu ON mu.id = i.maker_id
    LEFT JOIN users au ON au.id = i.approved_by
    LEFT JOIN users pu ON pu.id = i.paid_by
    WHERE 1=1`;
  const params: any[] = [];
  if (ownScope(req.user!.role)) {
    q += " AND (i.user_id = ? OR i.scope = 'team')";
    params.push(req.user!.id);
  } else if (req.query.user_id) {
    q += ' AND (i.user_id = ? OR i.scope = \'team\')';
    params.push(subject);
  }
  if (!allHistory) { q += ' AND i.month = ?'; params.push(month); }
  if (status === 'added' || status === 'approved' || status === 'paid') { q += ' AND i.status = ?'; params.push(status); }
  if (scope === 'individual' || scope === 'team') { q += ' AND i.scope = ?'; params.push(scope); }
  q += ' ORDER BY i.created_at DESC LIMIT 300';
  const transactions = attachEvents(db.prepare(q).all(...params) as any[]);

  const rules = ownScope(req.user!.role)
    ? []
    : db.prepare('SELECT * FROM incentive_rules ORDER BY scope, name').all();

  return res.json({
    month,
    me: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
    subject: { id: subjectUser.id, name: subjectUser.name, role: subjectUser.role },
    wallet: { user_id: subject, name: subjectUser.name, ...sumByStatus(personalRows) },
    teamWallet: sumByStatus(teamRows),
    people: peopleSummary,
    scorecard: { user_id: subject, name: subjectUser.name, ...scorecard },
    teamScore,
    transactions,
    rules,
    metrics: METRICS,
  });
});

router.post('/', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const { scope, user_id, month, title, metric, amount, note } = req.body;
  if (scope !== 'individual' && scope !== 'team') return res.status(400).json({ error: 'scope must be individual or team' });
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });
  let employee: string | null = null;
  if (scope === 'individual') {
    const user = db.prepare('SELECT id, role, active FROM users WHERE id=?').get(user_id) as any;
    if (!user || !user.active) return res.status(400).json({ error: 'Choose an employee' });
    if (req.user!.role === 'manager' && user.role === 'admin') return res.status(403).json({ error: 'Managers cannot assign an incentive to an admin' });
    employee = user.id;
  }
  if (metric && !METRICS.some(m => m.key === metric)) return res.status(400).json({ error: 'Unknown metric' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO incentives (id,scope,user_id,month,title,metric,amount,status,maker_id,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'added',?,?,?,?)`).run(
    id, scope, employee, month, String(title).trim(), metric || null, Math.round(value), req.user!.id, note || '', now, now
  );
  logEvent(id, 'added', req.user!.id, Math.round(value), note || 'Incentive added');
  return res.status(201).json(db.prepare('SELECT * FROM incentives WHERE id=?').get(id));
});

router.put('/:id', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM incentives WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'added') return res.status(400).json({ error: 'Only an added incentive can be edited' });
  const title = req.body.title != null ? String(req.body.title).trim() : row.title;
  const amount = req.body.amount != null ? Math.round(Number(req.body.amount)) : row.amount;
  const note = req.body.note != null ? String(req.body.note) : row.note;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });
  const now = new Date().toISOString();
  db.prepare('UPDATE incentives SET title=?, amount=?, note=?, updated_at=? WHERE id=?').run(title, amount, note, now, row.id);
  logEvent(row.id, 'edited', req.user!.id, amount, 'Amount or note updated');
  return res.json(db.prepare('SELECT * FROM incentives WHERE id=?').get(row.id));
});

router.post('/:id/approve', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM incentives WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'added') return res.status(400).json({ error: 'Only an added incentive can be approved' });
  const now = new Date().toISOString();
  db.prepare("UPDATE incentives SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?").run(req.user!.id, now, now, row.id);
  logEvent(row.id, 'approved', req.user!.id, row.amount, req.body.note || 'Approved');
  return res.json(db.prepare('SELECT * FROM incentives WHERE id=?').get(row.id));
});

router.post('/:id/pay', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM incentives WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'approved') return res.status(400).json({ error: 'Approve the incentive before marking it paid' });
  const now = new Date().toISOString();
  db.prepare("UPDATE incentives SET status='paid', paid_by=?, paid_at=?, updated_at=? WHERE id=?").run(req.user!.id, now, now, row.id);
  logEvent(row.id, 'paid', req.user!.id, row.amount, req.body.note || 'Marked paid');
  return res.json(db.prepare('SELECT * FROM incentives WHERE id=?').get(row.id));
});

router.delete('/:id', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM incentives WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.status !== 'added') return res.status(400).json({ error: 'Approved and paid incentives stay in the history' });
  db.prepare('DELETE FROM incentive_events WHERE incentive_id=?').run(row.id);
  db.prepare('DELETE FROM incentives WHERE id=?').run(row.id);
  return res.json({ success: true });
});

router.post('/targets', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const { scope, user_id, month, targets } = req.body as { scope: string; user_id?: string; month: string; targets: any[] };
  if (scope !== 'individual' && scope !== 'team') return res.status(400).json({ error: 'scope must be individual or team' });
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  if (!Array.isArray(targets)) return res.status(400).json({ error: 'targets required' });
  let employee: string | null = null;
  if (scope === 'individual') {
    const user = db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('executive','manager','admin')").get(user_id) as any;
    if (!user) return res.status(400).json({ error: 'Choose an employee' });
    employee = user.id;
    db.prepare("DELETE FROM score_targets WHERE scope='individual' AND user_id=? AND month=?").run(employee, month);
  } else {
    db.prepare("DELETE FROM score_targets WHERE scope='team' AND month=?").run(month);
  }
  const insert = db.prepare('INSERT INTO score_targets (id,scope,user_id,month,metric,target_value,weight,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const now = new Date().toISOString();
  for (const t of targets) {
    if (!METRICS.some(m => m.key === t.metric)) continue;
    const value = Number(t.target_value);
    const weight = Number(t.weight);
    if (!Number.isFinite(value) || value < 0) continue;
    insert.run(uuidv4(), scope, employee, month, t.metric, value, Number.isFinite(weight) && weight > 0 ? weight : 10, req.user!.id, now);
  }
  return res.json({ success: true });
});

router.post('/rules', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const { scope, metric, name, calc, rate } = req.body;
  if (scope !== 'individual' && scope !== 'team') return res.status(400).json({ error: 'scope must be individual or team' });
  if (!METRICS.some(m => m.key === metric)) return res.status(400).json({ error: 'Unknown metric' });
  if (!['per_unit', 'percent', 'on_target'].includes(calc)) return res.status(400).json({ error: 'calc must be per_unit, percent, or on_target' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'rate required' });
  const id = uuidv4();
  db.prepare('INSERT INTO incentive_rules (id,scope,metric,name,calc,rate,active,created_by,created_at) VALUES (?,?,?,?,?,?,1,?,?)').run(
    id, scope, metric, String(name).trim(), calc, value, req.user!.id, new Date().toISOString()
  );
  return res.status(201).json(db.prepare('SELECT * FROM incentive_rules WHERE id=?').get(id));
});

router.put('/rules/:id', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM incentive_rules WHERE id=?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  const name = req.body.name != null ? String(req.body.name).trim() : row.name;
  const rate = req.body.rate != null ? Number(req.body.rate) : row.rate;
  const active = req.body.active != null ? (req.body.active ? 1 : 0) : row.active;
  const calc = req.body.calc || row.calc;
  if (!['per_unit', 'percent', 'on_target'].includes(calc)) return res.status(400).json({ error: 'Unknown calc' });
  if (!name || !Number.isFinite(rate) || rate < 0) return res.status(400).json({ error: 'name and rate required' });
  db.prepare('UPDATE incentive_rules SET name=?, rate=?, active=?, calc=? WHERE id=?').run(name, rate, active, calc, row.id);
  return res.json(db.prepare('SELECT * FROM incentive_rules WHERE id=?').get(row.id));
});

router.post('/calculate', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const month = String(req.body.month || '');
  if (!monthOk(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const rules = db.prepare('SELECT * FROM incentive_rules WHERE active=1').all() as any[];
  const people = salesPeople();
  const peopleIds = people.map(p => p.id);
  const teamActuals = actualsFor(db, peopleIds, month);
  const teamTargets = targetsFor('team', null, month);
  const created: any[] = [];
  const now = new Date().toISOString();

  const exists = db.prepare("SELECT id FROM incentives WHERE month=? AND rule_id=? AND scope=? AND IFNULL(user_id,'')=?");
  const insert = db.prepare(`INSERT INTO incentives (id,scope,user_id,month,title,metric,amount,status,maker_id,note,rule_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'added',?,?,?,?,?)`);

  for (const rule of rules) {
    const metric = METRICS.find(m => m.key === rule.metric);
    if (!metric) continue;
    const subjects = rule.scope === 'team'
      ? [{ id: '', name: 'Team', actuals: teamActuals, targets: teamTargets }]
      : people.map(p => ({ id: p.id, name: p.name, actuals: actualsFor(db, [p.id], month), targets: targetsFor('individual', p.id, month) }));

    for (const subject of subjects) {
      if (exists.get(month, rule.id, rule.scope, subject.id)) continue;
      const actual = Number(subject.actuals[rule.metric] || 0);
      const targetRow = subject.targets.find((t: any) => t.metric === rule.metric);
      const target = Number(targetRow?.target_value || 0);
      const amount = incentiveAmount(rule.calc, Number(rule.rate), actual, target);
      if (amount <= 0) continue;
      const id = uuidv4();
      const basis = rule.calc === 'percent'
        ? `${rule.rate}% of ${metric.label} (${Math.round(actual).toLocaleString('en-IN')})`
        : rule.calc === 'on_target'
          ? `Flat bonus because ${metric.label} reached the target of ${target}`
          : `${metric.kind === 'count' ? actual : '₹' + Math.round(actual).toLocaleString('en-IN')} × ${rule.rate} on ${metric.label}`;
      const note = `Built from the rule “${rule.name}”. ${basis}.`;
      insert.run(id, rule.scope, subject.id || null, month, rule.name, rule.metric, amount, req.user!.id, note, rule.id, now, now);
      logEvent(id, 'added', req.user!.id, amount, note);
      created.push({ id, name: subject.name || 'Team', amount, title: rule.name });
    }
  }
  return res.json({ created: created.length, items: created });
});

export default router;
