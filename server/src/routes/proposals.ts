import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { user_id, status } = req.query as Record<string, string>;
  let q = `SELECT p.*, u.name as user_name, l.title as lead_title, l.segment FROM proposals p
    LEFT JOIN users u ON p.user_id=u.id LEFT JOIN leads l ON p.lead_id=l.id WHERE 1=1`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { q += ' AND p.user_id = ?'; params.push(req.user!.id); }
  else if (user_id) { q += ' AND p.user_id = ?'; params.push(user_id); }
  if (status) { q += ' AND p.status = ?'; params.push(status); }
  q += ' ORDER BY p.updated_at DESC';
  return res.json(db.prepare(q).all(...params));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { lead_id, title, status, total_value, line_items, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO proposals (id,lead_id,user_id,title,status,total_value,line_items,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    id, lead_id||null, req.user!.id, title, status||'Draft', total_value||0,
    JSON.stringify(line_items||[]), notes||'', now, now
  );
  return res.status(201).json(db.prepare('SELECT * FROM proposals WHERE id=?').get(id));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && p.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  const { title, status, total_value, line_items, notes } = req.body;
  const now = new Date().toISOString();
  db.prepare('UPDATE proposals SET title=?,status=?,total_value=?,line_items=?,notes=?,updated_at=? WHERE id=?').run(
    title??p.title, status??p.status, total_value??p.total_value,
    line_items !== undefined ? JSON.stringify(line_items) : p.line_items,
    notes??p.notes, now, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const p = db.prepare('SELECT * FROM proposals WHERE id=?').get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role === 'executive' && p.user_id !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM proposals WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
