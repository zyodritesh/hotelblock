import { v4 as uuidv4 } from 'uuid';
import db from './db';
import { publish } from './live';
import { pushToUsers } from './push';

export function notifyUsers(
  userIds: string[],
  actorId: string,
  note: { type: string; title: string; body: string; leadId?: string; url?: string },
) {
  const ins = db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, lead_id, created_at) VALUES (?,?,?,?,?,?,?)',
  );
  const now = new Date().toISOString();
  const url = note.url || (note.leadId ? '/pipeline' : '/phone');
  const targets: string[] = [];
  for (const id of userIds) {
    if (!id || id === actorId) continue;
    ins.run(uuidv4(), id, note.type, note.title, note.body, note.leadId || null, now);
    targets.push(id);
    publish(id, 'notification', { title: note.title, body: note.body, leadId: note.leadId || null, type: note.type, url });
  }
  pushToUsers(targets, { title: note.title, body: note.body, url });
}
