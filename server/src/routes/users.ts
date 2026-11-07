import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'executive') {
    return res.json(db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id=?').all(req.user!.id));
  }
  if (req.user!.role === 'manager') {
    return res.json(db.prepare("SELECT id, name, email, role, active, created_at FROM users WHERE active=1 AND role IN ('executive','manager') ORDER BY name").all());
  }
  const users = db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY name').all();
  return res.json(users);
});

router.post('/', requireAdmin, (req: AuthRequest, res: Response) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, name, email, hash, role || 'executive');
  const user = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(id);
  return res.status(201).json(user);
});

router.put('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const { name, email, role, active, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }
  db.prepare('UPDATE users SET name=?, email=?, role=?, active=? WHERE id=?').run(
    name ?? user.name, email ?? user.email, role ?? user.role, active ?? user.active, req.params.id
  );
  const updated = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(req.params.id);
  return res.json(updated);
});

router.delete('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
