import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, denyUnlessOwner, ownScope, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { account_id, search, limit = '50', offset = '0' } = req.query as Record<string, string>;
  let base = 'FROM contacts c LEFT JOIN accounts a ON c.account_id = a.id WHERE 1=1';
  const params: any[] = [];
  if (ownScope(req.user!.role)) { base += ' AND c.created_by = ?'; params.push(req.user!.id); }
  if (account_id) { base += ' AND c.account_id = ?'; params.push(account_id); }
  if (search) { base += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.title LIKE ?)'; const s = `%${search}%`; params.push(s, s, s, s); }
  const total = (db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT c.*, a.name as account_name ${base} ORDER BY c.name LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));
  return res.json({ data: rows, total });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const contact = db.prepare('SELECT c.*, a.name as account_name FROM contacts c LEFT JOIN accounts a ON c.account_id=a.id WHERE c.id=?').get(req.params.id) as any;
  if (!contact) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, contact.created_by)) return;
  const own = ownScope(req.user!.role) ? ' AND user_id = ?' : '';
  const params = ownScope(req.user!.role) ? [req.params.id, req.user!.id] : [req.params.id];
  const calls = db.prepare(`SELECT * FROM calls WHERE contact_id=?${own} ORDER BY created_at DESC LIMIT 20`).all(...params);
  const meetings = db.prepare(`SELECT * FROM meetings WHERE contact_id=?${own} ORDER BY meeting_date DESC LIMIT 20`).all(...params);
  return res.json({ ...contact as object, calls, meetings });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { account_id, name, title, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO contacts (id,account_id,name,title,phone,email,notes,created_by) VALUES (?,?,?,?,?,?,?,?)').run(id, account_id||null, name, title||'', phone||'', email||'', notes||'', req.user!.id);
  return res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id=?').get(id));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id) as any;
  if (!contact) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, contact.created_by)) return;
  const { account_id, name, title, phone, email, notes } = req.body;
  db.prepare('UPDATE contacts SET account_id=?,name=?,title=?,phone=?,email=?,notes=? WHERE id=?').run(
    account_id??contact.account_id, name??contact.name, title??contact.title, phone??contact.phone, email??contact.email, notes??contact.notes, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id) as any;
  if (!contact) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, contact.created_by)) return;
  db.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
