type Send = (event: string, data: unknown) => void;

const clients = new Map<string, Set<Send>>();
const seen = new Map<string, number>();
const ONLINE_MS = 30000;
let presenceKey = '';

export function publish(userId: string, event: string, data: unknown) {
  const set = clients.get(userId);
  if (!set) return;
  for (const send of set) {
    try { send(event, data); } catch { /* a dropped connection is removed on close */ }
  }
}

function currentOnline() {
  const now = Date.now();
  const ids = new Set<string>(clients.keys());
  for (const [id, at] of seen) {
    if (now - at < ONLINE_MS) ids.add(id);
    else seen.delete(id);
  }
  return [...ids].sort();
}

function broadcastPresence() {
  const ids = currentOnline();
  const key = ids.join(',');
  if (key === presenceKey) return;
  presenceKey = key;
  for (const set of clients.values()) {
    for (const send of set) {
      try { send('hello', { online: ids }); } catch { /* a dropped connection is removed on close */ }
    }
  }
}

export function touch(userId: string) {
  if (!userId) return;
  seen.set(userId, Date.now());
  broadcastPresence();
}

export function subscribe(userId: string, send: Send) {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(send);
  touch(userId);
  return () => {
    set!.delete(send);
    if (set!.size === 0) clients.delete(userId);
    broadcastPresence();
  };
}

export function isOnline(userId: string) {
  if ((clients.get(userId)?.size || 0) > 0) return true;
  const at = seen.get(userId) || 0;
  return Date.now() - at < ONLINE_MS;
}

export function onlineIds() {
  return currentOnline();
}

setInterval(broadcastPresence, 5000).unref?.();
