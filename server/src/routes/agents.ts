import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, denyUnlessOwner, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const FREQUENCY_DAYS: Record<string, number> = {
  Weekly: 7,
  Fortnightly: 14,
  Monthly: 30,
  Quarterly: 90,
  'Bi-annual': 180,
  Annual: 365,
};

function computeDueStatus(nextDue: string | null, lastContact: string | null): string {
  if (!lastContact) return 'Never Contacted';
  if (!nextDue) return 'On Track';
  const due = String(nextDue).slice(0, 10);
  const today = todayISO();
  if (due < today) return 'Overdue';
  if (due === today) return 'Due Today';
  return 'On Track';
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysOverdue(nextDue: string | null): number {
  if (!nextDue) return 0;
  const due = String(nextDue).slice(0, 10);
  const today = todayISO();
  if (due >= today) return 0;
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = due.split('-').map(Number);
  const diff = Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
  return diff > 0 ? diff : 0;
}

function enrichAgent(agent: any, followup: any): any {
  const dueStatus = computeDueStatus(followup?.next_due_date ?? null, followup?.last_contact_date ?? null);
  return {
    ...agent,
    frequency: followup?.frequency ?? null,
    frequency_days: followup?.frequency_days ?? null,
    last_contact_date: followup?.last_contact_date ?? null,
    next_due_date: followup?.next_due_date ?? null,
    due_status: dueStatus,
    days_overdue: daysOverdue(followup?.next_due_date ?? null),
    followup_id: followup?.id ?? null,
  };
}

// GET /api/agents
router.get('/', (req: AuthRequest, res: Response) => {
  const { search, type, country, tier, status, assigned_to, property_id, due_status } = req.query as Record<string, string>;
  let where = `FROM agents a
    LEFT JOIN users u ON a.assigned_to = u.id
    LEFT JOIN agent_followups af ON af.agent_id = a.id
    WHERE a.status != 'Deleted'`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { where += ' AND a.assigned_to = ?'; params.push(req.user!.id); }
  else if (assigned_to) { where += ' AND a.assigned_to = ?'; params.push(assigned_to); }
  if (search) { where += ' AND (a.name LIKE ? OR a.agency_name LIKE ? OR a.city LIKE ? OR a.country LIKE ?)'; const s = `%${search}%`; params.push(s, s, s, s); }
  if (type) { where += ' AND a.type = ?'; params.push(type); }
  if (country) { where += ' AND a.country = ?'; params.push(country); }
  if (tier) { where += ' AND a.tier = ?'; params.push(tier); }
  if (status) { where += ' AND a.status = ?'; params.push(status); }
  if (property_id) { where += ' AND a.property_id = ?'; params.push(property_id); }
  const total = (db.prepare(`SELECT COUNT(*) as c ${where}`).get(...params) as any).c;

  let q = `SELECT a.*, u.name as assigned_name,
    af.frequency, af.frequency_days, af.last_contact_date, af.next_due_date, af.id as followup_id
    ${where} ORDER BY a.name ASC LIMIT ? OFFSET ?`;
  const lim = parseInt((req.query.limit as string) || '50');
  const off = parseInt((req.query.offset as string) || '0');

  let rows = db.prepare(q).all(...params, lim, off).map((row: any) => {
    const dueS = computeDueStatus(row.next_due_date, row.last_contact_date);
    return { ...row, due_status: dueS, days_overdue: daysOverdue(row.next_due_date) };
  });

  if (due_status) rows = rows.filter((r: any) => r.due_status === due_status);

  return res.json({ data: rows, total });
});

// GET /api/agents/due-today — agents due or overdue for calling user
router.get('/due-today', (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const userId = req.user!.id;
  const role = req.user!.role;

  const userFilter = role === 'executive' ? `AND a.assigned_to = '${userId}'` : '';
  const rows = db.prepare(`
    SELECT a.*, u.name as assigned_name,
      af.frequency, af.frequency_days, af.last_contact_date, af.next_due_date, af.id as followup_id
    FROM agents a
    LEFT JOIN users u ON a.assigned_to = u.id
    LEFT JOIN agent_followups af ON af.agent_id = a.id
    WHERE a.status = 'Active'
      AND (af.next_due_date <= ? OR af.last_contact_date IS NULL)
      ${userFilter}
    ORDER BY af.next_due_date ASC
  `).all(today).map((row: any) => ({
    ...row,
    due_status: computeDueStatus(row.next_due_date, row.last_contact_date),
    days_overdue: daysOverdue(row.next_due_date),
  }));

  return res.json(rows);
});

// GET /api/agents/compliance
router.get('/compliance', (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const today = new Date().toISOString().slice(0, 10);

  const users = role === 'executive'
    ? db.prepare('SELECT id, name FROM users WHERE id=?').all(userId)
    : db.prepare('SELECT id, name FROM users WHERE active=1').all();

  const stats = (users as any[]).map((u: any) => {
    const totalAssigned = (db.prepare("SELECT COUNT(*) as c FROM agents WHERE assigned_to=? AND status='Active'").get(u.id) as any).c;
    const totalDue = (db.prepare(`SELECT COUNT(*) as c FROM agent_followups WHERE user_id=? AND next_due_date <= ?`).get(u.id, today) as any).c;
    const neverContacted = (db.prepare(`SELECT COUNT(*) as c FROM agent_followups WHERE user_id=? AND last_contact_date IS NULL`).get(u.id) as any).c;
    const overdueCount = (db.prepare(`SELECT COUNT(*) as c FROM agent_followups WHERE user_id=? AND next_due_date < ?`).get(u.id, today) as any).c;
    const contactedThisMonth = (db.prepare(`SELECT COUNT(DISTINCT agent_id) as c FROM agent_activity_log WHERE user_id=? AND date(contacted_at) >= ?`).get(u.id, monthStart) as any).c;
    const compliance = totalAssigned > 0 ? Math.round(Math.min(100, (contactedThisMonth / totalAssigned) * 100)) : 0;

    // Streak: consecutive days from today going backward with at least 1 contact
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const cnt = (db.prepare(`SELECT COUNT(*) as c FROM agent_activity_log WHERE user_id=? AND date(contacted_at)=?`).get(u.id, ds) as any).c;
      if (cnt > 0) streak++;
      else if (i > 0) break;
    }

    return { user_id: u.id, user_name: u.name, total_assigned: totalAssigned, total_due: totalDue, overdue_count: overdueCount, never_contacted: neverContacted, contacted_this_month: contactedThisMonth, compliance_pct: compliance, streak_days: streak };
  });

  return res.json(stats);
});

