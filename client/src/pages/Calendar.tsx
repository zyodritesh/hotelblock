import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { SEGMENTS, SEGMENT_COLORS, STAGE_COLORS, formatCurrency, todayISO } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Hotel { id: string; name: string; city?: string; }
interface Booking {
  id: string;
  title: string;
  segment: string;
  stage: string;
  event_date: string;
  room_nights: number;
  pax: number;
  estimated_revenue: number;
  property_id?: string | null;
  property_name?: string | null;
  user_name?: string;
}

const CHIP: Record<string, string> = {
  Rooms: 'bg-blue-600 text-white',
  Corporate: 'bg-purple-600 text-white',
  Events: 'bg-emerald-600 text-white',
  Banquets: 'bg-orange-600 text-white',
};
const DOT: Record<string, string> = {
  Rooms: 'bg-blue-500',
  Corporate: 'bg-purple-500',
  Events: 'bg-emerald-500',
  Banquets: 'bg-orange-500',
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildGrid(month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const pad = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(pad).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function dayHeading(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Calendar() {
  const navigate = useNavigate();
  const { user, activePropertyId } = useAuthStore();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [items, setItems] = useState<Booking[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [segment, setSegment] = useState('');
  const [includeLost, setIncludeLost] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<string>('Banquets');
  const [hotel, setHotel] = useState('');
  const [pax, setPax] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    const q = new URLSearchParams({ month });
    if (hotelId) q.set('property_id', hotelId);
    if (segment) q.set('segment', segment);
    if (includeLost) q.set('include_lost', '1');
    return api.get<{ items: Booking[] }>(`/leads/calendar?${q}`).then(r => setItems(r.items || [])).catch(() => setItems([]));
  };

  useEffect(() => { load(); }, [month, hotelId, segment, includeLost]);
  useEffect(() => { api.get<Hotel[]>('/properties').then(setHotels).catch(() => {}); }, []);

  const byDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const item of items) {
      const key = String(item.event_date).slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  const cells = useMemo(() => buildGrid(month), [month]);
  const today = todayISO();
  const counts = SEGMENTS.map(name => ({ name, n: items.filter(i => i.segment === name).length }));

  const openDay = (iso: string) => {
    setError('');
    setDay(iso);
    setTitle('');
    setKind(segment || 'Banquets');
    setHotel(hotelId || activePropertyId || hotels[0]?.id || '');
    setPax('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!day) return;
    if (!user?.id) { setError('Sign in again'); return; }
    if (!hotel) { setError('Choose a hotel'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/leads', {
        title: title.trim(),
        segment: kind,
        stage: 'Prospect',
        event_date: day,
        property_id: hotel,
        pax: Number(pax) || 0,
        owner_ids: [user.id],
      });
      setNotice(`${title.trim()} is on ${dayHeading(day)}.`);
      setTitle('');
      setPax('');
      await load();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const dayItems = day ? (byDay[day] || []) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">📅 Booking calendar</h1>
          <p className="text-xs text-gray-500 mt-0.5">Rooms, corporate, events, and banquets. Click a day to add a lead.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary px-3" onClick={() => setMonth(m => shiftMonth(m, -1))}>←</button>
          <button type="button" className="btn-secondary px-3 text-sm" onClick={() => setMonth(today.slice(0, 7))}>{monthLabel(month)}</button>
          <button type="button" className="btn-secondary px-3" onClick={() => setMonth(m => shiftMonth(m, 1))}>→</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <select className="select flex-shrink-0 text-xs w-44 py-1.5" value={hotelId} onChange={e => setHotelId(e.target.value)}>
          <option value="">All hotels</option>
          {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <button type="button" className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${segment === '' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`} onClick={() => setSegment('')}>All {items.length}</button>
        {counts.map(c => (
          <button key={c.name} type="button" className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${segment === c.name ? CHIP[c.name] : SEGMENT_COLORS[c.name]}`} onClick={() => setSegment(s => s === c.name ? '' : c.name)}>
            {c.name} {c.n}
          </button>
        ))}
        <label className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-500 px-1">
          <input type="checkbox" checked={includeLost} onChange={e => setIncludeLost(e.target.checked)} />
          Lost
        </label>
      </div>

      {notice && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 text-sm">{notice}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map(d => <div key={d} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((iso, i) => {
            const list = iso ? (byDay[iso] || []) : [];
            return (
              <button
                key={iso || `e${i}`}
                type="button"
                disabled={!iso}
                onClick={() => iso && openDay(iso)}
                className={`min-h-[4.5rem] sm:min-h-[6.5rem] border-b border-r border-gray-100 p-1 text-left align-top ${iso ? 'hover:bg-blue-50/60' : 'bg-gray-50'} ${iso === today ? 'ring-2 ring-inset ring-blue-500' : ''}`}
              >
                {iso && (
                  <>
                    <div className={`text-[11px] font-medium ${iso === today ? 'text-blue-700' : 'text-gray-500'}`}>{Number(iso.slice(8))}</div>
                    <div className="hidden sm:block space-y-0.5 mt-0.5">
                      {list.slice(0, 3).map(item => (
                        <div key={item.id} className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${CHIP[item.segment] || 'bg-gray-500 text-white'} ${item.stage === 'Closed Won' ? '' : 'opacity-90'}`}>
                          {item.stage === 'Closed Won' ? '✓ ' : ''}{item.title}
                        </div>
                      ))}
                      {list.length > 3 && <div className="text-[10px] text-gray-500 px-1">+{list.length - 3} more</div>}
                    </div>
                    <div className="sm:hidden flex flex-wrap gap-0.5 mt-1">
                      {list.slice(0, 4).map(item => <span key={item.id} className={`w-1.5 h-1.5 rounded-full ${DOT[item.segment] || 'bg-gray-400'}`} />)}
                      {list.length > 4 && <span className="text-[9px] text-gray-400">+{list.length - 4}</span>}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Modal open={!!day} onClose={() => setDay(null)} title={day ? dayHeading(day) : 'Day'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-3 text-sm">{error}</div>}
        <form onSubmit={save} className="space-y-3 mb-4 pb-4 border-b border-gray-100">
          <p className="text-xs text-gray-500">Type the booking and pick what it is. It is saved as a lead on this day.</p>
          <input className="input" required autoFocus placeholder="e.g. Sharma wedding, TCS room block" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map(name => (
              <button key={name} type="button" className={`px-3 py-1.5 rounded-full text-xs font-medium ${kind === name ? CHIP[name] : 'bg-gray-100 text-gray-600'}`} onClick={() => setKind(name)}>{name}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select className="select" required value={hotel} onChange={e => setHotel(e.target.value)}>
              <option value="">Hotel</option>
              {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <input className="input" type="number" min="0" placeholder="Pax / rooms" value={pax} onChange={e => setPax(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add lead on this day'}</button>
        </form>
        <div className="space-y-2">
          {dayItems.length === 0 && <p className="text-sm text-gray-400">Nothing else on this day.</p>}
          {dayItems.map(item => (
            <button key={item.id} type="button" className="w-full text-left rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50" onClick={() => navigate('/pipeline', { state: { leadId: item.id } })}>
              <div className="flex items-center gap-2">
                <span className={`badge text-xs ${SEGMENT_COLORS[item.segment]}`}>{item.segment}</span>
                <span className={`badge text-xs ${STAGE_COLORS[item.stage]}`}>{item.stage}</span>
                <span className="text-sm font-medium text-gray-900 flex-1 truncate">{item.title}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {[item.property_name, item.pax ? `${item.pax} pax` : '', item.room_nights ? `${item.room_nights} room nights` : '', formatCurrency(item.estimated_revenue)].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
