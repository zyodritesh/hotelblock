import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { roleLabel } from '../lib/utils';

interface DeviceRow {
  id: string;
  label: string;
  app_version: string;
  last_seen: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
}

interface SentMessage {
  id: string;
  title: string;
  body: string;
  created_at: string;
  sender_name: string | null;
  recipient_count: number;
  delivered_count: number;
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 2) return 'Open now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function AppInstalls() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [history, setHistory] = useState<SentMessage[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([
    api.get<DeviceRow[]>('/devices'),
    api.get<SentMessage[]>('/devices/messages'),
  ]).then(([phones, sent]) => {
    setDevices(phones);
    setHistory(sent);
  }).catch((err: Error) => setError(err.message));

  useEffect(() => { load(); }, []);

  const needle = query.trim().toLowerCase();
  const visible = devices.filter(device => !needle || `${device.name} ${device.email} ${device.label} ${roleLabel(device.role)}`.toLowerCase().includes(needle));

  const toggle = (id: string) => {
    setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.post<{ recipient_count: number }>('/devices/notify', {
        title, body, device_ids: everyone ? [] : picked,
      });
      setNotice(`Sent to ${result.recipient_count} phone${result.recipient_count === 1 ? '' : 's'}. It shows even if HotelBlock is not on the screen.`);
      setTitle('');
      setBody('');
      setPicked([]);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Installed apps</h1>
          <p className="text-sm text-stone-500 mt-1">Phones that have HotelBlock installed and are signed in. Write your own title and message, then send it to all of them or to the ones you pick.</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      <form onSubmit={send} className="card space-y-3">
        <label className="block text-sm font-medium text-stone-700">Title
          <input className="input mt-1" required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="Today’s rate" />
        </label>
        <label className="block text-sm font-medium text-stone-700">Message
          <textarea className="input mt-1" required rows={4} maxLength={500} value={body} onChange={e => setBody(e.target.value)} placeholder="Goa rooms are open this weekend. Call the hotel desk before 6 pm." />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={everyone} onChange={e => setEveryone(e.target.checked)} />
          Every signed-in phone ({devices.length})
        </label>
        <button className="btn-primary" disabled={busy || devices.length === 0 || (!everyone && picked.length === 0)}>{busy ? 'Sending…' : 'Send notification'}</button>
      </form>

      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold text-stone-900">Installed ({devices.length})</p>
        </div>
        <input className="input mb-3" placeholder="Search name, role, or phone" value={query} onChange={e => setQuery(e.target.value)} />
        {visible.length === 0 && <p className="text-sm text-stone-500">{devices.length === 0 ? 'The list fills in when someone installs HotelBlock 1.0.7, signs in, and allows notifications.' : 'No phone matches this search.'}</p>}
        <div className="space-y-2">
          {visible.map(device => (
            <label key={device.id} className="flex items-center gap-3 border-b border-stone-100 pb-2 last:border-0 last:pb-0">
              {!everyone && <input type="checkbox" checked={picked.includes(device.id)} onChange={() => toggle(device.id)} />}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-stone-900 truncate">{device.name}</p>
                <p className="text-xs text-stone-500 truncate">{roleLabel(device.role)} · {device.label}{device.app_version ? ` · v${device.app_version}` : ''}</p>
              </div>
              <p className="text-xs text-stone-400 shrink-0">{when(device.last_seen)}</p>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-semibold text-stone-900 mb-3">Sent</p>
        {history.length === 0 && <p className="text-sm text-stone-500">Nothing sent yet.</p>}
        <div className="space-y-3">
          {history.map(row => (
            <div key={row.id} className="border-b border-stone-100 pb-3 last:border-0 last:pb-0">
              <div className="flex justify-between gap-3">
                <p className="font-medium text-stone-900">{row.title}</p>
                <p className="text-xs text-stone-400 shrink-0">{when(row.created_at)}</p>
              </div>
              <p className="text-sm text-stone-600 mt-1 whitespace-pre-wrap">{row.body}</p>
              <p className="text-xs text-stone-400 mt-1">{row.sender_name || 'Staff'} · {row.delivered_count} of {row.recipient_count} phones received it</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
