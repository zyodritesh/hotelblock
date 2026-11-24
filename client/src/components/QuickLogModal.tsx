import React, { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { SEGMENTS } from '../lib/utils';
import FollowUpPicker from './FollowUpPicker';

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

const OUTCOMES = ['Interested', 'Callback Requested', 'Proposal Sent', 'Not Interested', 'No Answer'];

export default function QuickLogModal({ onClose, onSaved }: Props) {
  const { token, activePropertyId } = useAuthStore();
  const [form, setForm] = useState({
    contact_name: '', company: '', phone: '',
    segment: 'Rooms', call_type: 'Cold Call', outcome: 'Interested',
    notes: '', next_action_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.contact_name.trim()) {
      setError('Add a contact name');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, property_id: activePropertyId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Could not save the call' }));
        throw new Error(body.error || 'Could not save the call');
      }
      setSaved(true);
      setTimeout(() => {
        onSaved?.();
        setForm(f => ({ ...f, contact_name: '', company: '', phone: '', notes: '', next_action_date: '' }));
        setSaved(false);
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Could not save the call');
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Log a call</h2>
            <p className="text-sm text-gray-500 mt-0.5">Name, segment, and outcome</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Contact name</label>
            <input
              autoFocus
              type="text"
              placeholder="Who did you speak with?"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={form.contact_name}
              onChange={e => set('contact_name', e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Company</label>
              <input type="text" placeholder="Optional" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" value={form.company} onChange={e => set('company', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone</label>
              <input type="tel" placeholder="Optional" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Segment</label>
            <div className="flex gap-2 flex-wrap">
              {SEGMENTS.map(s => (
                <button key={s} type="button" onClick={() => set('segment', s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${form.segment === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Outcome</label>
            <div className="flex gap-2 flex-wrap">
              {OUTCOMES.map(o => (
                <button key={o} type="button" onClick={() => set('outcome', o)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${form.outcome === o ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Notes</label>
            <textarea
              placeholder="Optional"
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none resize-none"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          <FollowUpPicker label="When to follow up" value={form.next_action_date} onChange={d => set('next_action_date', d)} />

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !form.contact_name.trim()}
            className={`w-full py-3.5 rounded-xl text-base font-bold ${saved ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`}
          >
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save call'}
          </button>
        </div>
      </div>
    </div>
  );
}
