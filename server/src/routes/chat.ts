import fs from 'fs';
import path from 'path';
import { Router, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { isOnline, publish } from '../live';
import { notifyUsers } from '../notify';

const router = Router();
router.use(authenticate);

const uploadDir = path.join(__dirname, '../../../uploads/chat');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname || '').toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only photos can be sent'));
  },
});

const typingAt = new Map<string, Map<string, number>>();

function person(id: string) {
  return db.prepare('SELECT id, name, role FROM users WHERE id=? AND active=1').get(id) as { id: string; name: string; role: string } | undefined;
}

function membersOf(conversationId: string) {
  return db.prepare(`SELECT u.id, u.name, u.role FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id=? ORDER BY u.name`).all(conversationId) as { id: string; name: string; role: string }[];
}

function isMember(conversationId: string, userId: string) {
  return !!db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?').get(conversationId, userId);
}

function unreadFor(userId: string) {
  return (db.prepare(`SELECT COUNT(*) as c FROM messages msg
    JOIN conversation_members m ON m.conversation_id = msg.conversation_id AND m.user_id=?
    WHERE msg.from_user_id != ? AND msg.deleted_at IS NULL AND IFNULL(msg.kind,'user') != 'system'
      AND (m.last_read_at IS NULL OR msg.created_at > m.last_read_at)`).get(userId, userId) as { c: number }).c;
}

function presentMessage(row: any) {
  let attachments: string[] = [];
  try { attachments = JSON.parse(row.attachments || '[]'); } catch { attachments = []; }
  const deleted = !!row.deleted_at;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    from_user_id: row.from_user_id,
    from_name: row.from_name || '',
    body: deleted ? '' : row.body,
    attachments: deleted ? [] : attachments,
    kind: row.kind || 'user',
    created_at: row.created_at,
    edited_at: row.edited_at || null,
    deleted_at: row.deleted_at || null,
  };
}

function loadConversation(id: string) {
  return db.prepare('SELECT * FROM conversations WHERE id=?').get(id) as any;
}

function presentConversation(row: any, me: string) {
  const members = membersOf(row.id).map(m => ({ ...m, online: isOnline(m.id) }));
  const others = members.filter(m => m.id !== me);
  const title = row.title || others.map(m => m.name).join(', ') || 'Chat';
  const last = db.prepare(`SELECT body, created_at, from_user_id, deleted_at, kind FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1`).get(row.id) as any;
  const read = db.prepare('SELECT last_read_at FROM conversation_members WHERE conversation_id=? AND user_id=?').get(row.id, me) as { last_read_at: string | null } | undefined;
  const unread = (db.prepare(`SELECT COUNT(*) as c FROM messages WHERE conversation_id=? AND from_user_id != ? AND deleted_at IS NULL AND IFNULL(kind,'user') != 'system' AND (? IS NULL OR created_at > ?)`).get(row.id, me, read?.last_read_at || null, read?.last_read_at || '') as { c: number }).c;
  return {
    id: row.id,
    title,
    is_group: !!row.is_group,
    members,
    online: others.some(m => m.online),
    last: last ? { body: last.deleted_at ? 'Message deleted' : last.body, created_at: last.created_at, from_user_id: last.from_user_id, kind: last.kind } : null,
    unread,
  };
}

function directBetween(a: string, b: string) {
  return db.prepare(`SELECT c.* FROM conversations c
    JOIN conversation_members ma ON ma.conversation_id = c.id AND ma.user_id=?
    JOIN conversation_members mb ON mb.conversation_id = c.id AND mb.user_id=?
    WHERE c.is_group=0 LIMIT 1`).get(a, b) as any;
}

function ensureDirect(me: string, otherId: string) {
  const existing = directBetween(me, otherId);
  if (existing) return existing;
  const id = uuidv4();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO conversations (id, title, is_group, created_by, created_at) VALUES (?,?,0,?,?)').run(id, null, me, now);
    const ins = db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)');
    ins.run(id, me);
    ins.run(id, otherId);
  });
  tx();
  return loadConversation(id);
}

function messagesFor(conversationId: string) {
  const rows = db.prepare(`SELECT msg.*, u.name as from_name FROM messages msg JOIN users u ON u.id = msg.from_user_id
    WHERE msg.conversation_id=? ORDER BY msg.created_at ASC LIMIT 400`).all(conversationId);
  return rows.map(presentMessage);
}

function markRead(conversationId: string, userId: string) {
  db.prepare('UPDATE conversation_members SET last_read_at=? WHERE conversation_id=? AND user_id=?').run(new Date().toISOString(), conversationId, userId);
}

function fanout(conversationId: string, event: unknown, except?: string) {
  for (const member of membersOf(conversationId)) {
    if (member.id === except) continue;
    publish(member.id, 'chat', event);
  }
}

function notifyMembers(conversationId: string, actor: { id: string; name: string }, body: string) {
  const ids = membersOf(conversationId).map(m => m.id);
  const convo = loadConversation(conversationId);
  const title = convo?.is_group ? (convo.title || 'Group') : actor.name;
  notifyUsers(ids, actor.id, { type: 'chat', title, body, url: `/chat/c/${conversationId}` });
}

