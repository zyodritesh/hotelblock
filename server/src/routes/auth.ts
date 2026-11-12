import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { JWT_SECRET, authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email) as any;
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

router.post('/change-password', authenticate, (req: AuthRequest, res: Response) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user!.id);
  return res.json({ success: true });
});

export default router;
