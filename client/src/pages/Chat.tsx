import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { roleLabel } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { patch } from '../live/store';
import { startGroupCall, startOutgoing } from '../live/session';

interface Member { id: string; name: string; role: string; online?: boolean; }
interface Thread {
  id: string; title: string; is_group: boolean; path: string; online: boolean; unread: number;
  members: Member[];
  last: { body: string; created_at: string; kind?: string } | null;
}
interface ChatMessage {
  id: string; conversation_id: string; from_user_id: string; from_name: string;
  body: string; attachments: string[]; kind: string; created_at: string;
  edited_at: string | null; deleted_at: string | null;
}
interface Conversation { id: string; title: string; is_group: boolean; members: Member[]; online?: boolean; }

const EMOJI = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😅','😢','😭','😡','👍','👎','🙏','👏','🔥','✅','❤️','💙','🎉','🥳','🤝','💯','✨','📞','🏨','💼','🎂','🥂','📍'];

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function highlight(body: string, names: string[]) {
  if (!body) return body;
  const safe = names.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!safe.length) return body;
  const pattern = new RegExp(`@(${safe.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = body.split(pattern);
  return parts.map((part, index) => safe.includes(part) ? <span key={index} className="font-semibold underline">@{part}</span> : <span key={index}>{part}</span>);
}

export default function Chat() {
  const { userId, conversationId } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState('');
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typedAt = useRef(0);
  const activeId = conversation?.id || '';

  const loadThreads = () => {
    api.get<{ threads: Thread[]; people: Member[]; unread: number }>('/chat/threads').then(r => {
      setThreads(r.threads);
      setPeople(r.people || []);
      patch({ unreadChat: r.unread });
    }).catch(() => {});
  };

  const applyThread = (r: { conversation: Conversation; messages: ChatMessage[]; people?: Member[]; unread: number }) => {
    if (userId && r.conversation?.id) navigate(`/chat/c/${r.conversation.id}`, { replace: true });
    setConversation(r.conversation);
    setPeople(r.people || []);
    setMessages(prev => {
      const next = r.messages;
      if (prev.length === next.length && prev.every((item, index) => item.id === next[index].id && item.body === next[index].body && item.edited_at === next[index].edited_at && item.deleted_at === next[index].deleted_at && item.attachments.length === next[index].attachments.length)) return prev;
      return next;
    });
    patch({ unreadChat: r.unread });
  };

  const loadThread = () => {
    const request = conversationId
      ? api.get<any>(`/chat/conversations/${conversationId}`)
      : userId ? api.get<any>(`/chat/with/${userId}`) : null;
    request?.then(applyThread).catch((err: any) => setError(err.message));
  };

  useEffect(() => { loadThreads(); }, [userId, conversationId]);
  useEffect(() => {
    setConversation(null);
    setMessages([]);
    setEditing(null);
    setText('');
    setPhotos([]);
    if (userId || conversationId) loadThread();
  }, [userId, conversationId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping(prev => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, row]) => row.until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onChat = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.action && detail?.conversation_id) return;
      if (detail.action === 'typing' && detail.conversation_id === activeId && detail.user_id !== me?.id) {
        setTyping(prev => ({ ...prev, [detail.user_id]: { name: detail.name, until: Date.now() + 3000 } }));
        return;
      }
      if (!activeId || (detail.message?.conversation_id !== activeId && detail.conversation_id !== activeId)) {
        loadThreads();
        return;
      }
      if (detail.action === 'message' && detail.message) {
        setMessages(prev => prev.some(item => item.id === detail.message.id) ? prev : [...prev, detail.message]);
        if (detail.message.from_user_id !== me?.id) loadThread();
      }
      if (detail.action === 'update' && detail.message) {
        setMessages(prev => prev.map(item => item.id === detail.message.id ? detail.message : item));
      }
      if (detail.action === 'members') loadThread();
      loadThreads();
    };
    window.addEventListener('hb-chat', onChat);
    return () => window.removeEventListener('hb-chat', onChat);
  }, [activeId, me?.id, userId, conversationId]);

  useEffect(() => {
    if (!userId && !conversationId) return;
    const timer = setInterval(loadThread, 4000);
    return () => clearInterval(timer);
  }, [userId, conversationId]);

  const names = conversation?.members.map(m => m.name) || [];
  const typingLabel = useMemo(() => {
    const rows = Object.values(typing);
    if (!rows.length) return '';
    if (rows.length === 1) return `${rows[0].name} is typing…`;
    return `${rows.map(row => row.name).join(', ')} are typing…`;
  }, [typing]);

  const mentionQuery = mention.toLowerCase();
  const suggestions = people.filter(person => person.id !== me?.id && person.name.toLowerCase().includes(mentionQuery)).slice(0, 6);

  const onType = (value: string) => {
    setText(value);
    const caret = inputRef.current?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const match = upto.match(/(^|\s)@([^\n@]*)$/);
    setMention(match ? match[2] : '');
    if (activeId && value.trim() && Date.now() - typedAt.current > 1500) {
      typedAt.current = Date.now();
      api.post(`/chat/conversations/${activeId}/typing`, {}).catch(() => {});
    }
  };

  const insertEmoji = (emoji: string) => {
    setText(value => value + emoji);
    setEmojiOpen(false);
    inputRef.current?.focus();
  };

  const addPerson = async (person: Member) => {
    if (!conversation) return;
    const already = conversation.members.some(member => member.id === person.id);
    setMention('');
    setText(value => value.replace(/@([^\n@]*)$/, `@${person.name} `));
    if (already) return;
    try {
      const saved = await api.post<{ conversation: Conversation }>(`/chat/conversations/${conversation.id}/members`, { user_id: person.id });
      setConversation(saved.conversation);
      if (!conversationId) navigate(`/chat/c/${saved.conversation.id}`);
      loadThread();
    } catch (err: any) { setError(err.message); }
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeId) return;
    const body = text.trim();
    if (!body && !photos.length && !editing) return;
    setSending(true); setError('');
    try {
      if (editing) {
        const message = await api.put<ChatMessage>(`/chat/messages/${editing.id}`, { body });
        setMessages(prev => prev.map(item => item.id === message.id ? message : item));
        setEditing(null);
        setText('');
      } else if (photos.length) {
        const form = new FormData();
        form.append('body', body);
        photos.forEach(photo => form.append('photos', photo));
        const message = await api.postForm<ChatMessage>(`/chat/conversations/${activeId}/messages`, form);
        setMessages(prev => prev.some(item => item.id === message.id) ? prev : [...prev, message]);
        setText('');
        setPhotos([]);
      } else {
        const message = await api.post<ChatMessage>(`/chat/conversations/${activeId}/messages`, { body });
        setMessages(prev => prev.some(item => item.id === message.id) ? prev : [...prev, message]);
        setText('');
      }
      setMention('');
      loadThreads();
    } catch (err: any) { setError(err.message); } finally { setSending(false); }
  };

  const removeMessage = async (message: ChatMessage) => {
    try {
      const saved = await api.del<ChatMessage>(`/chat/messages/${message.id}`);
      setMessages(prev => prev.map(item => item.id === saved.id ? saved : item));
    } catch (err: any) { setError(err.message); }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await api.post<{ conversation: Conversation }>('/chat/groups', { title: groupTitle.trim(), member_ids: groupIds });
      setGroupOpen(false);
      setGroupTitle('');
      setGroupIds([]);
      navigate(`/chat/c/${saved.conversation.id}`);
    } catch (err: any) { setError(err.message); }
  };

  const call = () => {
    if (!conversation) return;
    if (conversation.is_group) startGroupCall(conversation.id, conversation.title);
    else {
      const other = conversation.members.find(member => member.id !== me?.id);
      if (other) startOutgoing(other);
    }
  };

  if (!userId && !conversationId) {
    return (
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">💬 Team chat</h1>
            <p className="text-xs text-gray-500">Direct chats and groups. @ someone to bring them in.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setGroupOpen(true)}>New group</button>
        </div>
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
        <div className="space-y-2">
          {threads.map(thread => (
            <button key={thread.id} type="button" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 flex items-center gap-3 text-left" onClick={() => navigate(thread.path)}>
              <div className="relative w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                {thread.is_group ? '👥' : thread.title[0]}
                {thread.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{thread.title}</p>
                <p className="text-xs text-gray-500 truncate">{thread.last?.body || (thread.is_group ? `${thread.members.length} people` : 'No messages yet')}</p>
              </div>
              {thread.unread > 0 && <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">{thread.unread}</span>}
            </button>
          ))}
        </div>
        <Modal open={groupOpen} onClose={() => setGroupOpen(false)} title="New group">
          <form onSubmit={createGroup} className="space-y-3">
            <input className="input" placeholder="Group name, optional" value={groupTitle} onChange={e => setGroupTitle(e.target.value)} />
            <p className="text-xs text-gray-500">Pick at least two people.</p>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {people.map(person => (
                <label key={person.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                  <input type="checkbox" checked={groupIds.includes(person.id)} onChange={() => setGroupIds(ids => ids.includes(person.id) ? ids.filter(id => id !== person.id) : [...ids, person.id])} />
                  <span className="text-sm">{person.name}</span>
                  <span className="text-xs text-gray-400">{roleLabel(person.role)}</span>
                </label>
              ))}
            </div>
            <button className="btn-primary" disabled={groupIds.length < 2}>Create group</button>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto h-full flex flex-col">
      <div className="flex items-center gap-2 pb-3">
        <Link to="/chat" className="text-blue-600 text-sm">←</Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{conversation?.title || 'Chat'}</p>
          <p className="text-xs text-gray-500 truncate">{conversation?.is_group ? conversation.members.map(m => m.name).join(', ') : (conversation?.members.find(m => m.id !== me?.id) ? roleLabel(conversation.members.find(m => m.id !== me?.id)?.role) : '')}</p>
        </div>
        <button type="button" className="w-10 h-10 rounded-full bg-green-600 text-white" onClick={call} title={conversation?.is_group ? 'Group call' : 'Call'}>☎</button>
      </div>
      {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-2 text-sm">{error}</div>}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.map(message => {
          if (message.kind === 'system') {
            return <p key={message.id} className="text-center text-xs text-gray-400 py-1">{message.body}</p>;
          }
          const mine = message.from_user_id === me?.id;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                {conversation?.is_group && !mine && <p className="text-[11px] font-semibold mb-0.5 opacity-80">{message.from_name}</p>}
                {message.deleted_at ? (
                  <p className="italic opacity-70">This message was deleted</p>
                ) : (
                  <>
                    {!!message.attachments?.length && (
                      <div className="grid grid-cols-2 gap-1 mb-1">
                        {message.attachments.map(src => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="rounded-lg max-h-40 w-full object-cover" /></a>)}
                      </div>
                    )}
                    {message.body && <p className="whitespace-pre-wrap break-words">{highlight(message.body, names)}</p>}
                  </>
                )}
                <p className={`text-[10px] mt-1 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                  {timeLabel(message.created_at)}{message.edited_at && !message.deleted_at ? ' · edited' : ''}
                </p>
                {mine && !message.deleted_at && (
                  <div className="flex gap-2 mt-1 text-[11px]">
                    <button type="button" className={mine ? 'text-blue-100 underline' : 'text-blue-600 underline'} onClick={() => { setEditing(message); setText(message.body); }}>Edit</button>
                    <button type="button" className={mine ? 'text-blue-100 underline' : 'text-red-500 underline'} onClick={() => removeMessage(message)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {typingLabel && <p className="text-xs text-gray-500 py-1">{typingLabel}</p>}
      {mention !== '' && suggestions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl mb-2 overflow-hidden">
          {suggestions.map(person => {
            const inside = conversation?.members.some(member => member.id === person.id);
            return (
              <button key={person.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between" onClick={() => addPerson(person)}>
                <span>@{person.name}</span>
                <span className="text-xs text-gray-400">{inside ? 'Mention' : 'Add to chat'}</span>
              </button>
            );
          })}
        </div>
      )}
      {!!photos.length && (
        <div className="flex gap-2 py-2 overflow-x-auto">
          {photos.map((photo, index) => (
            <div key={`${photo.name}-${index}`} className="relative">
              <img src={URL.createObjectURL(photo)} alt="" className="h-16 w-16 object-cover rounded-lg" />
              <button type="button" className="absolute -top-1 -right-1 bg-black text-white rounded-full w-5 h-5 text-xs" onClick={() => setPhotos(list => list.filter((_, i) => i !== index))}>×</button>
            </div>
          ))}
        </div>
      )}
      {editing && <p className="text-xs text-blue-700">Editing your message. <button type="button" className="underline" onClick={() => { setEditing(null); setText(''); }}>Cancel</button></p>}
      <form onSubmit={send} className="flex items-end gap-2 pt-2">
        <label className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer" title="Add photos">
          📷
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden" onChange={e => { setPhotos(list => [...list, ...Array.from(e.target.files || [])].slice(0, 8)); e.target.value = ''; }} />
        </label>
        <button type="button" className="w-10 h-10 rounded-full bg-gray-100" onClick={() => setEmojiOpen(open => !open)}>😊</button>
        <textarea ref={inputRef} rows={1} className="input flex-1 resize-none" placeholder="Message. Type @ to add someone" value={text} onChange={e => onType(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn-primary" disabled={sending || (!text.trim() && !photos.length)}>{editing ? 'Save' : 'Send'}</button>
      </form>
      {emojiOpen && (
        <div className="grid grid-cols-8 gap-1 bg-white border border-gray-200 rounded-xl p-2 mt-2">
          {EMOJI.map(emoji => <button key={emoji} type="button" className="text-xl" onClick={() => insertEmoji(emoji)}>{emoji}</button>)}
        </div>
      )}
    </div>
  );
}
