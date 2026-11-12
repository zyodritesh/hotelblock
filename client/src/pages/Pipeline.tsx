import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination from '../components/Pagination';
import { formatCurrency, formatStay, SEGMENTS, PIPELINE_STAGES, SEGMENT_COLORS, STAGE_COLORS, cn, exportCSV, roleLabel } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Person { id: string; name: string; role: string; }
interface Lead {
  id: string; title: string; segment: string; stage: string; estimated_revenue: number;
  event_date: string | null; event_end_date?: string | null; room_nights: number; pax: number; notes: string;
  user_id: string; user_name: string; account_id?: string | null; contact_id?: string | null;
  account_name: string; contact_name: string;
  created_by?: string | null; created_by_name?: string | null;
  property_id?: string | null; property_name?: string | null; property_city?: string | null;
  owners?: Person[];
  created_at: string; updated_at: string;
}
interface Hotel { id: string; name: string; city: string; }

const EMPTY_FORM = { title: '', segment: 'Rooms', stage: 'Prospect', estimated_revenue: 0, event_date: '', event_end_date: '', room_nights: 0, pax: 0, notes: '', account_id: '', contact_id: '', property_id: '', owner_ids: [] as string[] };

function ownerNames(lead: Lead) {
  if (lead.owners?.length) return lead.owners.map(o => o.id === lead.user_id ? `${o.name} (primary)` : o.name).join(', ');
  return lead.user_name || '';
}

