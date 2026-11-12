import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { roleLabel } from '../lib/utils';
import { startOutgoing } from '../live/session';
import { getSnapshot, subscribe } from '../live/store';
import { enablePush } from '../live/LiveProvider';
import { dialNumber, openWhatsApp } from '../lib/phone';

interface Person { id: string; name: string; role: string; online?: boolean; }
interface Contact { id?: string; name: string; phone: string; company?: string; }
interface Book {
  team: Person[];
  contacts: Contact[];
  recent: Contact[];
}
interface CallLog {
  id: string;
  direction: 'in' | 'out';
  peer_name: string;
  status: string;
  duration_sec: number;
  created_at: string;
}

function callWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function callLength(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${mins}:${String(rest).padStart(2, '0')}`;
}

const CALL_STATUS: Record<string, string> = {
  ended: 'Connected',
  missed: 'Missed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  ringing: 'Ringing',
  accepted: 'On a call',
};

function Action({ label, tone, onClick }: { label: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 h-10 px-3 rounded-full text-white text-xs font-semibold ${tone}`}>
      {label}
    </button>
  );
}

export default function Phone() {
  const navigate = useNavigate();
  const [book, setBook] = useState<Book>({ team: [], contacts: [], recent: [] });
  const [log, setLog] = useState<CallLog[]>([]);
  const [logQ, setLogQ] = useState('');
  const [logDirection, setLogDirection] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [teamQ, setTeamQ] = useState('');
  const [q, setQ] = useState('');
  const queryRef = useRef('');
  const phase = useSyncExternalStore(subscribe, () => getSnapshot().phase, () => getSnapshot().phase);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [install, setInstall] = useState<any>(null);

  const load = (query = queryRef.current) => {
    queryRef.current = query;
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    api.get<Book>(`/phone${params}`).then(setBook).catch(() => {});
  };

  useEffect(() => {
    load('');
    const timer = setInterval(() => load(queryRef.current), 8000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (logQ.trim()) params.set('q', logQ.trim());
    if (logDirection) params.set('direction', logDirection);
    if (logStatus) params.set('status', logStatus);
    const qs = params.toString();
    api.get<CallLog[]>(`/team-calls/log${qs ? `?${qs}` : ''}`).then(setLog).catch(() => {});
  }, [logQ, logDirection, logStatus, phase]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const allow = async () => {
    setError('');
    try {
      await enablePush();
      setNotice('Notifications are on. You will hear when a lead, chat, or call arrives.');
    } catch (err: any) { setError(err.message); }
  };

  const installApp = async () => {
    if (!install) return;
    install.prompt();
    await install.userChoice;
    setInstall(null);
  };

  const callTeam = async (person: Person) => {
    setError('');
    try { await startOutgoing(person); }
    catch (err: any) { setError(err.message); }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">📲 Phone</h1>
        <p className="text-xs text-gray-500 mt-0.5">Call or WhatsApp a customer. Call or chat a teammate inside the app.</p>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
      {notice && <div className="bg-green-50 text-green-700 rounded-lg px-3 py-2 text-sm">{notice}</div>}

      {!navigator.userAgent.includes('HotelBlockApp') && <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3">
        <p className="text-sm">Add HotelBlock to your home screen, then allow notifications. When Riya adds a lead for you, the phone shows it even if the app is closed.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-sm font-medium" onClick={allow}>Allow notifications</button>
          {install && <button type="button" className="bg-blue-500 rounded-full px-3 py-1.5 text-sm font-medium" onClick={installApp}>Add to home screen</button>}
        </div>
        <p className="text-[11px] text-slate-400">On iPhone: Share, then Add to Home Screen. Notifications work after the icon is on the home screen.</p>
      </div>}

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Call log</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 mb-2">
          <input className="input" placeholder="Search a name" value={logQ} onChange={e => setLogQ(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="select" value={logDirection} onChange={e => setLogDirection(e.target.value)}>
              <option value="">All directions</option>
              <option value="in">Incoming</option>
              <option value="out">Outgoing</option>
            </select>
            <select className="select" value={logStatus} onChange={e => setLogStatus(e.target.value)}>
              <option value="">All results</option>
              <option value="ended">Connected</option>
              <option value="missed">Missed</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          {log.length === 0 && <p className="text-sm text-gray-400">No calls match this search.</p>}
          {log.map(row => (
            <div key={row.id} className="bg-white border border-gray-200 rounded-xl px-3 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{row.direction === 'out' ? 'Outgoing' : 'Incoming'} · {row.peer_name}</p>
                <p className="text-xs text-gray-500 truncate">{callWhen(row.created_at)} · {CALL_STATUS[row.status] || row.status}{row.duration_sec > 0 ? ` · ${callLength(row.duration_sec)}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Team</h2>
        <input className="input mb-2" placeholder="Search a teammate" value={teamQ} onChange={e => setTeamQ(e.target.value)} />
        <div className="space-y-2">
          {book.team.filter(person => !teamQ.trim() || `${person.name} ${roleLabel(person.role)}`.toLowerCase().includes(teamQ.trim().toLowerCase())).length === 0 && (
            <p className="text-sm text-gray-400">No teammate matches this search.</p>
          )}
          {book.team.filter(person => !teamQ.trim() || `${person.name} ${roleLabel(person.role)}`.toLowerCase().includes(teamQ.trim().toLowerCase())).map(person => (
            <div key={person.id} className="bg-white border border-gray-200 rounded-xl px-3 py-3 flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                {person.name[0]}
                {person.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{person.name}</p>
                <p className="text-xs text-gray-500">{roleLabel(person.role)}{person.online ? ' · online' : ''}</p>
              </div>
              <Action label="Call" tone="bg-green-600" onClick={() => callTeam(person)} />
              <Action label="Chat" tone="bg-blue-600" onClick={() => navigate(`/chat/${person.id}`)} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Customers</h2>
        <input
          className="input mb-2"
          placeholder="Search name or phone"
          value={q}
          onChange={e => { setQ(e.target.value); load(e.target.value); }}
        />
        <div className="space-y-2">
          {book.contacts.length === 0 && <p className="text-sm text-gray-400">No saved numbers yet.</p>}
          {book.contacts.map(contact => (
            <div key={contact.id || contact.phone} className="bg-white border border-gray-200 rounded-xl px-3 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{contact.name}</p>
                <p className="text-xs text-gray-500 truncate">{[contact.company, contact.phone].filter(Boolean).join(' · ')}</p>
              </div>
              <Action label="Call" tone="bg-green-600" onClick={() => dialNumber(contact.phone)} />
              <Action label="WhatsApp" tone="bg-emerald-600" onClick={() => openWhatsApp(contact.phone)} />
            </div>
          ))}
        </div>
      </section>

      {book.recent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Recent numbers</h2>
          <div className="space-y-2">
            {book.recent.map(contact => (
              <div key={contact.phone} className="bg-white border border-gray-200 rounded-xl px-3 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{contact.name || contact.phone}</p>
                  <p className="text-xs text-gray-500 truncate">{contact.phone}</p>
                </div>
                <Action label="Call" tone="bg-green-600" onClick={() => dialNumber(contact.phone)} />
                <Action label="WhatsApp" tone="bg-emerald-600" onClick={() => openWhatsApp(contact.phone)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