// GET /api/agents/:id
router.get('/:id', (req: AuthRequest, res: Response) => {
  const agent = db.prepare(`SELECT a.*, u.name as assigned_name FROM agents a LEFT JOIN users u ON a.assigned_to=u.id WHERE a.id=?`).get(req.params.id) as any;
  if (!agent) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, agent.assigned_to)) return;
  const followup = db.prepare('SELECT * FROM agent_followups WHERE agent_id=?').get(req.params.id) as any;
  const activity = db.prepare(`SELECT l.*, u.name as user_name FROM agent_activity_log l LEFT JOIN users u ON l.user_id=u.id WHERE l.agent_id=? ORDER BY l.contacted_at DESC`).all(req.params.id);
  const leads = db.prepare(`SELECT id, title, segment, stage, estimated_revenue, event_date FROM leads WHERE contact_id IN (SELECT id FROM contacts WHERE email=?) OR notes LIKE ?`).all(agent.email || '', `%${agent.name}%`);

  return res.json({ ...enrichAgent(agent, followup), activity, leads });
});

// POST /api/agents — create
router.post('/', (req: AuthRequest, res: Response) => {
  const { name, agency_name, type, country, city, phone, email, website, specialization, tier, status, assigned_to, property_id, notes, frequency } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO agents (id,name,agency_name,type,country,city,phone,email,website,specialization,tier,status,assigned_to,property_id,notes,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, name, agency_name||'', type||'Travel Agent', country||'', city||'', phone||'', email||'', website||'', specialization||'', tier||'B', status||'Active',
    req.user!.role === 'executive' ? req.user!.id : (assigned_to || req.user!.id), property_id||null, notes||'', req.user!.id, now
  );
  // Set up followup cadence
  const freq = frequency || 'Monthly';
  const freqDays = FREQUENCY_DAYS[freq] || 30;
  const fid = uuidv4();
  const nextDue = (req.body.next_due_date || '').toString().slice(0, 10) || null;
  db.prepare('INSERT INTO agent_followups (id,agent_id,user_id,frequency,frequency_days,next_due_date,created_at) VALUES (?,?,?,?,?,?,?)').run(
    fid, id, req.user!.role === 'executive' ? req.user!.id : (assigned_to || req.user!.id), freq, freqDays, nextDue, now
  );
  const agent = db.prepare('SELECT * FROM agents WHERE id=?').get(id) as any;
  const followup = db.prepare('SELECT * FROM agent_followups WHERE agent_id=?').get(id) as any;
  return res.status(201).json(enrichAgent(agent, followup));
});

