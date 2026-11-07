import React, { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { SEGMENTS, CALL_OUTCOMES, CALL_TYPES } from '../lib/utils';

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

export default function QuickLogModal({ onClose, onSaved }: Props) {
  const { token, activePropertyId } = useAuthStore();
  const [form, setForm] = useState({
    contact_name: '', company: '', phone: '',
    segment: 'Rooms', call_type: 'Cold Call', outcome: 'Interested',
    notes: '', next_action_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.contact_name.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, property_id: activePropertyId }),
      });
      setSaved(true);
      setTimeout(() => {
        onSaved?.();
        // Reset for next entry
        setForm(f => ({ ...f, contact_name: '', company: '', phone: '', notes: '', next_action_date: '' }));
        setSaved(false);
      }, 800);
    } finally { setSaving(false); }
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">⚡ Quick Log Call</h2>
            <p className="text-xs text-gray-400 mt-0.5">Fill minimum fields — takes 10 seconds</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {/* Contact name — big and prominent */}
          <div>
            <input
              autoFocus
              type="text"
              placeholder="Contact name *"
              className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-base font-medium focus:border-blue-500 focus:outline-none"
              value={form.contact_name}
              onChange={e => set('contact_name', e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Company" className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none" value={form.company} onChange={e => set('company', e.target.value)} />
            <input type="tel" placeholder="Phone" className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>

          {/* Segment — big pill buttons */}
          <div className="flex gap-2 flex-wrap">
            {SEGMENTS.map(s => (
              <button key={s} onClick={() => set('segment', s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${form.segment === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}>
                {s}
              </button>
            ))}
          </div>

          {/* Outcome — big pill buttons */}
          <div className="flex gap-2 flex-wrap">
            {['Interested', 'Callback Requested', 'Proposal Sent', 'Not Interested', 'No Answer'].map(o => (
              <button key={o} onClick={() => set('outcome', o)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.outcome === o ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:border-green-300'}`}>
                {o}
              </button>
            ))}
          </div>

          {/* Notes — optional */}
          <textarea
            placeholder="Notes (optional)"
            rows={2}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none resize-none"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />

          {/* Follow-up date */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">Follow-up:</span>
            <input type="date" className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" value={form.next_action_date} onChange={e => set('next_action_date', e.target.value)} />
          </div>

          {/* Save button */}
          <button
            onClick={save}
            disabled={saving || !form.contact_name.trim()}
            className={`w-full py-3.5 rounded-xl text-base font-bold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`}
          >
            {saved ? '✓ Saved!' : saving ? 'Saving…' : '📞 Log Call'}
          </button>

          <p className="text-center text-xs text-gray-400">Press Enter to save quickly</p>
        </div>
      </div>
    </div>
  );
}
