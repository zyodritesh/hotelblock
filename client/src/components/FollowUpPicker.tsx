import { useEffect, useRef, useState } from 'react';
import { todayISO, addDaysISO, formatDate } from '../lib/utils';

const PRESETS = [
  { id: '1', label: 'Daily', days: 1 },
  { id: '7', label: 'Weekly', days: 7 },
  { id: '15', label: '15 days', days: 15 },
  { id: '30', label: '30 days', days: 30 },
];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function FollowUpPicker({
  value,
  onChange,
  label = 'Follow-up',
}: {
  value: string;
  onChange: (date: string) => void;
  label?: string;
}) {
  const day = (value || '').slice(0, 10);
  const today = todayISO();
  const past = Boolean(day) && day < today;
  const shown = past ? '' : day;
  const matched = PRESETS.find(p => shown && addDaysISO(today, p.days) === shown)?.id;
  const thisMonth = monthKey(today);

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(shown ? monthKey(shown) : thisMonth);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const pick = (next: string) => {
    if (!next || next < today) return;
    onChange(next);
    setOpen(false);
  };

  const openCalendar = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 272;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = rect.bottom + 6;
    if (top + 300 > window.innerHeight) top = Math.max(8, rect.top - 300);
    setCursor(shown ? monthKey(shown) : thisMonth);
    setBox({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const [year, month] = cursor.split('-').map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {PRESETS.map(p => (
          <button
            type="button"
            key={p.id}
            onClick={() => pick(addDaysISO(today, p.days))}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${matched === p.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        className="input text-left flex items-center justify-between"
      >
        <span className={shown ? 'text-gray-900' : 'text-gray-400'}>{shown ? formatDate(shown) : 'Choose a date'}</span>
        <span className="text-gray-400">📅</span>
      </button>
      <p className={`text-xs mt-1 ${past ? 'text-amber-700' : 'text-gray-400'}`}>
        {past
          ? `The saved date ${formatDate(day)} is before today. Choose today or a later date.`
          : 'Today or later. Earlier days are not listed.'}
      </p>

      {open && box && (
        <div
          ref={popRef}
          className="fixed z-[80] w-[272px] bg-white border border-gray-200 rounded-xl shadow-xl p-3"
          style={{ top: box.top, left: box.left }}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              disabled={cursor <= thisMonth}
              onClick={() => setCursor(c => shiftMonth(c, -1))}
              className="w-7 h-7 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-900">{monthLabel(cursor)}</span>
            <button type="button" onClick={() => setCursor(c => shiftMonth(c, 1))} className="w-7 h-7 rounded-lg text-gray-600 hover:bg-gray-100">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-1">
            {WEEKDAYS.map((w, i) => <span key={`${w}-${i}`}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((n, i) => {
              if (!n) return <span key={`e-${i}`} />;
              const iso = `${cursor}-${String(n).padStart(2, '0')}`;
              if (iso < today) return <span key={iso} />;
              const selected = iso === shown;
              const isToday = iso === today;
              return (
                <button
                  type="button"
                  key={iso}
                  onClick={() => pick(iso)}
                  className={`h-8 rounded-lg text-sm ${selected ? 'bg-blue-600 text-white font-semibold' : isToday ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800 hover:bg-gray-100'}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => pick(today)} className="mt-2 w-full text-xs font-semibold text-blue-700 py-1.5 rounded-lg hover:bg-blue-50">Today</button>
        </div>
      )}
    </div>
  );
}
