import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest, requireManagerOrAdmin } from '../middleware/auth';
import { notifyUsers } from '../notify';

const router = Router();
router.use(authenticate);

const DEVICE_ID = /^[A-Za-z0-9-]{8,80}$/;

function clean(value: unknown, max: number) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

router.post('/ping', (req: AuthRequest, res: Response) => {
  const id = clean(req.body?.id, 80);
  const label = clean(req.body?.label, 80) || 'Android phone';
  const version = clean(req.body?.version, 20);
  if (!DEVICE_ID.test(id)) return res.status(400).json({ error: 'Missing phone id' });
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT user_id FROM app_devices WHERE id=?').get(id) as { user_id: string } | undefined;
  if (!existing) {
    db.prepare('INSERT INTO app_devices (id, user_id, label, app_version, last_seen, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, req.user!.id, label, version, now, now);
  } else {
    if (existing.user_id !== req.user!.id) {
      db.prepare('DELETE FROM app_message_targets WHERE device_id=? AND delivered_at IS NULL').run(id);
    }
    db.prepare('UPDATE app_devices SET user_id=?, label=?, app_version=?, last_seen=? WHERE id=?')
      .run(req.user!.id, label, version, now, id);
  }
  return res.json({ ok: true });
});

router.get('/pending', (req: AuthRequest, res: Response) => {
  const deviceId = clean(req.query.device, 80);
  if (!DEVICE_ID.test(deviceId)) return res.json({ alert: null });
  const device = db.prepare('SELECT user_id FROM app_devices WHERE id=?').get(deviceId) as { user_id: string } | undefined;
  if (!device || device.user_id !== req.user!.id) return res.json({ alert: null });
  const alert = db.prepare(`
    SELECT t.id, m.title, m.body
    FROM app_message_targets t
    JOIN app_messages m ON m.id = t.message_id
    WHERE t.device_id=? AND t.user_id=? AND t.delivered_at IS NULL
    ORDER BY t.rowid ASC LIMIT 1
  `).get(deviceId, req.user!.id) as { id: string; title: string; body: string } | undefined;
  return res.json({ alert: alert || null });
});

router.post('/pending/:id/seen', (req: AuthRequest, res: Response) => {
  db.prepare(`UPDATE app_message_targets SET delivered_at=? WHERE id=? AND user_id=? AND delivered_at IS NULL`)
    .run(new Date().toISOString(), req.params.id, req.user!.id);
  return res.json({ ok: true });
});

router.get('/', requireManagerOrAdmin, (_req: AuthRequest, res: Response) => {
  const devices = db.prepare(`
    SELECT d.id, d.label, d.app_version, d.last_seen, d.created_at,
           u.id AS user_id, u.name, u.email, u.role
    FROM app_devices d
    JOIN users u ON u.id = d.user_id
    ORDER BY d.last_seen DESC
  `).all();
  return res.json(devices);
});

router.get('/messages', requireManagerOrAdmin, (_req: AuthRequest, res: Response) => {
  const rows = db.prepare(`
    SELECT m.id, m.title, m.body, m.created_at, u.name AS sender_name,
           COUNT(t.id) AS recipient_count,
           SUM(CASE WHEN t.delivered_at IS NOT NULL THEN 1 ELSE 0 END) AS delivered_count
    FROM app_messages m
    LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN app_message_targets t ON t.message_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
    LIMIT 30
  `).all();
  return res.json(rows);
});

router.post('/notify', requireManagerOrAdmin, (req: AuthRequest, res: Response) => {
  const title = clean(req.body?.title, 80);
  const body = String(req.body?.body || '').trim().slice(0, 500);
  const requested = Array.isArray(req.body?.device_ids) ? req.body.device_ids.map((id: unknown) => clean(id, 80)) : [];
  if (!title || !body) return res.status(400).json({ error: 'Write a title and a message' });
  const devices = (requested.length
    ? db.prepare(`SELECT id, user_id FROM app_devices WHERE id IN (${requested.map(() => '?').join(',')})`).all(...requested)
    : db.prepare('SELECT id, user_id FROM app_devices').all()
  ) as { id: string; user_id: string }[];
  if (!devices.length) return res.status(400).json({ error: 'No installed app is signed in yet' });

  const messageId = uuidv4();
  const now = new Date().toISOString();
  const insert = db.prepare('INSERT INTO app_message_targets (id, message_id, device_id, user_id) VALUES (?,?,?,?)');
  const save = db.transaction(() => {
    db.prepare('INSERT INTO app_messages (id, sender_id, title, body, created_at) VALUES (?,?,?,?,?)')
      .run(messageId, req.user!.id, title, body, now);
    for (const device of devices) insert.run(uuidv4(), messageId, device.id, device.user_id);
  });
  save();

  const staff: string[] = [];
  const agents: string[] = [];
  const roles = db.prepare(`SELECT id, role FROM users WHERE id IN (${[...new Set(devices.map(d => d.user_id))].map(() => '?').join(',')})`)
    .all(...[...new Set(devices.map(d => d.user_id))]) as { id: string; role: string }[];
  for (const person of roles) {
    if (person.role === 'agent') agents.push(person.id);
    else staff.push(person.id);
  }
  notifyUsers(staff, req.user!.id, { type: 'app', title, body, url: '/' });
  notifyUsers(agents, req.user!.id, { type: 'app', title, body, url: '/agent' });
  return res.json({ recipient_count: devices.length });
});

export default router;
