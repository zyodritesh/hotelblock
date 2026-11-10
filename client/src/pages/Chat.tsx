import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { roleLabel } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { patch } from '../live/store';
import { startOutgoing } from '../live/session';

interface Thread {
  id: string; name: string; role: string; online: boolean; unread: number;
  last: { body: string; created_at: string; from_user_id: string } | null;
}
interface Message { id: string; from_user_id: string; to_user_id: string; body: string; created_at: string; }

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function Chat() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [person, setPerson] = useState<{ id: string; name: string; role: string; online?: boolean } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = () => {
    api.get<{ threads: Thread[]; unread: number }>('/chat/threads').then(r => {
      setThreads(r.threads);
      patch({ unreadChat: r.unread });
    }).catch(() => {});
  };

  const loadThread = (id: string) => {
    api.get<{ person: { id: string; name: string; role: string; online: boolean }; messages: Message[]; unread: number }>(`/chat/with/${id}`).then(r => {
      setPerson(r.person);
      setMessages(prev => {
        if (prev.length === r.messages.length && prev.every((item, index) => item.id === r.messages[index].id)) return prev;
        return r.messages;
      });
      patch({ unreadChat: r.unread });
    }).catch((err: any) => setError(err.message));
  };

  useEffect(() => { loadThreads(); }, [userId]);
  useEffect(() => { if (userId) loadThread(userId); }, [userId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  useEffect(() => {
    const onChat = (event: Event) => {
      const message = (event as CustomEvent).detail as Message;
      if (!userId) { loadThreads(); return; }
      if (message.from_user_id === userId || message.to_user_id === userId) {
        setMessages(prev => prev.some(item => item.id === message.id) ? prev : [...prev, message]);
        if (message.from_user_id === userId) loadThread(userId);
      }
    };
    window.addEventListener('hb-chat', onChat);
    return () => window.removeEventListener('hb-chat', onChat);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(() => loadThread(userId), 4000);
    return () => clearInterval(timer);
  }, [userId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !text.trim()) return;
    setSending(true); setError('');
    try {
      const message = await api.post<Message>('/chat', { to_user_id: userId, body: text.trim() });
      setMessages(prev => prev.some(item => item.id === message.id) ? prev : [...prev, message]);
      setText('');
      loadThreads();
    } catch (err: any) { setError(err.message); } finally { setSending(false); }
  };

  if (!userId) {
    return (
      <div className="max-w-lg mx-auto space-y-3">
        <h1 className="text-xl font-bold text-gray-900">💬 Team chat</h1>
        <p className="text-xs text-gray-500">A message here reaches that person on their phone.</p>
        <div className="space-y-2">
          {threads.map(thread => (
            <button key={thread.id} type="button" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 flex items-center gap-3 text-left" onClick={() => navigate(`/chat/${thread.id}`)}>
              <div className="relative w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                {thread.name[0]}
                {thread.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{thread.name}</p>
                  <span className="text-[11px] text-gray-400">{roleLabel(thread.role)}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{thread.last?.body || 'No messages yet'}</p>
              </div>
              {thread.unread > 0 && <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">{thread.unread}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto h-full flex flex-col">
      <div className="flex items-center gap-2 pb-3">
        <Link to="/chat" className="text-blue-600 text-sm">←</Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{person?.name || 'Chat'}</p>
          <p className="text-xs text-gray-500">{person ? roleLabel(person.role) : ''}</p>
        </div>
        {person && <button type="button" className="w-10 h-10 rounded-full bg-green-600 text-white" onClick={() => startOutgoing(person)}>☎</button>}
      </div>
      {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-2 text-sm">{error}</div>}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.map(message => {
          const mine = message.from_user_id === me?.id;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p className={`text-[10px] mt-1 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>{timeLabel(message.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 pt-3">
        <input className="input flex-1" placeholder="Message" value={text} onChange={e => setText(e.target.value)} />
        <button className="btn-primary" disabled={sending || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