router.get('/unread', (req: AuthRequest, res: Response) => {
  return res.json({ unread: unreadFor(req.user!.id) });
});

router.get('/threads', (req: AuthRequest, res: Response) => {
  const me = req.user!.id;
  const rows = db.prepare(`SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id=c.id AND m.user_id=?`).all(me) as any[];
  const threads = rows.map(row => ({ ...presentConversation(row, me), path: `/chat/c/${row.id}` }));
  const directUserIds = new Set(threads.filter(t => !t.is_group).flatMap(t => t.members.map(m => m.id)));
  const people = db.prepare('SELECT id, name, role FROM users WHERE active=1 AND id!=? ORDER BY name').all(me) as { id: string; name: string; role: string }[];
  for (const personRow of people) {
    if (directUserIds.has(personRow.id)) continue;
    threads.push({
      id: `user:${personRow.id}`,
      title: personRow.name,
      is_group: false,
      path: `/chat/${personRow.id}`,
      members: [{ ...personRow, online: isOnline(personRow.id) }],
      online: isOnline(personRow.id),
      last: null,
      unread: 0,
    } as any);
  }
  threads.sort((a, b) => {
    const at = a.last?.created_at || '';
    const bt = b.last?.created_at || '';
    if (at !== bt) return bt.localeCompare(at);
    return a.title.localeCompare(b.title);
  });
  return res.json({ threads, people, unread: unreadFor(me) });
});

router.get('/with/:userId', (req: AuthRequest, res: Response) => {
  const me = req.user!.id;
  const other = person(req.params.userId);
  if (!other || other.id === me) return res.status(404).json({ error: 'Person not found' });
  const convo = ensureDirect(me, other.id);
  markRead(convo.id, me);
  return res.json({ conversation: presentConversation(convo, me), messages: messagesFor(convo.id), people: db.prepare('SELECT id, name, role FROM users WHERE active=1 AND id!=? ORDER BY name').all(me), unread: unreadFor(me) });
});

router.get('/conversations/:id', (req: AuthRequest, res: Response) => {
  const me = req.user!.id;
  const convo = loadConversation(req.params.id);
  if (!convo || !isMember(convo.id, me)) return res.status(404).json({ error: 'Chat not found' });
  markRead(convo.id, me);
  return res.json({ conversation: presentConversation(convo, me), messages: messagesFor(convo.id), people: db.prepare('SELECT id, name, role FROM users WHERE active=1 AND id!=? ORDER BY name').all(me), unread: unreadFor(me) });
});

router.post('/groups', (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const ids = [...new Set((Array.isArray(req.body.member_ids) ? req.body.member_ids : []).map(String))].filter(id => id && id !== me.id);
  if (ids.length < 2) return res.status(400).json({ error: 'Pick at least two people for a group' });
  const found = ids.map(person).filter(Boolean) as { id: string; name: string }[];
  if (found.length !== ids.length) return res.status(400).json({ error: 'Each person must be on the team' });
  const title = String(req.body.title || '').trim() || found.map(p => p.name).join(', ');
  const id = uuidv4();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO conversations (id, title, is_group, created_by, created_at) VALUES (?,?,1,?,?)').run(id, title, me.id, now);
    const ins = db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)');
    ins.run(id, me.id);
    for (const memberId of ids) ins.run(id, memberId);
    db.prepare(`INSERT INTO messages (id, from_user_id, to_user_id, conversation_id, body, kind, created_at) VALUES (?,?,?,?,?,'system',?)`).run(
      uuidv4(), me.id, me.id, id, `${me.name} started the group`, now,
    );
  });
  tx();
  const convo = loadConversation(id);
  const started = db.prepare(`SELECT msg.*, u.name as from_name FROM messages msg JOIN users u ON u.id=msg.from_user_id WHERE msg.conversation_id=? ORDER BY msg.created_at DESC LIMIT 1`).get(id);
  fanout(id, { action: 'message', message: presentMessage(started) });
  fanout(id, { action: 'members', conversation_id: id });
  notifyMembers(id, me, `${me.name} added you to ${title}`);
  return res.status(201).json({ conversation: presentConversation(convo, me.id) });
});

router.post('/conversations/:id/members', (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const convo = loadConversation(req.params.id);
  if (!convo || !isMember(convo.id, me.id)) return res.status(404).json({ error: 'Chat not found' });
  const added = person(String(req.body.user_id || ''));
  if (!added || added.id === me.id) return res.status(400).json({ error: 'Choose a teammate' });
  if (isMember(convo.id, added.id)) return res.json({ conversation: presentConversation(convo, me.id), already: true });
  const now = new Date().toISOString();
  const names = [...membersOf(convo.id).map(m => m.name), added.name];
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(convo.id, added.id);
    if (!convo.is_group) {
      db.prepare('UPDATE conversations SET is_group=1, title=? WHERE id=?').run(convo.title || names.join(', '), convo.id);
    }
    db.prepare(`INSERT INTO messages (id, from_user_id, to_user_id, conversation_id, body, kind, created_at) VALUES (?,?,?,?,?,'system',?)`).run(
      uuidv4(), me.id, added.id, convo.id, `${me.name} added ${added.name}`, now,
    );
  });
  tx();
  const saved = loadConversation(convo.id);
  const presented = presentConversation(saved, me.id);
  const note = db.prepare(`SELECT msg.*, u.name as from_name FROM messages msg JOIN users u ON u.id=msg.from_user_id WHERE msg.conversation_id=? ORDER BY msg.created_at DESC LIMIT 1`).get(convo.id);
  fanout(convo.id, { action: 'message', message: presentMessage(note) });
  fanout(convo.id, { action: 'members', conversation_id: convo.id, conversation: presented });
  notifyUsers([added.id], me.id, { type: 'chat', title: presented.title, body: `${me.name} added you to the chat`, url: `/chat/c/${convo.id}` });
  return res.json({ conversation: presented });
});

