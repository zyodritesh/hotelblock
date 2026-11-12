import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { SEGMENTS, SEGMENT_COLORS, STAGE_COLORS, addDaysISO, formatCurrency, formatStay, todayISO } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Hotel { id: string; name: string; city?: string; }
interface Person { id: string; name: string; }
interface Booking {
  id: string;
  title: string;
  segment: string;
  stage: string;
  event_date: string;
  event_end_date?: string | null;
  room_nights: number;
  pax: number;
  estimated_revenue: number;
  property_id?: string | null;
  property_name?: string | null;
  property_city?: string | null;
  account_name?: string | null;
  contact_name?: string | null;
  notes?: string | null;
  user_name?: string;
  created_by_name?: string | null;
  owners?: Person[];
}

const BAR: Record<string, string> = {
  Rooms: 'bg-blue-600',
  Corporate: 'bg-purple-600',
  Events: 'bg-emerald-600',
  Banquets: 'bg-orange-600',
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

function monthEnd(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
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

function stayEnd(item: { event_date: string; event_end_date?: string | null }) {
  const start = String(item.event_date).slice(0, 10);
  const end = String(item.event_end_date || '').slice(0, 10);
  return end && end >= start ? end : start;
}

function weekdayMon(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function ordered(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

export default function Calendar() {
  const { user, activePropertyId } = useAuthStore();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [items, setItems] = useState<Booking[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [segment, setSegment] = useState('');
  const [includeLost, setIncludeLost] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [highlight, setHighlight] = useState<{ from: string; to: string } | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<string>('Banquets');
  const [hotel, setHotel] = useState('');
  const [pax, setPax] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<Booking | null>(null);
  const drag = useRef<{ start: string; current: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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
    const start = `${month}-01`;
    const end = monthEnd(month);
    for (const item of items) {
      let cursor = String(item.event_date).slice(0, 10);
      const last = stayEnd(item);
      if (cursor < start) cursor = start;
      const stop = last > end ? end : last;
      while (cursor <= stop) {
        if (!map[cursor]) map[cursor] = [];
        map[cursor].push(item);
        cursor = addDaysISO(cursor, 1);
      }
    }
    return map;
  }, [items, month]);

  const cells = useMemo(() => buildGrid(month), [month]);
  const today = todayISO();
  const counts = SEGMENTS.map(name => ({ name, n: items.filter(i => i.segment === name).length }));

  const openRange = (from: string, to: string) => {
    const [start, end] = ordered(from, to);
    setError('');
    setRange({ from: start, to: end });
    setFromDate(start);
    setToDate(end);
    setHighlight({ from: start, to: end });
    setTitle('');
    setKind(segment || 'Banquets');
    setHotel(hotelId || activePropertyId || hotels[0]?.id || '');
    setPax('');
  };

  const dateAt = (x: number, y: number) => {
    const node = document.elementFromPoint(x, y)?.closest('[data-date]') as HTMLElement | null;
    return node?.dataset.date || null;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('[data-booking]')) return;
    const iso = dateAt(event.clientX, event.clientY);
    if (!iso) return;
    gridRef.current?.setPointerCapture(event.pointerId);
    drag.current = { start: iso, current: iso };
    setHighlight({ from: iso, to: iso });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const iso = dateAt(event.clientX, event.clientY);
    if (!iso || iso === drag.current.current) return;
    drag.current.current = iso;
    const [from, to] = ordered(drag.current.start, iso);
    setHighlight({ from, to });
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    openRange(current.start, current.current);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) { setError('Sign in again'); return; }
    if (!hotel) { setError('Choose a hotel'); return; }
    if (!fromDate || !toDate) { setError('Choose the dates'); return; }
    if (toDate < fromDate) { setError('End date must be on or after the start date'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/leads', {
        title: title.trim(),
        segment: kind,
        stage: 'Prospect',
        event_date: fromDate,
        event_end_date: toDate,
        property_id: hotel,
        pax: Number(pax) || 0,
        owner_ids: [user.id],
      });
      setNotice(`${title.trim()} is on ${formatStay(fromDate, toDate)}.`);
      setTitle('');
      setPax('');
      await load();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const openView = (id: string) => {
    const known = items.find(item => item.id === id) || null;
    setView(known);
    api.get<Booking>(`/leads/${id}`).then(setView).catch(() => {});
  };

  const rangeItems = range
    ? items.filter(item => String(item.event_date).slice(0, 10) <= range.to && stayEnd(item) >= range.from)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">📅 Booking calendar</h1>
          <p className="text-xs text-gray-500 mt-0.5">Drag across days to add a stay. Click a booking to view the lead.</p>
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
          <button key={c.name} type="button" className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${segment === c.name ? `${BAR[c.name]} text-white` : SEGMENT_COLORS[c.name]}`} onClick={() => setSegment(s => s === c.name ? '' : c.name)}>
            {c.name} {c.n}
          </button>
        ))}
        <label className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-500 px-1">
          <input type="checkbox" checked={includeLost} onChange={e => setIncludeLost(e.target.checked)} />
          Lost
        </label>
      </div>

      {notice && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 text-sm">{notice}</div>}

      <div
        ref={gridRef}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden select-none touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
      >
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map(d => <div key={d} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((iso, i) => {
            const list = iso ? (byDay[iso] || []) : [];
            const picked = !!(iso && highlight && iso >= highlight.from && iso <= highlight.to);
            return (
              <div
                key={iso || `e${i}`}
                data-date={iso || undefined}
                className={`min-h-[4.5rem] sm:min-h-[6.5rem] border-b border-r border-gray-100 p-1 text-left align-top ${iso ? 'cursor-cell' : 'bg-gray-50'} ${picked ? 'bg-blue-100' : ''} ${iso === today ? 'ring-2 ring-inset ring-blue-500' : ''}`}
              >
                {iso && (
                  <>
                    <div className={`text-[11px] font-medium ${iso === today ? 'text-blue-700' : 'text-gray-500'}`}>{Number(iso.slice(8))}</div>
                    <div className="space-y-0.5 mt-0.5">
                      {list.slice(0, 3).map(item => {
                        const start = String(item.event_date).slice(0, 10);
                        const end = stayEnd(item);
                        const mon = weekdayMon(iso);
                        const roundL = iso === start || mon === 0;
                        const roundR = iso === end || mon === 6;
                        const showName = iso === start || mon === 0;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-booking
                            onPointerDown={e => e.stopPropagation()}
                            onClick={() => openView(item.id)}
                            className={`block w-full truncate px-1 py-0.5 text-left text-[10px] leading-tight text-white ${BAR[item.segment] || 'bg-gray-500'} ${roundL ? 'rounded-l' : ''} ${roundR ? 'rounded-r' : ''}`}
                          >
                            {showName ? `${item.stage === 'Closed Won' ? '✓ ' : ''}${item.title}` : '·'}
                          </button>
                        );
                      })}
                      {list.length > 3 && (
                        <button type="button" data-booking className="text-[10px] text-gray-500 px-1" onPointerDown={e => e.stopPropagation()} onClick={() => openRange(iso, iso)}>
                          +{list.length - 3} more
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={!!range && !view} onClose={() => { setRange(null); setHighlight(null); }} title={range ? (range.from === range.to ? dayHeading(range.from) : formatStay(range.from, range.to)) : 'Dates'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-3 text-sm">{error}</div>}
        <form onSubmit={save} className="space-y-3 mb-4 pb-4 border-b border-gray-100">
          <p className="text-xs text-gray-500">The days you dragged are filled in. Change them if the stay should start or end on another date.</p>
          <input className="input" required autoFocus placeholder="e.g. Sharma wedding, TCS room block" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map(name => (
              <button key={name} type="button" className={`px-3 py-1.5 rounded-full text-xs font-medium ${kind === name ? `${BAR[name]} text-white` : 'bg-gray-100 text-gray-600'}`} onClick={() => setKind(name)}>{name}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">From</label><input type="date" className="input" required value={fromDate} onChange={e => { setFromDate(e.target.value); if (toDate && e.target.value && toDate >= e.target.value) setHighlight({ from: e.target.value, to: toDate }); }} /></div>
            <div><label className="label">To</label><input type="date" className="input" required value={toDate} onChange={e => { setToDate(e.target.value); if (fromDate && e.target.value && e.target.value >= fromDate) setHighlight({ from: fromDate, to: e.target.value }); }} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select className="select" required value={hotel} onChange={e => setHotel(e.target.value)}>
              <option value="">Hotel</option>
              {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <input className="input" type="number" min="0" placeholder="Pax / rooms" value={pax} onChange={e => setPax(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add lead for these dates'}</button>
        </form>
        <div className="space-y-2">
          {rangeItems.length === 0 && <p className="text-sm text-gray-400">Nothing else on these dates.</p>}
          {rangeItems.map(item => (
            <button key={item.id} type="button" className="w-full text-left rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50" onClick={() => openView(item.id)}>
              <div className="flex items-center gap-2">
                <span className={`badge text-xs ${SEGMENT_COLORS[item.segment]}`}>{item.segment}</span>
                <span className={`badge text-xs ${STAGE_COLORS[item.stage]}`}>{item.stage}</span>
                <span className="text-sm font-medium text-gray-900 flex-1 truncate">{item.title}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {[formatStay(item.event_date, item.event_end_date), item.property_name, item.pax ? `${item.pax} pax` : '', formatCurrency(item.estimated_revenue)].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title="Lead" size="lg">
        {view && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{view.title}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`badge text-xs ${SEGMENT_COLORS[view.segment]}`}>{view.segment}</span>
                <span className={`badge text-xs ${STAGE_COLORS[view.stage]}`}>{view.stage}</span>
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><dt className="text-gray-500">Hotel</dt><dd className="font-medium">{[view.property_name, view.property_city].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt className="text-gray-500">Dates</dt><dd className="font-medium">{formatStay(view.event_date, view.event_end_date)}</dd></div>
              <div><dt className="text-gray-500">Revenue</dt><dd className="font-medium">{formatCurrency(view.estimated_revenue || 0)}</dd></div>
              <div><dt className="text-gray-500">Pax / room nights</dt><dd className="font-medium">{view.pax || 0} pax · {view.room_nights || 0} room nights</dd></div>
              <div><dt className="text-gray-500">Account</dt><dd className="font-medium">{view.account_name || '—'}</dd></div>
              <div><dt className="text-gray-500">Contact</dt><dd className="font-medium">{view.contact_name || '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-gray-500">Owners</dt><dd className="font-medium">{view.owners?.length ? view.owners.map(o => o.name).join(', ') : (view.user_name || '—')}</dd></div>
            </dl>
            {view.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">{view.notes}</p>}
            {view.created_by_name && <p className="text-xs text-gray-400">Added by {view.created_by_name}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
