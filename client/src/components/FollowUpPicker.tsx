import { todayISO, addDaysISO, formatDate } from '../lib/utils';

const PRESETS = [
  { id: '1', label: 'Daily', days: 1 },
  { id: '7', label: 'Weekly', days: 7 },
  { id: '15', label: '15 days', days: 15 },
  { id: '30', label: '30 days', days: 30 },
];

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

  const pick = (next: string) => {
    if (!next) { onChange(''); return; }
    if (next < today) return;
    onChange(next);
  };

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
      <input
        type="date"
        className="input"
        min={today}
        value={shown}
        onChange={e => pick(e.target.value)}
      />
      <p className={`text-xs mt-1 ${past ? 'text-amber-700' : 'text-gray-400'}`}>
        {past
          ? `Current date ${formatDate(day)} is before today. Choose today or a later date.`
          : shown
            ? `Follow up on ${formatDate(shown)}. Today or later only.`
            : 'Pick Daily, Weekly, 15 days, 30 days, or a date from today onward.'}
      </p>
    </div>
  );
}
