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
  const direct = db.prepare(`SELECT * FROM team_calls WHERE to_user_id=? AND IFNULL(is_group,0)=0 AND status='ringing' AND created_at>=? ORDER BY created_at DESC LIMIT 1`).get(me, cutoff) as any;
  const group = direct ? null : db.prepare(`SELECT c.*, cv.title as chat_title FROM team_calls c
    JOIN call_participants p ON p.call_id=c.id
    LEFT JOIN conversations cv ON cv.id=c.conversation_id
    WHERE p.user_id=? AND p.status='ringing' AND c.is_group=1 AND c.status='accepted' AND c.created_at>=?
    ORDER BY c.created_at DESC LIMIT 1`).get(me, cutoff) as any;
  const ringing = direct || group;
  if (ringing) {
    const fromName = (db.prepare('SELECT name FROM users WHERE id=?').get(ringing.from_user_id) as { name: string } | undefined)?.name || 'Teammate';
    send('call', {
      action: 'ring',
      call: {
        ...ringing,
        from_name: fromName,
        to_name: req.user!.name,
        is_group: !!ringing.is_group,
        title: ringing.chat_title || ringing.title || null,
        offer_sdp: ringing.is_group ? null : ringing.offer_sdp,
      },
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