// PUT /api/agents/:id — update
router.put('/:id', (req: AuthRequest, res: Response) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id) as any;
  if (!agent) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, agent.assigned_to)) return;
  const { name, agency_name, type, country, city, phone, email, website, specialization, tier, status, assigned_to, property_id, notes, frequency, next_due_date } = req.body;
  const assignee = req.user!.role === 'executive' ? req.user!.id : (assigned_to ?? agent.assigned_to);
  db.prepare(`UPDATE agents SET name=?,agency_name=?,type=?,country=?,city=?,phone=?,email=?,website=?,specialization=?,tier=?,status=?,assigned_to=?,property_id=?,notes=? WHERE id=?`).run(
    name??agent.name, agency_name??agent.agency_name, type??agent.type, country??agent.country, city??agent.city,
    phone??agent.phone, email??agent.email, website??agent.website, specialization??agent.specialization,
    tier??agent.tier, status??agent.status, assignee, property_id??agent.property_id,
    notes??agent.notes, req.params.id
  );
  // Update cadence if frequency changed
  if (next_due_date) {
    const due = String(next_due_date).slice(0, 10);
    const existingDue = db.prepare('SELECT id FROM agent_followups WHERE agent_id=?').get(req.params.id) as any;
    if (existingDue) db.prepare('UPDATE agent_followups SET next_due_date=? WHERE agent_id=?').run(due, req.params.id);
    else db.prepare('INSERT INTO agent_followups (id,agent_id,user_id,frequency,frequency_days,next_due_date,created_at) VALUES (?,?,?,?,?,?,?)').run(
      uuidv4(), req.params.id, assignee, 'Monthly', 30, due, new Date().toISOString()
    );
  }
  if (frequency) {
    const freqDays = FREQUENCY_DAYS[frequency] || 30;
    const existing = db.prepare('SELECT * FROM agent_followups WHERE agent_id=?').get(req.params.id) as any;
    if (existing) {
      // Recompute next_due if last_contact exists
      let nextDue = existing.next_due_date;
      if (!next_due_date && existing.last_contact_date) {
        nextDue = addDays(String(existing.last_contact_date).slice(0, 10), freqDays);
      }
      db.prepare('UPDATE agent_followups SET frequency=?,frequency_days=?,next_due_date=? WHERE agent_id=?').run(frequency, freqDays, nextDue, req.params.id);
    } else {
      db.prepare('INSERT INTO agent_followups (id,agent_id,user_id,frequency,frequency_days,created_at) VALUES (?,?,?,?,?,?)').run(
        uuidv4(), req.params.id, assigned_to || agent.assigned_to, frequency, freqDays, new Date().toISOString()
      );
    }
  }
  const updated = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id) as any;
  const followup = db.prepare('SELECT * FROM agent_followups WHERE agent_id=?').get(req.params.id) as any;
  return res.json(enrichAgent(updated, followup));
});

// DELETE /api/agents/:id
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id) as any;
  if (!agent) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, agent.assigned_to)) return;
  db.prepare("UPDATE agents SET status='Deleted' WHERE id=?").run(req.params.id);
  return res.json({ success: true });
});

// POST /api/agents/:id/log — log a follow-up activity
router.post('/:id/log', (req: AuthRequest, res: Response) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id) as any;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (denyUnlessOwner(req, res, agent.assigned_to)) return;

  const { type, outcome, notes, contacted_at, next_due_date } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });

  const logId = uuidv4();
  const contactedDay = (contacted_at || todayISO()).toString().slice(0, 10);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO agent_activity_log (id,agent_id,user_id,type,outcome,notes,contacted_at,created_at) VALUES (?,?,?,?,?,?,?,?)').run(
    logId, req.params.id, req.user!.id, type, outcome||'', notes||'', contactedDay, now
  );

  const followup = db.prepare('SELECT * FROM agent_followups WHERE agent_id=?').get(req.params.id) as any;
  const chosenDue = (next_due_date || '').toString().slice(0, 10);
  const nextDueStr = /^\d{4}-\d{2}-\d{2}$/.test(chosenDue)
    ? chosenDue
    : addDays(contactedDay, followup?.frequency_days || 30);
  if (followup) {
    db.prepare('UPDATE agent_followups SET last_contact_date=?,next_due_date=? WHERE agent_id=?').run(contactedDay, nextDueStr, req.params.id);
  } else {
    db.prepare('INSERT INTO agent_followups (id,agent_id,user_id,frequency,frequency_days,last_contact_date,next_due_date,created_at) VALUES (?,?,?,?,?,?,?,?)').run(
      uuidv4(), req.params.id, req.user!.id, 'Monthly', 30, contactedDay, nextDueStr, now
    );
  }

  const log = db.prepare('SELECT * FROM agent_activity_log WHERE id=?').get(logId);
  const updatedFollowup = db.prepare('SELECT * FROM agent_followups WHERE agent_id=?').get(req.params.id);
  return res.status(201).json({ log, followup: updatedFollowup });
});

export default router;
