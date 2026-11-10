import { Router, Response } from 'express';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { onlineIds, subscribe } from '../live';

const router = Router();
router.use(authenticate);

router.get('/online', (_req: AuthRequest, res: Response) => {
  return res.json(onlineIds());
});

router.get('/stream', (req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const me = req.user!.id;
  send('hello', { online: onlineIds() });
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const ringing = db.prepare(`SELECT * FROM team_calls WHERE to_user_id=? AND status='ringing' AND created_at>=? ORDER BY created_at DESC LIMIT 1`).get(me, cutoff) as any;
  if (ringing) {
    const fromName = (db.prepare('SELECT name FROM users WHERE id=?').get(ringing.from_user_id) as { name: string } | undefined)?.name || 'Teammate';
    send('call', {
      action: 'ring',
      call: { ...ringing, from_name: fromName, to_name: req.user!.name },
    });
  }
  const unsubscribe = subscribe(me, send);
  const ping = setInterval(() => { res.write(': ping\n\n'); }, 20000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});

export default router;
