import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import db from './db';

const file = path.join(__dirname, '../../data/vapid.json');
let keys = { publicKey: '', privateKey: '' };

export function initPush() {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) {
    keys = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(file, JSON.stringify(keys));
  }
  webpush.setVapidDetails('mailto:admin@hotel.com', keys.publicKey, keys.privateKey);
}

export function pushPublicKey() {
  return keys.publicKey;
}

export function pushToUsers(userIds: string[], payload: { title: string; body: string; url?: string }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length || !keys.publicKey) return;
  const rows = db.prepare(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`,
  ).all(...ids) as { id: string; endpoint: string; p256dh: string; auth: string }[];
  for (const row of rows) {
    webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload),
    ).catch((err: { statusCode?: number }) => {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(row.id);
      }
    });
  }
}