function saveMessage(conversationId: string, actor: { id: string; name: string }, body: string, attachments: string[]) {
  const convo = loadConversation(conversationId);
  if (!convo) return { error: 'Chat not found' as const };
  if (!isMember(conversationId, actor.id)) return { error: 'Chat not found' as const };
  if (!body && !attachments.length) return { error: 'Write a message or add a photo' as const };
  if (body.length > 2000) return { error: 'Message is too long' as const };
  const members = membersOf(conversationId);
  const other = members.find(m => m.id !== actor.id);
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO messages (id, from_user_id, to_user_id, conversation_id, body, attachments, kind, created_at) VALUES (?,?,?,?,?,?,'user',?)`).run(
    id, actor.id, convo.is_group ? actor.id : (other?.id || actor.id), conversationId, body, JSON.stringify(attachments), now,
  );
  const message = presentMessage({ id, from_user_id: actor.id, from_name: actor.name, conversation_id: conversationId, body, attachments: JSON.stringify(attachments), kind: 'user', created_at: now, edited_at: null, deleted_at: null });
  fanout(conversationId, { action: 'message', message });
  const preview = body || (attachments.length ? `Sent ${attachments.length} photo${attachments.length > 1 ? 's' : ''}` : '');
  notifyMembers(conversationId, actor, preview);
  return { message };
}

router.post('/conversations/:id/messages', (req: AuthRequest, res: Response) => {
  upload.array('photos', 8)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not add those photos' });
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    const attachments = files.map(file => `/uploads/chat/${file.filename}`);
    const saved = saveMessage(req.params.id, req.user!, String(req.body.body || '').trim(), attachments);
    if ('error' in saved) return res.status(400).json({ error: saved.error });
    return res.status(201).json(saved.message);
  });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const me = req.user!;
  const conversationId = String(req.body.conversation_id || '');
  const to = person(String(req.body.to_user_id || ''));
  const convo = conversationId ? loadConversation(conversationId) : (to ? ensureDirect(me.id, to.id) : null);
  if (!convo) return res.status(400).json({ error: 'Choose a chat' });
  const saved = saveMessage(convo.id, me, String(req.body.body || '').trim(), []);
  if ('error' in saved) return res.status(400).json({ error: saved.error });
  return res.status(201).json(saved.message);
});

router.put('/messages/:id', (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id) as any;
  if (!row || !isMember(row.conversation_id, req.user!.id)) return res.status(404).json({ error: 'Message not found' });
  if (row.from_user_id !== req.user!.id || row.kind === 'system' || row.deleted_at) return res.status(400).json({ error: 'This message cannot be edited' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Write a message' });
  if (body.length > 2000) return res.status(400).json({ error: 'Message is too long' });
  const now = new Date().toISOString();
  db.prepare('UPDATE messages SET body=?, edited_at=? WHERE id=?').run(body, now, row.id);
  const message = presentMessage({ ...row, body, edited_at: now, from_name: req.user!.name });
  fanout(row.conversation_id, { action: 'update', message });
  return res.json(message);
});

router.delete('/messages/:id', (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id) as any;
  if (!row || !isMember(row.conversation_id, req.user!.id)) return res.status(404).json({ error: 'Message not found' });
  if (row.from_user_id !== req.user!.id || row.kind === 'system') return res.status(400).json({ error: 'This message cannot be deleted' });
  const now = new Date().toISOString();
  db.prepare(`UPDATE messages SET deleted_at=?, body='' WHERE id=?`).run(now, row.id);
  const message = presentMessage({ ...row, body: '', deleted_at: now, from_name: req.user!.name });
  fanout(row.conversation_id, { action: 'update', message });
  return res.json(message);
});

router.post('/conversations/:id/typing', (req: AuthRequest, res: Response) => {
  const convo = loadConversation(req.params.id);
  if (!convo || !isMember(convo.id, req.user!.id)) return res.status(404).json({ error: 'Chat not found' });
  const bucket = typingAt.get(convo.id) || new Map();
  bucket.set(req.user!.id, Date.now());
  typingAt.set(convo.id, bucket);
  fanout(convo.id, { action: 'typing', conversation_id: convo.id, user_id: req.user!.id, name: req.user!.name }, req.user!.id);
  return res.json({ ok: true });
});

export default router;
