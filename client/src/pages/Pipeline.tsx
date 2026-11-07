import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, formatDate, SEGMENTS, PIPELINE_STAGES, SEGMENT_COLORS, STAGE_COLORS, cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Lead {
  id: string; title: string; segment: string; stage: string; estimated_revenue: number;
  event_date: string | null; room_nights: number; pax: number; notes: string;
  user_id: string; user_name: string; account_name: string; contact_name: string;
  created_at: string; updated_at: string;
}

const EMPTY_FORM = { title: '', segment: 'Rooms', stage: 'Prospect', estimated_revenue: 0, event_date: '', room_nights: 0, pax: 0, notes: '', account_id: '', contact_id: '' };

export default function Pipeline() {
  const { isManager } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<Lead | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [filters, setFilters] = useState({ segment: '', user_id: '' });
  const [users, setUsers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadLeads = async () => {
    const p = new URLSearchParams();
    if (filters.segment) p.append('segment', filters.segment);
    if (filters.user_id) p.append('user_id', filters.user_id);
    const data = await api.get<Lead[]>(`/leads?${p.toString()}`);
    setLeads(data);
  };

  useEffect(() => { loadLeads(); }, [filters]);
  useEffect(() => {
    api.get<any[]>('/accounts').then(setAccounts);
    api.get<any[]>('/contacts').then(setContacts);
    if (isManager()) api.get<any[]>('/users').then(setUsers);
  }, []);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true); };
  const openEdit = (lead: Lead) => {
    setEditing(lead);
    setForm({ title: lead.title, segment: lead.segment, stage: lead.stage, estimated_revenue: lead.estimated_revenue, event_date: lead.event_date || '', room_nights: lead.room_nights, pax: lead.pax, notes: lead.notes, account_id: '', contact_id: '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (editing) await api.put(`/leads/${editing.id}`, form);
      else await api.post('/leads', form);
      setShowModal(false); loadLeads();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const moveStage = async (id: string, stage: string) => {
    await api.put(`/leads/${id}`, { stage });
    setLeads(leads => leads.map(l => l.id === id ? { ...l, stage } : l));
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (dragging) moveStage(dragging, stage);
    setDragging(null);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">🔄 Sales Pipeline</h1>
        <div className="flex items-center gap-3">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button className={cn('px-3 py-2 text-sm', viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')} onClick={() => setViewMode('kanban')}>Kanban</button>
            <button className={cn('px-3 py-2 text-sm', viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')} onClick={() => setViewMode('table')}>Table</button>
          </div>
          <button className="btn-primary" onClick={openCreate}>+ Add Lead</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select className="select w-36" value={filters.segment} onChange={e => setFilters(f => ({ ...f, segment: e.target.value }))}>
          <option value="">All Segments</option>
          {SEGMENTS.map(s => <option key={s}>{s}</option>)}
        </select>
        {isManager() && (
          <select className="select w-44" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
            <option value="">All Staff</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </div>

      {viewMode === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage);
            const stageValue = stageLeads.reduce((s, l) => s + l.estimated_revenue, 0);
            return (
              <div
                key={stage}
                className="flex-shrink-0 w-64 bg-gray-100 rounded-xl p-3"
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, stage)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className={`badge text-xs ${STAGE_COLORS[stage]}`}>{stage}</span>
                    <p className="text-xs text-gray-500 mt-1">{stageLeads.length} leads · {formatCurrency(stageValue)}</p>
                  </div>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragging(lead.id)}
                      className="bg-white rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-gray-900 leading-tight">{lead.title}</p>
                        <span className={`badge text-xs flex-shrink-0 ${SEGMENT_COLORS[lead.segment]}`}>{lead.segment.slice(0, 3)}</span>
                      </div>
                      <p className="text-xs text-gray-500">{lead.account_name || lead.user_name}</p>
                      <p className="text-sm font-semibold text-green-600 mt-2">{formatCurrency(lead.estimated_revenue)}</p>
                      {lead.event_date && <p className="text-xs text-gray-400 mt-1">📅 {formatDate(lead.event_date)}</p>}
                      <div className="flex gap-1 mt-2">
                        <button className="text-xs text-blue-600 hover:underline" onClick={() => openEdit(lead)}>Edit</button>
                        <span className="text-gray-300">·</span>
                        <button className="text-xs text-red-500 hover:underline" onClick={() => setDeleteId(lead.id)}>Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="pb-2 font-medium">Lead</th>
              <th className="pb-2 font-medium">Segment</th>
              <th className="pb-2 font-medium">Stage</th>
              <th className="pb-2 font-medium">Revenue</th>
              <th className="pb-2 font-medium">Event Date</th>
              <th className="pb-2 font-medium">Owner</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className="table-row">
                  <td className="py-3 pr-4"><p className="font-medium">{lead.title}</p><p className="text-xs text-gray-400">{lead.account_name}</p></td>
                  <td className="py-3 pr-4"><span className={`badge ${SEGMENT_COLORS[lead.segment]}`}>{lead.segment}</span></td>
                  <td className="py-3 pr-4">
                    <select className="select text-xs py-1 px-2 w-36" value={lead.stage} onChange={e => moveStage(lead.id, e.target.value)}>
                      {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-3 pr-4 font-semibold text-green-600">{formatCurrency(lead.estimated_revenue)}</td>
                  <td className="py-3 pr-4 text-gray-500">{formatDate(lead.event_date)}</td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">{lead.user_name}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(lead)}>Edit</button>
                      <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(lead.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-gray-400">No leads found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Lead' : 'Add New Lead'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className="label">Lead Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Sharma Wedding - 200 pax" /></div>
          <div><label className="label">Segment *</label>
            <select className="select" value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value }))}>
              {SEGMENTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Stage</label>
            <select className="select" value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
              {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Estimated Revenue (₹)</label><input type="number" className="input" value={form.estimated_revenue} onChange={e => setForm(f => ({ ...f, estimated_revenue: parseFloat(e.target.value) || 0 }))} /></div>
          <div><label className="label">Event / Check-in Date</label><input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
          <div><label className="label">Room Nights</label><input type="number" className="input" value={form.room_nights} onChange={e => setForm(f => ({ ...f, room_nights: parseInt(e.target.value) || 0 }))} /></div>
          <div><label className="label">Pax / Guests</label><input type="number" className="input" value={form.pax} onChange={e => setForm(f => ({ ...f, pax: parseInt(e.target.value) || 0 }))} /></div>
          <div><label className="label">Account</label>
            <select className="select" value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
              <option value="">— Select Account —</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">Contact</label>
            <select className="select" value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
              <option value="">— Select Contact —</option>
              {contacts.map((c: any) => <option key={c.id} value={c.id}>{c.name} {c.account_name ? `(${c.account_name})` : ''}</option>)}
            </select>
          </div>
          <div className="md:col-span-2"><label className="label">Notes</label><textarea className="input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update' : 'Add Lead'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await api.del(`/leads/${deleteId}`); loadLeads(); }} title="Delete Lead" message="Delete this lead?" confirmLabel="Delete" danger />
    </div>
  );
}
