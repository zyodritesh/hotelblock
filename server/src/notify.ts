import { v4 as uuidv4 } from 'uuid';
import db from './db';

export function notifyUsers(
  userIds: string[],
  actorId: string,
  note: { type: string; title: string; body: string; leadId?: string },
) {
  const ins = db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, lead_id, created_at) VALUES (?,?,?,?,?,?,?)',
  );
  const now = new Date().toISOString();
  for (const id of userIds) {
    if (!id || id === actorId) continue;
    ins.run(uuidv4(), id, note.type, note.title, note.body, note.leadId || null, now);
  }
}
