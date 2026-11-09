import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

interface Notice {
  id: string;
  type: string;
  title: string;
  body: string;
  lead_id: string | null;
  read_at: string | null;
  created_at: string;
}

function ago(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);

  const load = () => {
    api.get<{ data: Notice[]; unread: number }>('/notifications')
      .then(r => { setItems(r.data || []); setUnread(r.unread || 0); })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openNotice = async (n: Notice) => {
    if (!n.read_at) {
      await api.post(`/notifications/${n.id}/read`, {}).catch(() => {});
      setItems(prev => prev.map(item => item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item));
      setUnread(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.lead_id) navigate('/pipeline', { state: { leadId: n.lead_id } });
  };

  const markAll = async () => {
    await api.post('/notifications/read-all', {}).catch(() => {});
    setItems(prev => prev.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-lg"
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg z-[70] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={markAll}>Mark all read</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-sm text-gray-400 text-center">No notifications yet.</p>}
            {items.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => openNotice(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${n.read_at ? '' : 'bg-blue-50/60'}`}
              >
                <p className="text-sm font-medium text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{n.body}</p>
                <p className="text-[11px] text-gray-400 mt-1">{ago(n.created_at)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
