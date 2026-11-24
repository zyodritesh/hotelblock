import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination from '../components/Pagination';
import FollowUpPicker from '../components/FollowUpPicker';
import { formatDateTime, formatDate, SEGMENTS, CALL_TYPES, CALL_OUTCOMES, SEGMENT_COLORS, OUTCOME_COLORS, cn, exportCSV } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Call {
  id: string; contact_name: string; company: string; phone: string;
  user_id: string; user_name: string; segment: string; call_type: string;
  duration_min: number; outcome: string; notes: string; next_action: string;
  next_action_date: string | null; created_at: string;
  property_id?: string | null; property_name?: string | null;
}
interface Hotel { id: string; name: string; }

const EMPTY_FORM = { contact_name: '', company: '', phone: '', segment: 'Rooms', call_type: 'Cold Call', duration_min: 0, outcome: 'Interested', notes: '', next_action: '', next_action_date: '', property_id: '' };

export default function Calls() {
  const { isManager, activePropertyId } = useAuthStore();
  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<Call | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ segment: '', call_type: '', outcome: '', from: '', to: '', user_id: '', property_id: '' });
  const [users, setUsers] = useState<any[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCalls = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.segment) q.append('segment', filters.segment);
      if (filters.call_type) q.append('call_type', filters.call_type);
      if (filters.outcome) q.append('outcome', filters.outcome);
      if (filters.from) q.append('from', filters.from);
      if (filters.to) q.append('to', filters.to);
      if (filters.user_id) q.append('user_id', filters.user_id);
      if (filters.property_id) q.append('property_id', filters.property_id);
      if (search) q.append('search', search);
      q.append('limit', String(ps));
      q.append('offset', String((p - 1) * ps));
      const res = await api.get<any>(`/calls?${q}`);
      setCalls(res.data ?? res);
      setTotal(res.total ?? res.length ?? 0);
    } finally { setLoading(false); }
  }, [filters, search, page, pageSize]);

  useEffect(() => { setPage(1); }, [filters, search, pageSize]);
  useEffect(() => { loadCalls(page, pageSize); }, [page, pageSize, filters, search]);
  useEffect(() => {
    if (isManager()) api.get<any[]>('/users').then(setUsers);
    api.get<Hotel[]>('/properties').then(setHotels).catch(() => {});
  }, []);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, property_id: activePropertyId || '' }); setShowModal(true); };
  const openEdit = (call: Call) => {
    setEditing(call);
    setForm({ contact_name: call.contact_name, company: call.company, phone: call.phone, segment: call.segment, call_type: call.call_type, duration_min: call.duration_min, outcome: call.outcome, notes: call.notes, next_action: call.next_action, next_action_date: call.next_action_date || '', property_id: call.property_id || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (editing) await api.put(`/calls/${editing.id}`, form);
      else await api.post('/calls', form);
      setShowModal(false); loadCalls(page, pageSize);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    await api.del(`/calls/${id}`); loadCalls(page, pageSize);
  };

  const handleExport = async () => {
    // Export all matching records (no pagination)
    const q = new URLSearchParams();
    if (filters.segment) q.append('segment', filters.segment);
    if (filters.call_type) q.append('call_type', filters.call_type);
    if (filters.outcome) q.append('outcome', filters.outcome);
    if (filters.from) q.append('from', filters.from);
    if (filters.to) q.append('to', filters.to);
    if (filters.user_id) q.append('user_id', filters.user_id);
    if (filters.property_id) q.append('property_id', filters.property_id);
    if (search) q.append('search', search);
    q.append('limit', '5000'); q.append('offset', '0');
    const res = await api.get<any>(`/calls?${q}`);
    const rows = res.data ?? res;
    exportCSV('calls', rows, [
      { key: 'created_at', label: 'Date' }, { key: 'contact_name', label: 'Contact' },
      { key: 'company', label: 'Company' }, { key: 'phone', label: 'Phone' },
      { key: 'segment', label: 'Segment' }, { key: 'call_type', label: 'Type' },
      { key: 'outcome', label: 'Outcome' }, { key: 'duration_min', label: 'Duration (min)' },
      { key: 'notes', label: 'Notes' }, { key: 'next_action', label: 'Next Action' },
      { key: 'next_action_date', label: 'Next Action Date' }, { key: 'user_name', label: 'By' },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">Call Tracker</h1>
          <p className="text-xs text-gray-400 mt-0.5">{total.toLocaleString()} calls</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExport} className="btn-secondary text-sm px-3 py-2 hidden sm:flex items-center gap-1">⬇ Export</button>
          <button className="btn-primary text-sm px-3 py-2" onClick={openCreate}>+ Log Call</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
        <label className="block text-xs font-medium text-gray-600">Search
          <input
            type="search"
            placeholder="Name, company, phone, or notes"
            className="input mt-1"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="block text-xs font-medium text-gray-600">Segment
            <select className="select mt-1" value={filters.segment} onChange={e => setFilters(f => ({ ...f, segment: e.target.value }))}>
              <option value="">All segments</option>
              {SEGMENTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600">Type
            <select className="select mt-1" value={filters.call_type} onChange={e => setFilters(f => ({ ...f, call_type: e.target.value }))}>
              <option value="">All types</option>
              {CALL_TYPES.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600">Outcome
            <select className="select mt-1" value={filters.outcome} onChange={e => setFilters(f => ({ ...f, outcome: e.target.value }))}>
              <option value="">All outcomes</option>
              {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-600">Hotel
            <select className="select mt-1" value={filters.property_id} onChange={e => setFilters(f => ({ ...f, property_id: e.target.value }))}>
              <option value="">All hotels</option>
              {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          {isManager() && (
            <label className="block text-xs font-medium text-gray-600">Staff
              <select className="select mt-1" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">All staff</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs font-medium text-gray-600">From
            <input type="date" className="input mt-1" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          </label>
          <label className="block text-xs font-medium text-gray-600">To
            <input type="date" className="input mt-1" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          </label>
        </div>
        <div className="flex gap-2">
          {(search || Object.values(filters).some(v => v)) && (
            <button type="button" className="btn-secondary text-sm" onClick={() => { setSearch(''); setFilters({ segment: '', call_type: '', outcome: '', from: '', to: '', user_id: '', property_id: '' }); }}>Clear filters</button>
          )}
          <button type="button" onClick={handleExport} className="btn-secondary text-sm sm:hidden">Export</button>
        </div>
      </div>

      {loading && <div className="text-center py-4 text-gray-400 text-sm">Loading…</div>}

      {/* Cards on mobile, table on desktop */}
      <div className="md:hidden space-y-2">
        {!loading && calls.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400">
            No calls match this search.
          </div>
        )}
        {calls.map(call => (
          <div key={call.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{call.contact_name || '—'}</span>
                  <span className={`badge text-xs ${SEGMENT_COLORS[call.segment] || 'bg-gray-100 text-gray-600'}`}>{call.segment}</span>
                </div>
                {(call.company || call.property_name) && <p className="text-xs text-gray-500 mt-0.5">{[call.company, call.property_name].filter(Boolean).join(' · ')}</p>}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`badge text-xs ${OUTCOME_COLORS[call.outcome] || 'bg-gray-100 text-gray-600'}`}>{call.outcome}</span>
                  <span className="text-xs text-gray-400">{call.call_type}</span>
                  {call.duration_min > 0 && <span className="text-xs text-gray-400">{call.duration_min}m</span>}
                </div>
                {call.notes && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{call.notes}</p>}
                {call.next_action && (
                  <p className="text-xs text-blue-600 mt-1">→ {call.next_action} {call.next_action_date ? `by ${formatDate(call.next_action_date)}` : ''}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">{formatDate(call.created_at)}</p>
                <div className="flex gap-1 mt-2">
                  <button className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-50 rounded" onClick={() => openEdit(call)}>Edit</button>
                  <button className="text-xs text-red-500 font-medium px-2 py-1 bg-red-50 rounded" onClick={() => setDeleteId(call.id)}>Del</button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {calls.length > 0 && <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={ps => { setPageSize(ps); setPage(1); }} />}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Contact / Company</th>
            <th className="pb-2 font-medium">Segment</th>
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Outcome</th>
            <th className="pb-2 font-medium">Next Action</th>
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
                <td className="py-3 pr-4">
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
            {calls.length === 0 && !loading && <tr><td colSpan={8} className="py-12 text-center text-gray-400">No calls found.</td></tr>}
          </tbody>
        </table>
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={ps => { setPageSize(ps); setPage(1); }} />
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Call' : 'Log New Call'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className="label">Hotel</label>
            <select className="select" value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
              <option value="">— No hotel —</option>
              {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
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
          <FollowUpPicker label="When to follow up" value={form.next_action_date} onChange={next_action_date => setForm(f => ({ ...f, next_action_date }))} />
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
