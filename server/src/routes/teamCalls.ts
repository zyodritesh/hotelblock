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
  const direct = db.prepare(`SELECT id FROM team_calls WHERE IFNULL(is_group,0)=0 AND status IN ('ringing','accepted') AND (from_user_id=? OR to_user_id=?)`).get(userId, userId) as { id: string } | undefined;
  if (direct) return direct;
  return db.prepare(`SELECT c.id as id FROM team_calls c JOIN call_participants p ON p.call_id=c.id WHERE c.status IN ('ringing','accepted') AND p.user_id=? AND p.status IN ('ringing','joined')`).get(userId) as { id: string } | undefined;
}

function party(call: any, userId: string) {
  if (!call) return false;
  if (call.is_group) return !!db.prepare('SELECT 1 FROM call_participants WHERE call_id=? AND user_id=?').get(call.id, userId);
  return call.from_user_id === userId || call.to_user_id === userId;
}

function groupTitle(call: any) {
  if (!call?.conversation_id) return 'Group call';
  const row = db.prepare('SELECT title FROM conversations WHERE id=?').get(call.conversation_id) as { title: string | null } | undefined;
  return row?.title || 'Group call';
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
    offer_sdp: call.is_group ? null : call.offer_sdp,
    is_group: !!call.is_group,
    conversation_id: call.conversation_id || null,
    title: call.is_group ? groupTitle(call) : null,
    created_at: call.created_at,
  };
}

export function incomingFor(userId: string) {
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const direct = db.prepare(`SELECT * FROM team_calls WHERE to_user_id=? AND IFNULL(is_group,0)=0 AND status='ringing' AND created_at>=? ORDER BY created_at DESC LIMIT 1`).get(userId, cutoff);
  if (direct) return present(direct);
  const group = db.prepare(`SELECT c.* FROM team_calls c JOIN call_participants p ON p.call_id=c.id
    WHERE p.user_id=? AND p.status='ringing' AND c.is_group=1 AND c.status='accepted' AND c.created_at>=?
    ORDER BY c.created_at DESC LIMIT 1`).get(userId, cutoff);
  return present(group);
}

