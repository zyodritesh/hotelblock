import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, denyUnlessOwner, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { search, type, limit = '50', offset = '0' } = req.query as Record<string, string>;
  let base = `FROM accounts a LEFT JOIN contacts c ON c.account_id = a.id WHERE 1=1`;
  const params: any[] = [];
  if (req.user!.role === 'executive') { base += ' AND a.created_by = ?'; params.push(req.user!.id); }
  if (search) { base += ' AND (a.name LIKE ? OR a.type LIKE ? OR a.address LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
  if (type) { base += ' AND a.type = ?'; params.push(type); }
  const total = (db.prepare(`SELECT COUNT(DISTINCT a.id) as c ${base}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT a.*, COUNT(c.id) as contact_count ${base} GROUP BY a.id ORDER BY a.name LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));
  return res.json({ data: rows, total });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id) as any;
  if (!account) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, account.created_by)) return;
  const own = req.user!.role === 'executive' ? ' AND created_by = ?' : '';
  const ownParams = req.user!.role === 'executive' ? [req.params.id, req.user!.id] : [req.params.id];
  const contacts = db.prepare(`SELECT * FROM contacts WHERE account_id=?${own}`).all(...ownParams);
  const callOwn = req.user!.role === 'executive' ? ' AND c.user_id = ?' : '';
  const calls = db.prepare(`SELECT c.*, u.name as user_name FROM calls c LEFT JOIN users u ON c.user_id=u.id WHERE c.contact_id IN (SELECT id FROM contacts WHERE account_id=?)${callOwn} ORDER BY c.created_at DESC LIMIT 20`).all(...ownParams);
  const leads = db.prepare(`SELECT * FROM leads WHERE account_id=?${req.user!.role === 'executive' ? ' AND user_id = ?' : ''} ORDER BY updated_at DESC`).all(...ownParams);
  return res.json({ ...account as object, contacts, calls, leads });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { name, type, phone, email, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO accounts (id,name,type,phone,email,address,notes,created_by) VALUES (?,?,?,?,?,?,?,?)').run(id, name, type||'Corporate', phone||'', email||'', address||'', notes||'', req.user!.id);
  return res.status(201).json(db.prepare('SELECT * FROM accounts WHERE id=?').get(id));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id) as any;
  if (!account) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, account.created_by)) return;
  const { name, type, phone, email, address, notes } = req.body;
  db.prepare('UPDATE accounts SET name=?,type=?,phone=?,email=?,address=?,notes=? WHERE id=?').run(
    name??account.name, type??account.type, phone??account.phone, email??account.email, address??account.address, notes??account.notes, req.params.id
  );
  return res.json(db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id) as any;
  if (!account) return res.status(404).json({ error: 'Not found' });
  if (denyUnlessOwner(req, res, account.created_by)) return;
  db.prepare('DELETE FROM accounts WHERE id=?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
