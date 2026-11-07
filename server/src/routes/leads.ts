import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, segment, stage } = req.query as Record<string, string>;
  let q = `SELECT l.*, u.name as user_name, a.name as account_name, c.name as contact_name FROM leads l
    LEFT JOIN users u ON l.user_id=u.id LEFT JOIN accounts a ON l.account_id=a.id LEFT JOIN contacts c ON l.contact_id=c.id WHERE 1=1`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { q += ' AND l.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND l.user_id = ?'; params.push(user_id); }
  if (segment) { q += ' AND l.segment = ?'; params.push(segment); }
  if (stage) { q += ' AND l.stage = ?'; params.push(stage); }
  q += ' ORDER BY l.updated_at DESC';
  return res.json(db.prepare(q).all(...params));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { account_id, contact_id, title, segment, stage, estimated_revenue, event_date, room_nights, pax, notes } = req.body;
  if (!title || !segment) return res.status(400).json({ error: 'title, segment required' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO leads (id,account_id,contact_id,user_id,title,segment,stage,estimated_revenue,event_date,room_nights,pax,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, account_id||null, contact_id||null, req.user!.id, title, segment,
    stage||'Prospect', estimated_revenue||0, event_date||null, room_nights||0, pax||0, notes||'', now, now
  );
  return res.status(201).json(db.prepare('SELECT * FROM leads WHERE id=?').get(id));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id) as any;
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && lead.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  const { account_id, contact_id, title, segment, stage, estimated_revenue, event_date, room_nights, pax, notes } = req.body;
  const now = new Date().toISOString();
  db.prepare(`UPDATE leads SET account_id=?,contact_id=?,title=?,segment=?,stage=?,estimated_revenue=?,event_date=?,room_nights=?,pax=?,notes=?,updated_at=? WHERE id=?`).run(
    account_id??lead.account_id, contact_id??lead.contact_id, title??lead.title, segment??lead.segment,
    stage??lead.stage, estimated_revenue??lead.estimated_revenue, event_date??lead.event_date,
    room_nights??lead.room_nights, pax??lead.pax, notes??lead.notes, now, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id) as any;
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && lead.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
