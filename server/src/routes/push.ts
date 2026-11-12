import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { pushPublicKey } from '../push';

const router = Router();
router.use(authenticate);

router.get('/public-key', (_req: AuthRequest, res: Response) => {
  return res.json({ publicKey: pushPublicKey() });
});

router.post('/subscribe', (req: AuthRequest, res: Response) => {
  const endpoint = String(req.body?.endpoint || '');
  const p256dh = String(req.body?.keys?.p256dh || '');
  const auth = String(req.body?.keys?.auth || '');
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Missing push subscription' });
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint);
  db.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?,?,?,?,?)').run(
    uuidv4(), req.user!.id, endpoint, p256dh, auth,
  );
  return res.json({ ok: true });
});

export default router;
