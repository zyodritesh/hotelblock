import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, segment, outcome, from, to, limit = '100', offset = '0' } = req.query as Record<string, string>;
  let q = `SELECT c.*, u.name as user_name FROM calls c LEFT JOIN users u ON c.user_id = u.id WHERE 1=1`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { q += ' AND c.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND c.user_id = ?'; params.push(user_id); }
  if (segment) { q += ' AND c.segment = ?'; params.push(segment); }
  if (outcome) { q += ' AND c.outcome = ?'; params.push(outcome); }
  if (from) { q += ' AND date(c.created_at) >= ?'; params.push(from); }
  if (to) { q += ' AND date(c.created_at) <= ?'; params.push(to); }
  q += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const rows = db.prepare(q).all(...params);
  return res.json(rows);
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { contact_id, contact_name, company, phone, segment, call_type, duration_min, outcome, notes, next_action, next_action_date } = req.body;
  if (!segment || !call_type || !outcome) return res.status(400).json({ error: 'segment, call_type, outcome required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO calls (id,contact_id,contact_name,company,phone,user_id,segment,call_type,duration_min,outcome,notes,next_action,next_action_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, contact_id||null, contact_name||'', company||'', phone||'', req.user!.id, segment, call_type, duration_min||0, outcome, notes||'', next_action||'', next_action_date||null);
  if (next_action && next_action_date) {
    db.prepare('INSERT INTO tasks (id,call_id,user_id,title,due_date) VALUES (?,?,?,?,?)').run(uuidv4(), id, req.user!.id, next_action, next_action_date);
  }
  const row = db.prepare('SELECT * FROM calls WHERE id=?').get(id);
  return res.status(201).json(row);
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(req.params.id) as any;
  if (!call) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && call.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  const { contact_name, company, phone, segment, call_type, duration_min, outcome, notes, next_action, next_action_date } = req.body;
  db.prepare(`UPDATE calls SET contact_name=?,company=?,phone=?,segment=?,call_type=?,duration_min=?,outcome=?,notes=?,next_action=?,next_action_date=? WHERE id=?`).run(
    contact_name??call.contact_name, company??call.company, phone??call.phone, segment??call.segment, call_type??call.call_type,
    duration_min??call.duration_min, outcome??call.outcome, notes??call.notes, next_action??call.next_action, next_action_date??call.next_action_date, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM calls WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=?').get(req.params.id) as any;
  if (!call) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && call.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM calls WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
