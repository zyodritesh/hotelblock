import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { publish } from '../live';
import { notifyUsers } from '../notify';

const router = Router();
router.use(authenticate);

function userName(id: string) {
  return (db.prepare('SELECT name FROM users WHERE id=?').get(id) as { name: string } | undefined)?.name || 'Teammate';
}

function load(id: string) {
  return db.prepare('SELECT * FROM team_calls WHERE id=?').get(id) as any;
}

function busy(userId: string) {
  return db.prepare(`SELECT id FROM team_calls WHERE status IN ('ringing','accepted') AND (from_user_id=? OR to_user_id=?)`).get(userId, userId) as { id: string } | undefined;
}

function party(call: any, userId: string) {
  return call && (call.from_user_id === userId || call.to_user_id === userId);
}

function present(call: any) {
  if (!call) return null;
  return {
    id: call.id,
    from_user_id: call.from_user_id,
    to_user_id: call.to_user_id,
    from_name: userName(call.from_user_id),
    to_name: userName(call.to_user_id),
    status: call.status,
    offer_sdp: call.offer_sdp,
    created_at: call.created_at,
  };
}

router.get('/incoming', (req: AuthRequest, res: Response) => {
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const call = db.prepare(`SELECT * FROM team_calls WHERE to_user_id=? AND status='ringing' AND created_at>=? ORDER BY created_at DESC LIMIT 1`).get(req.user!.id, cutoff);
  return res.json(present(call));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const toId = String(req.body.to_user_id || '');
  const offer = String(req.body.offer || '');
  const to = db.prepare('SELECT id, name FROM users WHERE id=? AND active=1').get(toId) as { id: string; name: string } | undefined;
  if (!to || to.id === me.id) return res.status(400).json({ error: 'Choose a teammate' });
  if (!offer || offer.length > 200000) return res.status(400).json({ error: 'Call could not start' });
  if (busy(me.id) || busy(to.id)) return res.status(409).json({ error: 'Already on a call' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO team_calls (id, from_user_id, to_user_id, status, offer_sdp, created_at) VALUES (?,?,?,'ringing',?,?)`).run(id, me.id, to.id, offer, now);
  const call = present(load(id));
  publish(to.id, 'call', { action: 'ring', call });
  notifyUsers([to.id], me.id, {
    type: 'call',
    title: `${me.name} is calling`,
    body: 'Open HotelBlock to answer',
    url: '/phone',
  });
  return res.status(201).json(call);
});

router.post('/:id/answer', (req: AuthRequest, res: Response) => {
  const call = load(req.params.id);
  if (!call || call.to_user_id !== req.user!.id) return res.status(403).json({ error: 'Only the person being called can answer' });
  if (call.status !== 'ringing') return res.status(400).json({ error: 'This call is no longer ringing' });
  const answer = String(req.body.answer || '');
  if (!answer) return res.status(400).json({ error: 'Missing answer' });
  const now = new Date().toISOString();
  db.prepare(`UPDATE team_calls SET status='accepted', answer_sdp=?, answered_at=? WHERE id=?`).run(answer, now, call.id);
  publish(call.from_user_id, 'call', { action: 'signal', callId: call.id, signal: { kind: 'answer', sdp: answer } });
  return res.json({ ok: true });
});

router.post('/:id/decline', (req: AuthRequest, res: Response) => {
  const call = load(req.params.id);
  if (!call || call.to_user_id !== req.user!.id) return res.status(403).json({ error: 'Only the person being called can decline' });
  if (call.status !== 'ringing') return res.json({ ok: true });
  const now = new Date().toISOString();
  db.prepare(`UPDATE team_calls SET status='declined', ended_at=? WHERE id=?`).run(now, call.id);
  publish(call.from_user_id, 'call', { action: 'declined', callId: call.id });
  return res.json({ ok: true });
});

router.post('/:id/end', (req: AuthRequest, res: Response) => {
  const call = load(req.params.id);
  if (!party(call, req.user!.id)) return res.status(403).json({ error: 'Forbidden' });
  if (!['ringing', 'accepted'].includes(call.status)) return res.json({ ok: true });
  const now = new Date().toISOString();
  const status = call.status === 'ringing' ? 'cancelled' : 'ended';
  db.prepare(`UPDATE team_calls SET status=?, ended_at=? WHERE id=?`).run(status, now, call.id);
  const other = req.user!.id === call.from_user_id ? call.to_user_id : call.from_user_id;
  publish(other, 'call', { action: status, callId: call.id });
  return res.json({ ok: true });
});

router.post('/:id/signal', (req: AuthRequest, res: Response) => {
  const call = load(req.params.id);
  if (!party(call, req.user!.id)) return res.status(403).json({ error: 'Forbidden' });
  if (!['ringing', 'accepted'].includes(call.status)) return res.status(400).json({ error: 'Call has ended' });
  if (req.body.kind !== 'ice' || !req.body.candidate) return res.status(400).json({ error: 'Missing candidate' });
  const now = new Date().toISOString();
  db.prepare('INSERT INTO team_call_signals (id, call_id, from_user_id, kind, payload, created_at) VALUES (?,?,?,?,?,?)').run(
    uuidv4(), call.id, req.user!.id, 'ice', JSON.stringify(req.body.candidate), now,
  );
  const other = req.user!.id === call.from_user_id ? call.to_user_id : call.from_user_id;
  publish(other, 'call', { action: 'signal', callId: call.id, signal: { kind: 'ice', candidate: req.body.candidate } });
  return res.json({ ok: true });
});

router.get('/:id/signals', (req: AuthRequest, res: Response) => {
  const call = load(req.params.id);
  if (!party(call, req.user!.id)) return res.status(403).json({ error: 'Forbidden' });
  const rows = db.prepare('SELECT kind, payload FROM team_call_signals WHERE call_id=? AND from_user_id!=? ORDER BY created_at').all(call.id, req.user!.id) as { kind: string; payload: string }[];
  return res.json(rows.map(r => ({ kind: r.kind, payload: JSON.parse(r.payload) })));
});

export function sweepMissedCalls() {
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const now = new Date().toISOString();
  const rows = db.prepare(`SELECT * FROM team_calls WHERE status='ringing' AND created_at < ?`).all(cutoff) as any[];
  for (const call of rows) {
    const changed = db.prepare(`UPDATE team_calls SET status='missed', ended_at=? WHERE id=? AND status='ringing'`).run(now, call.id);
    if (!changed.changes) continue;
    publish(call.from_user_id, 'call', { action: 'missed', callId: call.id });
    publish(call.to_user_id, 'call', { action: 'missed', callId: call.id });
    notifyUsers([call.to_user_id], call.from_user_id, {
      type: 'call',
      title: 'Missed call',
      body: `${userName(call.from_user_id)} called you`,
      url: '/phone',
    });
  }
}

export default router;
