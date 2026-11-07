import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDateTime, formatDate, SEGMENTS, CALL_TYPES, CALL_OUTCOMES, SEGMENT_COLORS, OUTCOME_COLORS, cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Call {
  id: string; contact_name: string; company: string; phone: string;
  user_id: string; user_name: string; segment: string; call_type: string;
  duration_min: number; outcome: string; notes: string; next_action: string;
  next_action_date: string | null; created_at: string;
}

const EMPTY_FORM = { contact_name: '', company: '', phone: '', segment: 'Rooms', call_type: 'Cold Call', duration_min: 0, outcome: 'Interested', notes: '', next_action: '', next_action_date: '' };

export default function Calls() {
  const { user, isManager } = useAuthStore();
  const [calls, setCalls] = useState<Call[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<Call | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ segment: '', outcome: '', from: '', to: '', user_id: '' });
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCalls = async () => {
    const p = new URLSearchParams();
    if (filters.segment) p.append('segment', filters.segment);
    if (filters.outcome) p.append('outcome', filters.outcome);
    if (filters.from) p.append('from', filters.from);
    if (filters.to) p.append('to', filters.to);
    if (filters.user_id) p.append('user_id', filters.user_id);
    const data = await api.get<Call[]>(`/calls?${p.toString()}`);
    setCalls(data);
  };

  useEffect(() => { loadCalls(); }, [filters]);
  useEffect(() => {
    if (isManager()) api.get<any[]>('/users').then(setUsers);
  }, []);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true); };
  const openEdit = (call: Call) => {
    setEditing(call);
    setForm({ contact_name: call.contact_name, company: call.company, phone: call.phone, segment: call.segment, call_type: call.call_type, duration_min: call.duration_min, outcome: call.outcome, notes: call.notes, next_action: call.next_action, next_action_date: call.next_action_date || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (editing) await api.put(`/calls/${editing.id}`, form);
      else await api.post('/calls', form);
      setShowModal(false); loadCalls();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    await api.del(`/calls/${id}`); loadCalls();
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">📞 Call Tracker</h1>
        <button className="btn-primary" onClick={openCreate}>+ Log Call</button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3">
          <select className="select w-36" value={filters.segment} onChange={e => setFilters(f => ({ ...f, segment: e.target.value }))}>
            <option value="">All Segments</option>
            {SEGMENTS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="select w-44" value={filters.outcome} onChange={e => setFilters(f => ({ ...f, outcome: e.target.value }))}>
            <option value="">All Outcomes</option>
            {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
          </select>
          <input type="date" className="input w-36" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} placeholder="From" />
          <input type="date" className="input w-36" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} placeholder="To" />
          {isManager() && (
            <select className="select w-44" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
              <option value="">All Staff</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <button className="btn-ghost text-sm" onClick={() => setFilters({ segment: '', outcome: '', from: '', to: '', user_id: '' })}>Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <p className="text-sm text-gray-400 mb-3">{calls.length} calls found</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Contact / Company</th>
            <th className="pb-2 font-medium">Segment</th>
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Outcome</th>
            <th className="pb-2 font-medium hidden md:table-cell">Next Action</th>
            <th className="pb-2 font-medium hidden lg:table-cell">By</th>
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {calls.map(call => (
              <tr key={call.id} className="table-row">
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-900">{call.contact_name || '—'}</p>
                  <p className="text-xs text-gray-400">{call.company}</p>
                </td>
                <td className="py-3 pr-4"><span className={`badge ${SEGMENT_COLORS[call.segment] || 'bg-gray-100 text-gray-600'}`}>{call.segment}</span></td>
                <td className="py-3 pr-4 text-gray-600">{call.call_type}</td>
                <td className="py-3 pr-4"><span className={`badge ${OUTCOME_COLORS[call.outcome] || 'bg-gray-100 text-gray-600'}`}>{call.outcome}</span></td>
                <td className="py-3 pr-4 hidden md:table-cell">
                  {call.next_action ? <><p className="text-xs">{call.next_action}</p><p className="text-xs text-gray-400">{formatDate(call.next_action_date)}</p></> : '—'}
                </td>
                <td className="py-3 pr-4 hidden lg:table-cell text-gray-500 text-xs">{call.user_name}</td>
                <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(call.created_at)}</td>
                <td className="py-3">
                  <div className="flex gap-1">
                    <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(call)}>Edit</button>
                    <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(call.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {calls.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-gray-400">No calls found. Click "+ Log Call" to add your first call.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Call' : 'Log New Call'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="label">Contact Name</label><input className="input" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
          <div><label className="label">Company</label><input className="input" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label">Segment *</label>
            <select className="select" value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value }))}>
              {SEGMENTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Call Type *</label>
            <select className="select" value={form.call_type} onChange={e => setForm(f => ({ ...f, call_type: e.target.value }))}>
              {CALL_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Duration (minutes)</label><input type="number" className="input" value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: parseInt(e.target.value) || 0 }))} /></div>
          <div><label className="label">Outcome *</label>
            <select className="select" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}>
              {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="md:col-span-2"><label className="label">Notes</label><textarea className="input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div><label className="label">Next Action</label><input className="input" value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} placeholder="e.g. Send proposal" /></div>
          <div><label className="label">Next Action Date</label><input type="date" className="input" value={form.next_action_date} onChange={e => setForm(f => ({ ...f, next_action_date: e.target.value }))} /></div>
          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update Call' : 'Log Call'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => handleDelete(deleteId!)} title="Delete Call" message="Are you sure you want to delete this call record?" confirmLabel="Delete" danger />
    </div>
  );
}