function OwnerPicker({ people, value, onChange }: { people: Person[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const selected = value.map(id => people.find(p => p.id === id)).filter((p): p is Person => !!p);
  const filtered = people.filter(p => `${p.name} ${roleLabel(p.role)}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  const makePrimary = (id: string) => onChange([id, ...value.filter(x => x !== id)]);
  return (
    <div>
      <label className="label">Lead owners *</label>
      <p className="text-xs text-gray-500 mb-2">Pick one or more people in the company. The first owner is primary for targets and revenue. Each new owner is notified.</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((p, i) => (
            <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${i === 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
              {p.name}{i === 0 ? ' · Primary' : ''}
              {i > 0 && <button type="button" className="underline" onClick={() => makePrimary(p.id)}>Make primary</button>}
              <button type="button" className="text-gray-500 hover:text-red-600" onClick={() => toggle(p.id)} aria-label={`Remove ${p.name}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <input className="input mb-2" placeholder="Search colleagues" value={q} onChange={e => setQ(e.target.value)} />
      <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
        {filtered.map(p => (
          <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="flex-1">{p.name}</span>
            <span className="text-xs text-gray-400">{roleLabel(p.role)}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">No matching people.</p>}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { user, activePropertyId } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const openedLead = useRef<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<Lead | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [filters, setFilters] = useState({ segment: '', stage: '', user_id: '', property_id: '' });
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLeads = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.segment) q.append('segment', filters.segment);
      if (filters.stage) q.append('stage', filters.stage);
      if (filters.user_id) q.append('user_id', filters.user_id);
      if (filters.property_id) q.append('property_id', filters.property_id);
      if (search) q.append('search', search);
      q.append('limit', String(viewMode === 'kanban' ? 500 : ps));
      q.append('offset', String(viewMode === 'kanban' ? 0 : (p - 1) * ps));
      const res = await api.get<any>(`/leads?${q}`);
      setLeads(res.data ?? res);
      setTotal(res.total ?? res.length ?? 0);
    } finally { setLoading(false); }
  }, [filters, search, page, pageSize, viewMode]);

  useEffect(() => { setPage(1); }, [filters, search, pageSize, viewMode]);
  useEffect(() => { loadLeads(page, pageSize); }, [page, pageSize, filters, search, viewMode]);
  useEffect(() => {
    api.get<any>('/accounts?limit=500').then(r => setAccounts(r.data ?? r));
    api.get<any>('/contacts?limit=500').then(r => setContacts(r.data ?? r));
    api.get<Person[]>('/users/directory').then(setPeople).catch(() => {});
    api.get<Hotel[]>('/properties').then(setHotels).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, owner_ids: user?.id ? [user.id] : [], property_id: activePropertyId || hotels[0]?.id || '' });
    setShowModal(true);
  };
  const openEdit = (lead: Lead) => {
    setEditing(lead);
    const ownerIds = (lead.owners || []).map(o => o.id);
    const ordered = lead.user_id && ownerIds.includes(lead.user_id)
      ? [lead.user_id, ...ownerIds.filter(id => id !== lead.user_id)]
      : ownerIds.length ? ownerIds : (lead.user_id ? [lead.user_id] : []);
    setForm({
      title: lead.title, segment: lead.segment, stage: lead.stage, estimated_revenue: lead.estimated_revenue,
      event_date: lead.event_date || '', event_end_date: lead.event_end_date ? String(lead.event_end_date).slice(0, 10) : '', room_nights: lead.room_nights, pax: lead.pax, notes: lead.notes || '',
      account_id: lead.account_id || '', contact_id: lead.contact_id || '', property_id: lead.property_id || '', owner_ids: ordered,
    });
    setShowModal(true);
  };

  useEffect(() => {
    const leadId = (location.state as { leadId?: string } | null)?.leadId;
    if (!leadId || openedLead.current === leadId) return;
    const found = leads.find(l => l.id === leadId);
    if (found) { openedLead.current = leadId; openEdit(found); return; }
    if (loading) return;
    api.get<Lead>(`/leads/${leadId}`).then(lead => { openedLead.current = leadId; openEdit(lead); }).catch(() => { openedLead.current = leadId; });
  }, [location.state, leads, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.owner_ids.length) { setError('Choose at least one lead owner'); return; }
    if (!form.property_id) { setError('Choose a hotel'); return; }
    setLoading(true);
    try {
      if (editing) await api.put(`/leads/${editing.id}`, form);
      else await api.post('/leads', form);
      setShowModal(false); loadLeads(page, pageSize);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleExport = async () => {
    const q = new URLSearchParams();
    if (filters.segment) q.append('segment', filters.segment);
    if (filters.stage) q.append('stage', filters.stage);
    if (filters.user_id) q.append('user_id', filters.user_id);
    if (filters.property_id) q.append('property_id', filters.property_id);
    if (search) q.append('search', search);
    q.append('limit', '5000'); q.append('offset', '0');
    const res = await api.get<any>(`/leads?${q}`);
    const rows = (res.data ?? res).map((lead: Lead) => ({ ...lead, owner_names: ownerNames(lead) }));
    exportCSV('pipeline', rows, [
      { key: 'title', label: 'Lead Title' }, { key: 'segment', label: 'Segment' },
      { key: 'stage', label: 'Stage' }, { key: 'estimated_revenue', label: 'Revenue (₹)' },
      { key: 'event_date', label: 'Start' }, { key: 'event_end_date', label: 'End' }, { key: 'pax', label: 'Pax' },
      { key: 'room_nights', label: 'Room Nights' }, { key: 'account_name', label: 'Account' },
      { key: 'contact_name', label: 'Contact' }, { key: 'property_name', label: 'Hotel' }, { key: 'user_name', label: 'Primary owner' },
      { key: 'owner_names', label: 'Owners' }, { key: 'created_by_name', label: 'Added by' },
      { key: 'notes', label: 'Notes' }, { key: 'updated_at', label: 'Updated' },
    ]);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">Sales Pipeline</h1>
          <p className="text-xs text-gray-400 mt-0.5">{leads.length} leads · {formatCurrency(leads.reduce((s, l) => s + l.estimated_revenue, 0))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleExport} className="btn-secondary text-sm px-3 py-2 hidden sm:flex items-center gap-1">⬇ Export</button>
          <div className="hidden sm:flex border border-gray-200 rounded-lg overflow-hidden">
            <button className={cn('px-3 py-1.5 text-sm', viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')} onClick={() => setViewMode('kanban')}>Kanban</button>
            <button className={cn('px-3 py-1.5 text-sm', viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')} onClick={() => setViewMode('table')}>Table</button>
          </div>
          <button className="btn-primary text-sm px-3 py-2" onClick={openCreate}>+ Add Lead</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <input type="text" placeholder="🔍 Search leads…" className="input flex-shrink-0 text-xs py-1.5 w-44" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select flex-shrink-0 text-xs w-28 py-1.5" value={filters.segment} onChange={e => setFilters(f => ({ ...f, segment: e.target.value }))}>
          <option value="">All Segments</option>
          {SEGMENTS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select flex-shrink-0 text-xs w-36 py-1.5" value={filters.stage} onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))}>
          <option value="">All Stages</option>
          {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select flex-shrink-0 text-xs w-40 py-1.5" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
          <option value="">All owners</option>
          {people.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="select flex-shrink-0 text-xs w-44 py-1.5" value={filters.property_id} onChange={e => setFilters(f => ({ ...f, property_id: e.target.value }))}>
          <option value="">All hotels</option>
          {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        {(search || Object.values(filters).some(v => v)) && (
          <button className="btn-ghost text-xs flex-shrink-0 px-3 py-1.5" onClick={() => { setSearch(''); setFilters({ segment: '', stage: '', user_id: '', property_id: '' }); }}>✕ Clear</button>
        )}
        <button onClick={handleExport} className="btn-ghost text-xs flex-shrink-0 px-3 py-1.5 sm:hidden">⬇ Export</button>
      </div>

      {/* Mobile card list — shown on small screens regardless of viewMode */}
      <div className="sm:hidden space-y-2">
        {!loading && leads.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400">No leads found.</div>
        )}
        {leads.map(lead => (
          <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm leading-tight">{lead.title}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className={`badge text-xs ${SEGMENT_COLORS[lead.segment]}`}>{lead.segment}</span>
                  <span className={`badge text-xs ${STAGE_COLORS[lead.stage]}`}>{lead.stage}</span>
                </div>
                <p className="text-xs text-blue-700 mt-1">{lead.property_name || 'No hotel'}</p>
                <p className="text-xs text-gray-500 mt-2">{ownerNames(lead)}</p>
                {lead.created_by_name && lead.created_by && !(lead.owners || []).some(o => o.id === lead.created_by) && (
                  <p className="text-xs text-gray-400">Added by {lead.created_by_name}</p>
                )}
                <p className="text-sm font-bold text-green-600 mt-2">{formatCurrency(lead.estimated_revenue)}</p>
                {lead.event_date && <p className="text-xs text-gray-400 mt-0.5">📅 {formatStay(lead.event_date, lead.event_end_date)}</p>}
                <div className="mt-2">
                  <select className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 bg-gray-50 w-full" value={lead.stage} onChange={e => moveStage(lead.id, e.target.value)}>
                    {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-1">
                <button className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-50 rounded" onClick={() => openEdit(lead)}>Edit</button>
                <button className="text-xs text-red-500 font-medium px-2 py-1 bg-red-50 rounded" onClick={() => setDeleteId(lead.id)}>Del</button>
              </div>
            </div>
          </div>
        ))}
        {viewMode === 'table' && <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={ps => { setPageSize(ps); setPage(1); }} />}
      </div>

      {/* Desktop: Kanban or Table */}
      {viewMode === 'kanban' ? (
        <div className="hidden sm:flex gap-3 overflow-x-auto pb-4">
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
                      <p className="text-xs text-blue-700">{lead.property_name || 'No hotel'}</p>
                      <p className="text-xs text-gray-500">{lead.account_name || ownerNames(lead)}</p>
                      <p className="text-xs text-gray-400 mt-1">{ownerNames(lead)}</p>
                      {lead.created_by_name && lead.created_by && !(lead.owners || []).some(o => o.id === lead.created_by) && (
                        <p className="text-xs text-gray-400">Added by {lead.created_by_name}</p>
                      )}
                      <p className="text-sm font-semibold text-green-600 mt-2">{formatCurrency(lead.estimated_revenue)}</p>
                      {lead.event_date && <p className="text-xs text-gray-400 mt-1">📅 {formatStay(lead.event_date, lead.event_end_date)}</p>}
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
        <div className="hidden sm:block card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="pb-2 font-medium">Lead</th>
              <th className="pb-2 font-medium">Hotel</th>
              <th className="pb-2 font-medium">Segment</th>
              <th className="pb-2 font-medium">Stage</th>
              <th className="pb-2 font-medium">Revenue</th>
              <th className="pb-2 font-medium">Dates</th>
              <th className="pb-2 font-medium">Owners</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className="table-row">
                  <td className="py-3 pr-4"><p className="font-medium">{lead.title}</p><p className="text-xs text-gray-400">{lead.account_name}</p></td>
                  <td className="py-3 pr-4 text-xs text-gray-600">{lead.property_name || '—'}</td>
                  <td className="py-3 pr-4"><span className={`badge ${SEGMENT_COLORS[lead.segment]}`}>{lead.segment}</span></td>
                  <td className="py-3 pr-4">
                    <select className="select text-xs py-1 px-2 w-36" value={lead.stage} onChange={e => moveStage(lead.id, e.target.value)}>
                      {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="py-3 pr-4 font-semibold text-green-600">{formatCurrency(lead.estimated_revenue)}</td>
                  <td className="py-3 pr-4 text-gray-500">{formatStay(lead.event_date, lead.event_end_date)}</td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">{ownerNames(lead)}{lead.created_by_name && lead.created_by && !(lead.owners || []).some(o => o.id === lead.created_by) ? ` · added by ${lead.created_by_name}` : ''}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(lead)}>Edit</button>
                      <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(lead.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && !loading && <tr><td colSpan={8} className="py-12 text-center text-gray-400">No leads found.</td></tr>}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={ps => { setPageSize(ps); setPage(1); }} />
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Lead' : 'Add New Lead'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className="label">Lead Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Sharma Wedding - 200 pax" /></div>
          <div className="md:col-span-2"><label className="label">Hotel *</label>
            <select className="select" required value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
              <option value="">Choose a hotel</option>
              {hotels.map(h => <option key={h.id} value={h.id}>{h.name}{h.city ? ` · ${h.city}` : ''}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">A lead can be for any hotel. The proposal uses that hotel’s logo, address and GST.</p>
          </div>
          <div className="md:col-span-2">
            <OwnerPicker people={people} value={form.owner_ids} onChange={owner_ids => setForm(f => ({ ...f, owner_ids }))} />
          </div>
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
          <div><label className="label">Start date</label><input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
          <div><label className="label">End date</label><input type="date" className="input" value={form.event_end_date} onChange={e => setForm(f => ({ ...f, event_end_date: e.target.value }))} />
            <p className="text-xs text-gray-500 mt-1">Leave blank for one day. On the calendar, drag across days to set this range.</p>
          </div>
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
          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            {editing && (
              <button type="button" className="btn-secondary" onClick={() => navigate('/proposals', { state: { fromLead: editing } })}>Create proposal</button>
            )}
            <div className="ml-auto flex gap-3">
              <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update' : 'Add Lead'}</button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await api.del(`/leads/${deleteId}`); loadLeads(); }} title="Delete Lead" message="Delete this lead?" confirmLabel="Delete" danger />
    </div>
  );
}
