type Send = (event: string, data: unknown) => void;

const clients = new Map<string, Set<Send>>();

export function publish(userId: string, event: string, data: unknown) {
  const set = clients.get(userId);
  if (!set) return;
  for (const send of set) {
    try { send(event, data); } catch { /* a dropped connection is removed on close */ }
  }
}

export function subscribe(userId: string, send: Send) {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(send);
  return () => {
    set!.delete(send);
    if (set!.size === 0) clients.delete(userId);
  };
}

export function isOnline(userId: string) {
  return (clients.get(userId)?.size || 0) > 0;
}

export function onlineIds() {
  return [...clients.keys()];
}
