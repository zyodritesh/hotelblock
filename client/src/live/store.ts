export type Phase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'live';

export interface Toast {
  title: string;
  body: string;
}

export interface LiveSnapshot {
  unreadChat: number;
  online: string[];
  phase: Phase;
  peerName: string;
  peerId: string;
  callId: string;
  connectedAt: number;
  error: string;
  toast: Toast | null;
}

let snapshot: LiveSnapshot = {
  unreadChat: 0,
  online: [],
  phase: 'idle',
  peerName: '',
  peerId: '',
  callId: '',
  connectedAt: 0,
  error: '',
  toast: null,
};

const listeners = new Set<() => void>();

export function getSnapshot() {
  return snapshot;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function patch(partial: Partial<LiveSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  listeners.forEach(listener => listener());
}
