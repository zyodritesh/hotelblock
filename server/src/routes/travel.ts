import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, ownScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const STAGES = ['planned', 'to_schedule', 'confirmed', 'met', 'missed'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(value: unknown, max: number) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function canSee(req: AuthRequest, userId: string) {
  return !ownScope(req.user!.role) || userId === req.user!.id;
}

function planById(id: string) {
  return db.prepare(`
    SELECT p.*, u.name AS user_name
    FROM travel_plans p JOIN users u ON u.id = p.user_id
    WHERE p.id=?
  `).get(id) as any;
}

function stopsFor(planId: string) {
  return db.prepare('SELECT * FROM travel_stops WHERE plan_id=? ORDER BY meet_date, meet_time, agent_name').all(planId);
}

router.get('/agents', (req: AuthRequest, res: Response) => {
  const q = clean(req.query.q, 80);
  const city = clean(req.query.city, 80);
  if (q.length < 2 && !city) return res.json([]);
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT id, name, agency_name, city, phone
    FROM agents
    WHERE status != 'Deleted'
      AND (? = '' OR name LIKE ? OR agency_name LIKE ? OR city LIKE ? OR phone LIKE ?)
      AND (? = '' OR city LIKE ?)
    ORDER BY CASE WHEN lower(city)=lower(?) THEN 0 ELSE 1 END, name
    LIMIT 12
  `).all(q, like, like, like, like, city, `%${city}%`, city);
  return res.json(rows);
});

router.get('/', (req: AuthRequest, res: Response) => {
  const q = clean(req.query.q, 80);
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const userId = String(req.query.user_id || '');
  let sql = `SELECT p.*, u.name AS user_name FROM travel_plans p JOIN users u ON u.id=p.user_id WHERE 1=1`;
  const params: any[] = [];
  if (ownScope(req.user!.role)) { sql += ' AND p.user_id=?'; params.push(req.user!.id); }
  else if (userId) { sql += ' AND p.user_id=?'; params.push(userId); }
  if (from) { sql += ' AND p.end_date>=?'; params.push(from); }
  if (to) { sql += ' AND p.start_date<=?'; params.push(to); }
  if (q) { sql += ' AND (p.city LIKE ? OR p.title LIKE ? OR u.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY p.start_date DESC';
  const plans = db.prepare(sql).all(...params) as any[];
  const counts = db.prepare(`SELECT plan_id, stage, COUNT(*) AS c FROM travel_stops GROUP BY plan_id, stage`).all() as { plan_id: string; stage: string; c: number }[];
  return res.json(plans.map(plan => ({
    ...plan,
    stages: Object.fromEntries(STAGES.map(stage => [stage, counts.filter(row => row.plan_id === plan.id && row.stage === stage).reduce((sum, row) => sum + row.c, 0)])),
  })));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const city = clean(req.body?.city, 80);
  const start = String(req.body?.start_date || '');
  const end = String(req.body?.end_date || '');
  const notes = clean(req.body?.notes, 500);
  const title = clean(req.body?.title, 80) || `${city} agent meetings`;
  if (!city) return res.status(400).json({ error: 'Add the city' });
  if (!DAY.test(start) || !DAY.test(end) || end < start) return res.status(400).json({ error: 'Choose the travel dates' });
  let userId = req.user!.id;
  if (!ownScope(req.user!.role) && req.body?.user_id) {
    const person = db.prepare("SELECT id FROM users WHERE id=? AND role!='agent'").get(String(req.body.user_id)) as { id: string } | undefined;
    if (!person) return res.status(400).json({ error: 'Choose who is travelling' });
    userId = person.id;
  }
  const id = uuidv4();
  db.prepare(`INSERT INTO travel_plans (id,user_id,city,title,start_date,end_date,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, userId, city, title, start, end, notes, 'planning', new Date().toISOString());
  return res.status(201).json(planById(id));
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const plan = planById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Trip not found' });
  if (!canSee(req, plan.user_id)) return res.status(403).json({ error: 'You can only open your own travel plan' });
  return res.json({ ...plan, stops: stopsFor(plan.id) });
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const plan = planById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Trip not found' });
  if (!canSee(req, plan.user_id)) return res.status(403).json({ error: 'You can only edit your own travel plan' });
  const city = req.body?.city !== undefined ? clean(req.body.city, 80) : plan.city;
  const start = req.body?.start_date || plan.start_date;
  const end = req.body?.end_date || plan.end_date;
  const notes = req.body?.notes !== undefined ? clean(req.body.notes, 500) : plan.notes;
  const title = req.body?.title !== undefined ? (clean(req.body.title, 80) || `${city} agent meetings`) : plan.title;
  const status = req.body?.status === 'done' ? 'done' : 'planning';
  if (!city || !DAY.test(start) || !DAY.test(end) || end < start) return res.status(400).json({ error: 'Check the city and the dates' });
  db.prepare('UPDATE travel_plans SET city=?, title=?, start_date=?, end_date=?, notes=?, status=? WHERE id=?')
    .run(city, title, start, end, notes, status, plan.id);
  return res.json({ ...planById(plan.id), stops: stopsFor(plan.id) });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const plan = planById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Trip not found' });
  if (!canSee(req, plan.user_id)) return res.status(403).json({ error: 'You can only delete your own travel plan' });
  db.prepare('DELETE FROM travel_stops WHERE plan_id=?').run(plan.id);
  db.prepare('DELETE FROM travel_plans WHERE id=?').run(plan.id);
  return res.json({ ok: true });
});

function resolveAgent(req: AuthRequest, body: any, city: string) {
  const agentId = clean(body?.agent_id, 80);
  if (agentId) {
    return db.prepare("SELECT id, name, agency_name, phone FROM agents WHERE id=? AND status!='Deleted'").get(agentId) as any;
  }
  const name = clean(body?.agent_name, 80);
  if (!name) return null;
  const found = db.prepare("SELECT id, name, agency_name, phone FROM agents WHERE lower(name)=lower(?) AND lower(COALESCE(city,''))=lower(?) AND status!='Deleted'").get(name, city) as any;
  if (found) return found;
  const id = uuidv4();
  const agency = clean(body?.agency_name, 80);
  const phone = clean(body?.phone, 30);
  db.prepare(`INSERT INTO agents (id,name,agency_name,type,city,phone,status,assigned_to,created_by,created_at) VALUES (?,?,?,'Travel Agent',?,?,'Active',?,?,?)`)
    .run(id, name, agency, city, phone, req.user!.id, req.user!.id, new Date().toISOString());
  return { id, name, agency_name: agency, phone };
}

function readStop(body: any, plan: any, current?: any) {
  const stage = (STAGES as readonly string[]).includes(body?.stage) ? body.stage : (current?.stage || 'planned');
  const meetDate = body?.meet_date === '' ? '' : (body?.meet_date || current?.meet_date || '');
  const meetTime = body?.meet_time === '' ? '' : clean(body?.meet_time ?? current?.meet_time, 5);
  if (meetDate && (!DAY.test(meetDate) || meetDate < plan.start_date || meetDate > plan.end_date)) {
    return { error: `The meeting day has to be between ${plan.start_date} and ${plan.end_date}` };
  }
  if (meetTime && !TIME.test(meetTime)) return { error: 'Enter the time as 11:00' };
  if ((stage === 'confirmed' || stage === 'met') && (!meetDate || !meetTime)) {
    return { error: 'Add the day and the time before confirming' };
  }
  return {
    stage,
    meet_date: meetDate || null,
    meet_time: meetTime,
    call_note: body?.call_note !== undefined ? clean(body.call_note, 500) : (current?.call_note || ''),
    outcome_note: body?.outcome_note !== undefined ? clean(body.outcome_note, 500) : (current?.outcome_note || ''),
  };
}

function recordProgress(stop: any, plan: any, userId: string) {
  const now = new Date().toISOString();
  if (stop.agent_id && stop.call_note && !stop.call_activity_id) {
    const id = uuidv4();
    db.prepare('INSERT INTO agent_activity_log (id,agent_id,user_id,type,outcome,notes,contacted_at,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, stop.agent_id, userId, 'Call', 'Travel plan', stop.call_note, (stop.meet_date || plan.start_date), now);
    db.prepare('UPDATE travel_stops SET call_activity_id=? WHERE id=?').run(id, stop.id);
    stop.call_activity_id = id;
  }
  if (stop.stage === 'met' && stop.agent_id && !stop.meeting_activity_id) {
    const activityId = uuidv4();
    const when = stop.meet_date || plan.start_date;
    const note = [plan.city, when, stop.meet_time, stop.outcome_note].filter(Boolean).join(' · ');
    db.prepare('INSERT INTO agent_activity_log (id,agent_id,user_id,type,outcome,notes,contacted_at,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(activityId, stop.agent_id, userId, 'Meeting', 'Met', note, when, now);
    const meetingId = uuidv4();
    db.prepare(`INSERT INTO meetings (id,contact_name,company,user_id,segment,purpose,outcome,notes,address_label,meeting_date)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      meetingId, stop.agent_name, stop.agency_name, userId, 'Corporate', 'Sales Visit',
      stop.outcome_note || 'Met', stop.call_note || note, plan.city,
      `${when}T${stop.meet_time || '09:00'}:00`,
    );
    db.prepare('UPDATE travel_stops SET meeting_activity_id=?, meeting_id=? WHERE id=?').run(activityId, meetingId, stop.id);
  }
}

router.post('/:id/stops', (req: AuthRequest, res: Response) => {
  const plan = planById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Trip not found' });
  if (!canSee(req, plan.user_id)) return res.status(403).json({ error: 'You can only add meetings on your own travel plan' });
  const agent = resolveAgent(req, req.body, plan.city);
  if (!agent) return res.status(400).json({ error: 'Choose an agent, or type the name' });
  const fields = readStop(req.body, plan);
  if ('error' in fields) return res.status(400).json({ error: fields.error });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO travel_stops (
    id,plan_id,agent_id,agent_name,agency_name,phone,stage,meet_date,meet_time,call_note,outcome_note,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, plan.id, agent.id, agent.name, agent.agency_name || clean(req.body?.agency_name, 80), agent.phone || clean(req.body?.phone, 30),
    fields.stage, fields.meet_date, fields.meet_time, fields.call_note, fields.outcome_note, now, now,
  );
  recordProgress(db.prepare('SELECT * FROM travel_stops WHERE id=?').get(id), plan, plan.user_id);
  return res.status(201).json(db.prepare('SELECT * FROM travel_stops WHERE id=?').get(id));
});

router.put('/:id/stops/:stopId', (req: AuthRequest, res: Response) => {
  const plan = planById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Trip not found' });
  if (!canSee(req, plan.user_id)) return res.status(403).json({ error: 'You can only edit your own travel plan' });
  const stop = db.prepare('SELECT * FROM travel_stops WHERE id=? AND plan_id=?').get(req.params.stopId, plan.id) as any;
  if (!stop) return res.status(404).json({ error: 'Meeting not found' });
  const fields = readStop(req.body, plan, stop);
  if ('error' in fields) return res.status(400).json({ error: fields.error });
  db.prepare(`UPDATE travel_stops SET stage=?, meet_date=?, meet_time=?, call_note=?, outcome_note=?, updated_at=? WHERE id=?`)
    .run(fields.stage, fields.meet_date, fields.meet_time, fields.call_note, fields.outcome_note, new Date().toISOString(), stop.id);
  recordProgress(db.prepare('SELECT * FROM travel_stops WHERE id=?').get(stop.id), plan, plan.user_id);
  return res.json(db.prepare('SELECT * FROM travel_stops WHERE id=?').get(stop.id));
});

router.delete('/:id/stops/:stopId', (req: AuthRequest, res: Response) => {
  const plan = planById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Trip not found' });
  if (!canSee(req, plan.user_id)) return res.status(403).json({ error: 'You can only edit your own travel plan' });
  db.prepare('DELETE FROM travel_stops WHERE id=? AND plan_id=?').run(req.params.stopId, plan.id);
  return res.json({ ok: true });
});

export function ensureSampleTrip() {
  const user = db.prepare("SELECT id FROM users WHERE email='krishan@hotel.com'").get() as { id: string } | undefined;
  if (!user) return;
  const existing = db.prepare('SELECT id FROM travel_plans WHERE user_id=?').get(user.id);
  if (existing) return;
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO travel_plans (id,user_id,city,title,start_date,end_date,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, user.id, 'Ahmedabad', 'Ahmedabad agent meetings', '2026-11-17', '2026-11-20', 'Fix meetings with travel agents before the trip.', 'planning', now);
  const agents = db.prepare("SELECT id, name, agency_name, phone FROM agents WHERE city='Ahmedabad' AND status!='Deleted' ORDER BY name LIMIT 4").all() as any[];
  const samples = [
    { stage: 'planned', meet_date: null, meet_time: '', call_note: '' },
    { stage: 'to_schedule', meet_date: '2026-11-18', meet_time: '', call_note: 'Called once. Waiting for a time.' },
    { stage: 'confirmed', meet_date: '2026-11-18', meet_time: '11:00', call_note: 'Confirmed on the call for 11 am.' },
    { stage: 'confirmed', meet_date: '2026-11-19', meet_time: '16:00', call_note: 'Evening meeting confirmed.' },
  ];
  agents.forEach((agent, index) => {
    const sample = samples[index] || samples[0];
    db.prepare(`INSERT INTO travel_stops (
      id,plan_id,agent_id,agent_name,agency_name,phone,stage,meet_date,meet_time,call_note,outcome_note,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      uuidv4(), id, agent.id, agent.name, agent.agency_name || '', agent.phone || '',
      sample.stage, sample.meet_date, sample.meet_time, sample.call_note, '', now, now,
    );
  });
}

export default router;
