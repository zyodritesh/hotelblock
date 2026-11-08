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
  const matched = PRESETS.find(p => day && addDaysISO(today, p.days) === day)?.id;

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {PRESETS.map(p => (
          <button
            type="button"
            key={p.id}
            onClick={() => onChange(addDaysISO(today, p.days))}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${matched === p.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        className="input"
        value={day}
        onChange={e => onChange(e.target.value)}
      />
      <p className="text-xs text-gray-400 mt-1">
        {day ? `Follow up on ${formatDate(day)}. No time is saved.` : 'Pick Daily, Weekly, 15 days, 30 days, or choose a date.'}
      </p>
    </div>
  );
}
