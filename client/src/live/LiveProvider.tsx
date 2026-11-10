import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { getSnapshot, patch } from './store';
import { onCallEvent, showIncoming } from './session';
import CallOverlay from '../components/CallOverlay';

let lastToastKey = '';
function showToast(title: string, body: string) {
  const key = `${title}\n${body}`;
  if (!title || key === lastToastKey) return;
  lastToastKey = key;
  patch({ toast: { title, body } });
  setTimeout(() => { if (lastToastKey === key) lastToastKey = ''; }, 2500);
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function listen(token: string, onEvent: (event: string, data: any) => void, signal: AbortSignal) {
  const res = await fetch('/api/live/stream', { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok || !res.body) throw new Error('stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (!part || part.startsWith(':')) continue;
      let event = 'message';
      let data = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try { onEvent(event, JSON.parse(data)); } catch { /* ignore a partial frame */ }
    }
  }
}

export default function LiveProvider() {
  const token = useAuthStore(s => s.token);
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let stopped = false;

    const onEvent = (event: string, data: any) => {
      if (event === 'hello') patch({ online: data.online || [] });
      if (event === 'notification') {
        window.dispatchEvent(new Event('hb-refresh-notes'));
        const path = pathRef.current;
        const sameChat = data.type === 'chat' && data.url && path === data.url;
        if (!sameChat) showToast(data.title, data.body);
      }
      if (event === 'chat') window.dispatchEvent(new CustomEvent('hb-chat', { detail: data }));
      if (event === 'call') onCallEvent(data);
    };

    const run = async () => {
      while (!stopped) {
        try { await listen(token, onEvent, controller.signal); } catch { /* reconnect */ }
        if (stopped || controller.signal.aborted) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };
    run();

    const poll = setInterval(() => {
      if (getSnapshot().phase === 'idle') {
        api.get<any>('/team-calls/incoming').then(call => { if (call?.id) showIncoming(call); }).catch(() => {});
      }
      api.get<{ unread: number }>('/chat/unread').then(r => patch({ unreadChat: r.unread })).catch(() => {});
    }, 3000);

    api.get<{ unread: number }>('/chat/unread').then(r => patch({ unreadChat: r.unread })).catch(() => {});

    return () => {
      stopped = true;
      controller.abort();
      clearInterval(poll);
    };
  }, [token]);

  useEffect(() => {
    if (!token || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'push') return;
      showToast(event.data.data?.title || 'HotelBlock', event.data.data?.body || '');
      window.dispatchEvent(new Event('hb-refresh-notes'));
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [token]);

  return <CallOverlay />;
}

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser cannot show phone notifications. Add HotelBlock to the home screen and try again.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in the phone settings.');
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api.get<{ publicKey: string }>('/push/public-key');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api.post('/push/subscribe', subscription.toJSON());
}
