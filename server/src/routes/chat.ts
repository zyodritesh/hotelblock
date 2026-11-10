import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { isOnline, publish } from '../live';
import { notifyUsers } from '../notify';

const router = Router();
router.use(authenticate);

function person(id: string) {
  return db.prepare('SELECT id, name, role FROM users WHERE id=? AND active=1').get(id) as { id: string; name: string; role: string } | undefined;
}

function unreadFor(userId: string) {
  return (db.prepare('SELECT COUNT(*) as c FROM messages WHERE to_user_id=? AND read_at IS NULL').get(userId) as { c: number }).c;
}

router.get('/unread', (req: AuthRequest, res: Response) => {
  return res.json({ unread: unreadFor(req.user!.id) });
});

router.get('/threads', (req: AuthRequest, res: Response) => {
  const me = req.user!.id;
  const users = db.prepare('SELECT id, name, role FROM users WHERE active=1 AND id!=? ORDER BY name').all(me) as { id: string; name: string; role: string }[];
  const lastStmt = db.prepare(`SELECT body, created_at, from_user_id FROM messages
    WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)
    ORDER BY created_at DESC LIMIT 1`);
  const unreadStmt = db.prepare('SELECT COUNT(*) as c FROM messages WHERE from_user_id=? AND to_user_id=? AND read_at IS NULL');
  const threads = users.map(u => {
    const last = lastStmt.get(me, u.id, u.id, me) as { body: string; created_at: string; from_user_id: string } | undefined;
    const unread = (unreadStmt.get(u.id, me) as { c: number }).c;
    return { id: u.id, name: u.name, role: u.role, online: isOnline(u.id), last: last || null, unread };
  });
  threads.sort((a, b) => {
    const at = a.last?.created_at || '';
    const bt = b.last?.created_at || '';
    if (at !== bt) return bt.localeCompare(at);
    return a.name.localeCompare(b.name);
  });
  return res.json({ threads, unread: unreadFor(me) });
});

router.get('/with/:userId', (req: AuthRequest, res: Response) => {
  const me = req.user!.id;
  const other = person(req.params.userId);
  if (!other || other.id === me) return res.status(404).json({ error: 'Person not found' });
  const now = new Date().toISOString();
  db.prepare('UPDATE messages SET read_at=? WHERE from_user_id=? AND to_user_id=? AND read_at IS NULL').run(now, other.id, me);
  const messages = db.prepare(`SELECT id, from_user_id, to_user_id, body, created_at, read_at FROM messages
    WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)
    ORDER BY created_at ASC LIMIT 300`).all(me, other.id, other.id, me);
  return res.json({ person: { ...other, online: isOnline(other.id) }, messages, unread: unreadFor(me) });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const to = person(String(req.body.to_user_id || ''));
  const body = String(req.body.body || '').trim();
  if (!to || to.id === me.id) return res.status(400).json({ error: 'Choose a teammate' });
  if (!body) return res.status(400).json({ error: 'Write a message' });
  if (body.length > 2000) return res.status(400).json({ error: 'Message is too long' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO messages (id, from_user_id, to_user_id, body, created_at) VALUES (?,?,?,?,?)').run(id, me.id, to.id, body, now);
  const message = { id, from_user_id: me.id, to_user_id: to.id, body, created_at: now, read_at: null, from_name: me.name };
  publish(to.id, 'chat', message);
  publish(me.id, 'chat', message);
  notifyUsers([to.id], me.id, {
    type: 'chat',
    title: me.name,
    body,
    url: `/chat/${me.id}`,
  });
  return res.status(201).json(message);
});

export default router;
