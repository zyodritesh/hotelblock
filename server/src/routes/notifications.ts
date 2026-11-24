import { Router, Response } from 'express';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const data = db.prepare(
    'SELECT id, type, title, body, lead_id, read_at, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 40',
  ).all(req.user!.id);
  const unread = (db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND read_at IS NULL',
  ).get(req.user!.id) as { c: number }).c;
  return res.json({ data, unread });
});

router.post('/read-all', (req: AuthRequest, res: Response) => {
  db.prepare(
    'UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',
  ).run(new Date().toISOString(), req.user!.id);
  return res.json({ success: true });
});

router.post('/:id/read', (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT id, user_id FROM notifications WHERE id=?').get(req.params.id) as { id: string; user_id: string } | undefined;
  if (!row || row.user_id !== req.user!.id) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE notifications SET read_at=? WHERE id=?').run(new Date().toISOString(), row.id);
  return res.json({ success: true });
});

export default router;
