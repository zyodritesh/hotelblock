import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, ownScope, AuthRequest } from '../middleware/auth';
import { followUpDate } from '../dates';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, segment, outcome, call_type, from, to, search, property_id, limit = '50', offset = '0' } = req.query as Record<string, string>;
  let base = `FROM calls c LEFT JOIN users u ON c.user_id = u.id LEFT JOIN properties pr ON c.property_id = pr.id WHERE 1=1`;
  const params: any[] = [];
  if (ownScope(req.user!.role)) { base += ' AND c.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { base += ' AND c.user_id = ?'; params.push(user_id); }
  if (segment) { base += ' AND c.segment = ?'; params.push(segment); }
  if (outcome) { base += ' AND c.outcome = ?'; params.push(outcome); }
  if (call_type) { base += ' AND c.call_type = ?'; params.push(call_type); }
  if (from) { base += ' AND date(c.created_at) >= ?'; params.push(from); }
  if (to) { base += ' AND date(c.created_at) <= ?'; params.push(to); }
  if (property_id) { base += ' AND c.property_id = ?'; params.push(property_id); }
  if (search) {
    base += ' AND (c.contact_name LIKE ? OR c.company LIKE ? OR c.phone LIKE ? OR c.notes LIKE ? OR u.name LIKE ? OR pr.name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }
  const total = (db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT c.*, u.name as user_name, pr.name as property_name ${base} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));
  return res.json({ data: rows, total });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { contact_id, contact_name, company, phone, segment, call_type, duration_min, outcome, notes, next_action, next_action_date, property_id } = req.body;
  if (!segment || !call_type || !outcome) return res.status(400).json({ error: 'segment, call_type, outcome required' });
  const parsedFollow = followUpDate(next_action_date);
  if (parsedFollow.error) return res.status(400).json({ error: parsedFollow.error });
  const hotel = property_id && db.prepare('SELECT id FROM properties WHERE id=? AND active=1').get(property_id) ? property_id : null;
  const id = uuidv4();
  db.prepare(`INSERT INTO calls (id,contact_id,contact_name,company,phone,user_id,property_id,segment,call_type,duration_min,outcome,notes,next_action,next_action_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, contact_id||null, contact_name||'', company||'', phone||'', req.user!.id, hotel, segment, call_type, duration_min||0, outcome, notes||'', next_action||'', parsedFollow.date);
  if (next_action && parsedFollow.date) {
    db.prepare('INSERT INTO tasks (id,call_id,user_id,title,due_date) VALUES (?,?,?,?,?)').run(uuidv4(), id, req.user!.id, next_action, parsedFollow.date);
  }
  const row = db.prepare('SELECT * FROM calls WHERE id=?').get(id);
  return res.status(201).json(row);
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(req.params.id) as any;
  if (!call) return res.status(404).json({ error: 'Not found' });
  if (ownScope(req.user!.role) && call.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  const { contact_name, company, phone, segment, call_type, duration_min, outcome, notes, next_action, next_action_date, property_id } = req.body;
  let nextDate = call.next_action_date;
  if (next_action_date !== undefined) {
    const same = String(next_action_date || '').slice(0, 10) === String(call.next_action_date || '').slice(0, 10);
    if (!same) {
      const parsedFollow = followUpDate(next_action_date);
      if (parsedFollow.error) return res.status(400).json({ error: parsedFollow.error });
      nextDate = parsedFollow.date;
    }
  }
  const hotel = property_id !== undefined
    ? (property_id && db.prepare('SELECT id FROM properties WHERE id=? AND active=1').get(property_id) ? property_id : null)
    : call.property_id;
  db.prepare(`UPDATE calls SET contact_name=?,company=?,phone=?,property_id=?,segment=?,call_type=?,duration_min=?,outcome=?,notes=?,next_action=?,next_action_date=? WHERE id=?`).run(
    contact_name??call.contact_name, company??call.company, phone??call.phone, hotel, segment??call.segment, call_type??call.call_type,
    duration_min??call.duration_min, outcome??call.outcome, notes??call.notes, next_action??call.next_action, nextDate, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM calls WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(req.params.id) as any;
  if (!call) return res.status(404).json({ error: 'Not found' });
  if (ownScope(req.user!.role) && call.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM calls WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