router.get('/incoming', (req: AuthRequest, res: Response) => {
  return res.json(incomingFor(req.user!.id));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const me = req.user!;
  if (req.body.conversation_id) return startGroup(req, res);
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

router.post('/:id/join', (req: AuthRequest, res: Response) => {
  const call = load(req.params.id);
  if (!call?.is_group || !party(call, req.user!.id)) return res.status(404).json({ error: 'Call not found' });
  if (call.status !== 'accepted') return res.status(400).json({ error: 'This call has ended' });
  const mine = db.prepare('SELECT status FROM call_participants WHERE call_id=? AND user_id=?').get(call.id, req.user!.id) as { status: string } | undefined;
  if (!mine || !['ringing', 'joined'].includes(mine.status)) return res.status(400).json({ error: 'This call is no longer ringing' });
  db.prepare(`UPDATE call_participants SET status='joined' WHERE call_id=? AND user_id=?`).run(call.id, req.user!.id);
  const peers = db.prepare(`SELECT u.id, u.name FROM call_participants p JOIN users u ON u.id=p.user_id WHERE p.call_id=? AND p.status='joined' AND p.user_id!=?`).all(call.id, req.user!.id);
  for (const peer of peers as { id: string }[]) {
    publish(peer.id, 'call', { action: 'peer-joined', callId: call.id, userId: req.user!.id, name: req.user!.name });
  }
  return res.json({ peers });
});

router.post('/:id/decline', (req: AuthRequest, res: Response) => {
  const call = load(req.params.id);
  if (call?.is_group) {
    if (!party(call, req.user!.id)) return res.status(403).json({ error: 'Forbidden' });
    db.prepare(`UPDATE call_participants SET status='declined' WHERE call_id=? AND user_id=? AND status='ringing'`).run(call.id, req.user!.id);
    const joined = db.prepare(`SELECT user_id FROM call_participants WHERE call_id=? AND status='joined'`).all(call.id) as { user_id: string }[];
    for (const peer of joined) publish(peer.user_id, 'call', { action: 'peer-declined', callId: call.id, name: req.user!.name });
    return res.json({ ok: true });
  }
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
  if (call.is_group) return leaveGroup(call, req, res);
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
  if (call.is_group) return signalGroup(call, req, res);
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

function startGroup(req: AuthRequest, res: Response) {
  const me = req.user!;
  const convo = db.prepare('SELECT * FROM conversations WHERE id=?').get(String(req.body.conversation_id || '')) as any;
  if (!convo?.is_group) return res.status(400).json({ error: 'Choose a group chat' });
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?').get(convo.id, me.id);
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const people = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?').all(convo.id, me.id) as { user_id: string }[];
  if (!people.length) return res.status(400).json({ error: 'Nobody else is in this chat' });
  if (busy(me.id)) return res.status(409).json({ error: 'Already on a call' });
  const id = uuidv4();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO team_calls (id, from_user_id, to_user_id, status, conversation_id, is_group, created_at, answered_at) VALUES (?,?,?,'accepted',?,1,?,?)`).run(
      id, me.id, '', convo.id, now, now,
    );
    const ins = db.prepare('INSERT INTO call_participants (call_id, user_id, status) VALUES (?,?,?)');
    ins.run(id, me.id, 'joined');
    for (const person of people) ins.run(id, person.user_id, 'ringing');
  });
  tx();
  const call = present(load(id));
  for (const person of people) {
    publish(person.user_id, 'call', { action: 'ring', call });
  }
  notifyUsers(people.map(p => p.user_id), me.id, {
    type: 'call',
    title: `${me.name} started a group call`,
    body: call?.title || 'Open HotelBlock to join',
    url: `/chat/c/${convo.id}`,
  });
  return res.status(201).json(call);
}

function leaveGroup(call: any, req: AuthRequest, res: Response) {
  const now = new Date().toISOString();
  db.prepare(`UPDATE call_participants SET status='left' WHERE call_id=? AND user_id=? AND status IN ('joined','ringing')`).run(call.id, req.user!.id);
  const still = db.prepare(`SELECT user_id FROM call_participants WHERE call_id=? AND status='joined'`).all(call.id) as { user_id: string }[];
  if (!still.length) {
    const status = call.answered_at ? 'ended' : 'cancelled';
    db.prepare(`UPDATE team_calls SET status=?, ended_at=? WHERE id=?`).run(status, now, call.id);
    const rest = db.prepare(`SELECT user_id FROM call_participants WHERE call_id=? AND status='ringing'`).all(call.id) as { user_id: string }[];
    for (const person of rest) publish(person.user_id, 'call', { action: status, callId: call.id });
  } else {
    for (const person of still) publish(person.user_id, 'call', { action: 'peer-left', callId: call.id, userId: req.user!.id, name: req.user!.name });
  }
  return res.json({ ok: true });
}

function signalGroup(call: any, req: AuthRequest, res: Response) {
  const to = String(req.body.to_user_id || '');
  const kind = String(req.body.kind || '');
  if (!to || !party(call, to)) return res.status(400).json({ error: 'Choose who to reach' });
  if (!['offer', 'answer', 'ice'].includes(kind)) return res.status(400).json({ error: 'Unsupported signal' });
  const payload = kind === 'ice' ? req.body.candidate : req.body.sdp;
  if (!payload) return res.status(400).json({ error: 'Missing call data' });
  db.prepare('INSERT INTO team_call_signals (id, call_id, from_user_id, to_user_id, kind, payload, created_at) VALUES (?,?,?,?,?,?,?)').run(
    uuidv4(), call.id, req.user!.id, to, kind, JSON.stringify(payload), new Date().toISOString(),
  );
  publish(to, 'call', {
    action: 'signal',
    callId: call.id,
    from: req.user!.id,
    signal: kind === 'ice' ? { kind, candidate: payload } : { kind, sdp: payload },
  });
  return res.json({ ok: true });
}

export function sweepMissedCalls() {
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const now = new Date().toISOString();
  const ringingPeople = db.prepare(`SELECT p.user_id, c.id as call_id, c.from_user_id FROM call_participants p JOIN team_calls c ON c.id=p.call_id
    WHERE c.is_group=1 AND c.status='accepted' AND p.status='ringing' AND c.created_at < ?`).all(cutoff) as { user_id: string; call_id: string; from_user_id: string }[];
  for (const row of ringingPeople) {
    db.prepare(`UPDATE call_participants SET status='missed' WHERE call_id=? AND user_id=? AND status='ringing'`).run(row.call_id, row.user_id);
    publish(row.user_id, 'call', { action: 'missed', callId: row.call_id });
    notifyUsers([row.user_id], row.from_user_id, {
      type: 'call',
      title: 'Missed group call',
      body: `${userName(row.from_user_id)} called the group`,
      url: '/chat',
    });
  }
  const rows = db.prepare(`SELECT * FROM team_calls WHERE IFNULL(is_group,0)=0 AND status='ringing' AND created_at < ?`).all(cutoff) as any[];
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
