import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import Pagination from '../components/Pagination';
import FollowUpPicker from '../components/FollowUpPicker';
import {
  AGENT_TYPES, AGENT_SPECIALIZATIONS, AGENT_TIERS, AGENT_STATUSES,
  FOLLOW_UP_FREQUENCIES, ACTIVITY_TYPES, ACTIVITY_OUTCOMES,
  TIER_CONFIG, DUE_STATUS_CONFIG, formatDate, formatDateTime, exportCSV, todayISO, addDaysISO
} from '../lib/utils';

const API = '/api';

interface Agent {
  id: string; name: string; agency_name: string; type: string;
  country: string; city: string; phone: string; email: string; website: string;
  specialization: string; tier: string; status: string; assigned_to: string | null;
  assigned_name?: string; property_id: string | null; notes: string;
  frequency: string | null; frequency_days: number | null;
  last_contact_date: string | null; next_due_date: string | null;
  due_status: string; days_overdue: number; followup_id: string | null;
  created_at: string;
  commission_type?: string; commission_rate?: number;
}

interface AgentIncentive {
  id: string; task: string; metric: string; target_value: number; pay_type: string; rate: number;
  actual: number; paid: boolean; paid_amount: number;
}

interface ActivityLog {
  id: string; agent_id: string; user_id: string; user_name?: string;
  type: string; outcome: string; notes: string; contacted_at: string;
}

const BLANK_AGENT = {
  name: '', agency_name: '', type: 'Travel Agent', country: '', city: '',
  phone: '', email: '', website: '', specialization: '', tier: 'B',
  status: 'Active', assigned_to: '', notes: '', frequency: 'Monthly', next_due_date: '',
  commission_type: 'percent', commission_rate: '0',
};

export default function Agents() {
  const { token, user, activePropertyId, isAdmin, isManager } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDue, setFilterDue] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState<typeof BLANK_AGENT>({ ...BLANK_AGENT });
  const [saving, setSaving] = useState(false);
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [detailData, setDetailData] = useState<{ activity: ActivityLog[]; leads: any[] } | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({ type: 'Call', outcome: '', notes: '', contacted_at: todayISO(), next_due_date: addDaysISO(todayISO(), 30) });
  const [logSaving, setLogSaving] = useState(false);
  const [pay, setPay] = useState<{ balance: number; incentives: AgentIncentive[] } | null>(null);
  const [incentiveForm, setIncentiveForm] = useState({ task: '', metric: 'enquiries', target_value: '5', pay_type: 'fixed', rate: '2000' });
  const [sortField, setSortField] = useState<'name' | 'tier' | 'next_due_date' | 'last_contact_date'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const isAdminOrManager = isAdmin() || isManager();

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }), [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterType) params.set('type', filterType);
      if (filterTier) params.set('tier', filterTier);
      if (filterStatus) params.set('status', filterStatus);
      if (filterDue) params.set('due_status', filterDue);
      if (filterCountry) params.set('country', filterCountry);
      if (activePropertyId) params.set('property_id', activePropertyId);
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));
      const res = await fetch(`${API}/agents?${params}`, { headers: headers() });
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : (data.data || []));
      setTotal(data.total ?? (Array.isArray(data) ? data.length : 0));
    } finally { setLoading(false); }
  }, [search, filterType, filterTier, filterStatus, filterDue, filterCountry, activePropertyId, headers, page, pageSize]);

  useEffect(() => { setPage(1); }, [search, filterType, filterTier, filterStatus, filterDue, filterCountry, pageSize]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdminOrManager) return;
    fetch(`${API}/users`, { headers: headers() })
      .then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [isAdminOrManager, headers]);

  const openCreate = () => { setForm({ ...BLANK_AGENT }); setEditAgent(null); setShowForm(true); };
  const openEdit = (a: Agent) => {
    setForm({ name: a.name, agency_name: a.agency_name, type: a.type, country: a.country, city: a.city, phone: a.phone, email: a.email, website: a.website, specialization: a.specialization, tier: a.tier, status: a.status, assigned_to: a.assigned_to || '', notes: a.notes, frequency: a.frequency || 'Monthly', next_due_date: (a.next_due_date || '').slice(0, 10), commission_type: a.commission_type === 'fixed' ? 'fixed' : 'percent', commission_rate: String(a.commission_rate ?? 0) });
    setEditAgent(a);
    setShowForm(true);
  };

  const saveAgent = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, property_id: activePropertyId, commission_rate: Number(form.commission_rate) || 0 };
      if (editAgent) {
        await fetch(`${API}/agents/${editAgent.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
      } else {
        await fetch(`${API}/agents`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  };

  const deleteAgent = async (id: string) => {
    if (!confirm('Archive this agent?')) return;
    await fetch(`${API}/agents/${id}`, { method: 'DELETE', headers: headers() });
    load();
  };

  const openLog = (a: Agent) => {
    const days = a.frequency_days || 30;
    setDetailAgent(a);
    setLogForm({ type: 'Call', outcome: '', notes: '', contacted_at: todayISO(), next_due_date: addDaysISO(todayISO(), days) });
    setShowLogModal(true);
  };

  const loadPay = async (id: string) => {
    if (!isAdminOrManager) { setPay(null); return; }
    const res = await fetch(`${API}/agent-portal/agents/${id}/pay`, { headers: headers() });
    if (!res.ok) return;
    const data = await res.json();
    setPay({ balance: data.wallet?.balance || 0, incentives: data.incentives || [] });
  };

  const openDetail = async (a: Agent) => {
    setDetailAgent(a);
    setPay(null);
    const res = await fetch(`${API}/agents/${a.id}`, { headers: headers() });
    const data = await res.json();
    setDetailData({ activity: data.activity || [], leads: data.leads || [] });
    loadPay(a.id);
  };

  const addIncentive = async () => {
    if (!detailAgent) return;
    const res = await fetch(`${API}/agent-portal/agents/${detailAgent.id}/incentives`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ ...incentiveForm, target_value: Number(incentiveForm.target_value), rate: Number(incentiveForm.rate) }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Could not add the incentive'); return; }
    setPay({ balance: data.wallet?.balance || 0, incentives: data.incentives || [] });
    setIncentiveForm({ task: '', metric: 'enquiries', target_value: '5', pay_type: 'fixed', rate: '2000' });
  };

  const removeIncentive = async (id: string) => {
    if (!detailAgent) return;
    const res = await fetch(`${API}/agent-portal/agents/${detailAgent.id}/incentives/${id}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (res.ok) setPay(prev => prev ? { ...prev, incentives: data.incentives || [] } : prev);
  };

  const submitLog = async () => {
    if (!detailAgent || !logForm.next_due_date) return;
    setLogSaving(true);
    try {
      await fetch(`${API}/agents/${detailAgent.id}/log`, { method: 'POST', headers: headers(), body: JSON.stringify(logForm) });
      setShowLogModal(false);
      setLogForm({ type: 'Call', outcome: '', notes: '', contacted_at: todayISO(), next_due_date: addDaysISO(todayISO(), 30) });
      // Refresh detail
      const res = await fetch(`${API}/agents/${detailAgent.id}`, { headers: headers() });
      const data = await res.json();
      setDetailData({ activity: data.activity || [], leads: data.leads || [] });
      setDetailAgent(prev => prev ? { ...prev, last_contact_date: logForm.contacted_at.slice(0, 10), next_due_date: logForm.next_due_date, due_status: 'On Track' } : null);
      load();
    } finally { setLogSaving(false); }
  };

  const sorted = [...agents].sort((a, b) => {
    let av: string = (a as any)[sortField] || '';
    let bv: string = (b as any)[sortField] || '';
    if (!av) return sortDir === 'asc' ? 1 : -1;
    if (!bv) return sortDir === 'asc' ? -1 : 1;
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const allCountries = [...new Set(agents.map(a => a.country).filter(Boolean))].sort();

  const SortBtn = ({ field, label }: { field: typeof sortField; label: string }) => (
    <button onClick={() => { if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('asc'); } }} className="flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900">
      {label}
      {sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : <span className="opacity-30"> ↕</span>}
    </button>
  );

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Network</h1>
          <p className="text-gray-500 text-sm mt-1">Global travel agents, DMCs, OTAs, MICE & corporate partners</p>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (filterType) params.set('type', filterType);
            if (filterTier) params.set('tier', filterTier);
            if (filterStatus) params.set('status', filterStatus);
            if (filterCountry) params.set('country', filterCountry);
            params.set('limit', '5000'); params.set('offset', '0');
            const res = await fetch(`${API}/agents?${params}`, { headers: headers() });
            const data = await res.json();
            const rows = Array.isArray(data) ? data : (data.data || []);
            exportCSV('agents', rows, [
              { key: 'name', label: 'Name' }, { key: 'agency_name', label: 'Agency' },
              { key: 'type', label: 'Type' }, { key: 'city', label: 'City' },
              { key: 'country', label: 'Country' }, { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' }, { key: 'tier', label: 'Tier' },
              { key: 'frequency', label: 'Frequency' }, { key: 'last_contact_date', label: 'Last Contact' },
              { key: 'next_due_date', label: 'Next Due' }, { key: 'due_status', label: 'Status' },
              { key: 'assigned_name', label: 'Assigned To' },
            ]);
          }} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-50">⬇ Export</button>
          <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2">
            + Add Agent
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Agents', value: agents.length, color: 'text-gray-900' },
          { label: 'Overdue', value: agents.filter(a => a.due_status === 'Overdue').length, color: 'text-red-600' },
          { label: 'Due Today', value: agents.filter(a => a.due_status === 'Due Today').length, color: 'text-yellow-600' },
          { label: 'Never Contacted', value: agents.filter(a => a.due_status === 'Never Contacted').length, color: 'text-gray-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.label === 'Total Agents' ? total : s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm col-span-2 md:col-span-2" placeholder="Search name, agency, city, country…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {AGENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterTier} onChange={e => setFilterTier(e.target.value)}>
            <option value="">All Tiers</option>
            {AGENT_TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterDue} onChange={e => setFilterDue(e.target.value)}>
            <option value="">All Follow-up Status</option>
            <option>Overdue</option>
            <option>Due Today</option>
            <option>On Track</option>
            <option>Never Contacted</option>
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterCountry} onChange={e => setFilterCountry(e.target.value)}>
            <option value="">All Countries</option>
            {allCountries.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left"><SortBtn field="name" label="Agent / Agency" /></th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold">Type</th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold">Location</th>
                <th className="px-4 py-3 text-left"><SortBtn field="tier" label="Tier" /></th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold">Frequency</th>
                <th className="px-4 py-3 text-left"><SortBtn field="last_contact_date" label="Last Contact" /></th>
                <th className="px-4 py-3 text-left"><SortBtn field="next_due_date" label="Next Due" /></th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-gray-600 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">No agents found. Add your first agent to get started.</td></tr>
              ) : sorted.map(a => {
                const dsc = DUE_STATUS_CONFIG[a.due_status] || DUE_STATUS_CONFIG['On Track'];
                const tc = TIER_CONFIG[a.tier] || TIER_CONFIG['B'];
                return (
                  <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(a)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{a.name}</div>
                      {a.agency_name && <div className="text-xs text-gray-500">{a.agency_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.type}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {[a.city, a.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${tc.color}`}>
                        {tc.label}
                        <span className="ml-1 font-normal opacity-70">{tc.desc}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.frequency || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(a.last_contact_date)}</td>
                    <td className="px-4 py-3">
                      {a.next_due_date ? (
                        <div className="flex flex-col">
                          <span className="text-gray-700">{formatDate(a.next_due_date)}</span>
                          {a.days_overdue > 0 && <span className="text-xs text-red-600">+{a.days_overdue}d overdue</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${dsc.bg} ${dsc.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dsc.dot}`}></span>
                        {dsc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openLog(a)} className="text-green-600 hover:text-green-800 text-xs font-medium bg-green-50 px-2 py-1 rounded">Log</button>
                        <button onClick={() => openEdit(a)} className="text-blue-600 hover:text-blue-800 text-xs font-medium bg-blue-50 px-2 py-1 rounded">Edit</button>
                        {isAdminOrManager && <button onClick={() => deleteAgent(a.id)} className="text-red-500 hover:text-red-700 text-xs font-medium bg-red-50 px-2 py-1 rounded">Del</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={ps => { setPageSize(ps); setPage(1); }} />
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editAgent ? 'Edit Agent' : 'Add New Agent'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                { label: 'Full Name *', field: 'name', type: 'text' },
                { label: 'Agency / Company', field: 'agency_name', type: 'text' },
                { label: 'Phone', field: 'phone', type: 'text' },
                { label: 'Email', field: 'email', type: 'email' },
                { label: 'Website', field: 'website', type: 'url' },
                { label: 'City', field: 'city', type: 'text' },
                { label: 'Country', field: 'country', type: 'text' },
              ] as { label: string; field: keyof typeof BLANK_AGENT; type: string }[]).map(({ label, field, type }) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <input type={type} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
              {([
                { label: 'Type', field: 'type', options: AGENT_TYPES },
                { label: 'Specialization', field: 'specialization', options: AGENT_SPECIALIZATIONS },
                { label: 'Tier', field: 'tier', options: AGENT_TIERS.map(t => t) },
                { label: 'Status', field: 'status', options: AGENT_STATUSES },
                { label: 'Follow-up Frequency', field: 'frequency', options: FOLLOW_UP_FREQUENCIES },
              ] as { label: string; field: keyof typeof BLANK_AGENT; options: readonly string[] }[]).map(({ label, field, options }) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}>
                    {field === 'tier' ? options.map(o => <option key={o} value={o}>Tier {o} — {TIER_CONFIG[o]?.desc}</option>) : options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {isAdminOrManager && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Commission</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.commission_type} onChange={e => setForm(f => ({ ...f, commission_type: e.target.value }))}>
                      <option value="percent">Percent of confirmed booking</option>
                      <option value="fixed">Fixed amount per confirmed booking</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">{form.commission_type === 'fixed' ? 'Rupees per booking' : 'Percent'}</label>
                    <input type="number" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))} />
                  </div>
                </>
              )}
              {isAdminOrManager && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Assigned To</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">— Self —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <FollowUpPicker label="When to follow up" value={form.next_due_date} onChange={next_due_date => setForm(f => ({ ...f, next_due_date }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={saveAgent} disabled={saving || !form.name.trim()} className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : editAgent ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailAgent && !showLogModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{detailAgent.name}</h2>
                {detailAgent.agency_name && <div className="text-sm text-gray-500">{detailAgent.agency_name}</div>}
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_CONFIG[detailAgent.tier]?.color}`}>{TIER_CONFIG[detailAgent.tier]?.label}</span>
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{detailAgent.type}</span>
                  {detailAgent.specialization && <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">{detailAgent.specialization}</span>}
                  {(() => { const dsc = DUE_STATUS_CONFIG[detailAgent.due_status]; return dsc && <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${dsc.bg} ${dsc.color}`}><span className={`w-1.5 h-1.5 rounded-full ${dsc.dot}`}></span>{dsc.label}</span>; })()}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openLog(detailAgent)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700">+ Log Activity</button>
                <button onClick={() => { setDetailAgent(null); setDetailData(null); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Contact Details</h3>
                {[['Location', [detailAgent.city, detailAgent.country].filter(Boolean).join(', ') || '—'], ['Phone', detailAgent.phone || '—'], ['Email', detailAgent.email || '—'], ['Website', detailAgent.website || '—']].map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-xs text-gray-500 w-20 flex-shrink-0 pt-0.5">{k}</span><span className="text-sm text-gray-800">{v}</span></div>
                ))}
                {detailAgent.notes && <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm text-gray-700">{detailAgent.notes}</div>}
              </div>

              {/* Follow-up cadence */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Follow-up Cadence</h3>
                <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between"><span className="text-xs text-gray-500">Frequency</span><span className="text-sm font-semibold text-blue-700">{detailAgent.frequency || 'Not set'}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-gray-500">Last Contact</span><span className="text-sm">{formatDate(detailAgent.last_contact_date)}</span></div>
                  <div>
                    <FollowUpPicker label="Next due" value={(detailAgent.next_due_date || '').slice(0, 10)}
                      onChange={next_due_date => {
                        const patch = { next_due_date, due_status: 'On Track', days_overdue: 0 };
                        setDetailAgent(prev => prev ? { ...prev, ...patch } : prev);
                        setAgents(prev => prev.map(a => a.id === detailAgent.id ? { ...a, ...patch } : a));
                        fetch(`${API}/agents/${detailAgent.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ next_due_date }) });
                      }} />
                  </div>
                  {detailAgent.days_overdue > 0 && <div className="text-xs text-red-600 font-medium">{detailAgent.days_overdue} day{detailAgent.days_overdue !== 1 ? 's' : ''} overdue</div>}
                </div>
              </div>
            </div>

            {isAdminOrManager && (
              <div className="px-6 pb-6">
                <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-3">Wallet and incentives</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Commission: {detailAgent.commission_type === 'fixed' ? `₹${Number(detailAgent.commission_rate || 0).toLocaleString('en-IN')} per confirmed booking` : `${detailAgent.commission_rate || 0}% of the confirmed booking`}.
                  Wallet balance ₹{Math.round(pay?.balance || 0).toLocaleString('en-IN')}.
                </p>
                <div className="space-y-2 mb-3">
                  {(pay?.incentives || []).map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                      <span>{item.task} · {item.actual}/{item.target_value} · {item.paid ? 'Paid' : item.pay_type === 'percent' ? `${item.rate}%` : `₹${item.rate}`}</span>
                      <button type="button" className="text-xs text-red-600" onClick={() => removeIncentive(item.id)}>Remove</button>
                    </div>
                  ))}
                  {pay && pay.incentives.length === 0 && <p className="text-sm text-gray-400">No incentive yet. Add one so this agent has a reason to send business this month.</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Incentive name" value={incentiveForm.task} onChange={e => setIncentiveForm(f => ({ ...f, task: e.target.value }))} />
                  <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={incentiveForm.metric} onChange={e => setIncentiveForm(f => ({ ...f, metric: e.target.value }))}>
                    <option value="enquiries">Enquiries this month</option>
                    <option value="bookings">Bookings confirmed this month</option>
                    <option value="revenue">Revenue confirmed this month</option>
                  </select>
                  <input type="number" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Target" value={incentiveForm.target_value} onChange={e => setIncentiveForm(f => ({ ...f, target_value: e.target.value }))} />
                  <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={incentiveForm.pay_type} onChange={e => setIncentiveForm(f => ({ ...f, pay_type: e.target.value }))}>
                    <option value="fixed">Fixed rupees</option>
                    <option value="percent">Percent of confirmed revenue</option>
                  </select>
                  <input type="number" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Pay" value={incentiveForm.rate} onChange={e => setIncentiveForm(f => ({ ...f, rate: e.target.value }))} />
                  <button type="button" onClick={addIncentive} className="rounded-lg bg-amber-600 text-white text-sm font-semibold">Add incentive</button>
                </div>
              </div>
            )}

            {/* Activity Timeline */}
            <div className="px-6 pb-6">
              <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-4">Activity Timeline</h3>
              {!detailData ? (
                <div className="text-center text-gray-400 py-6">Loading…</div>
              ) : detailData.activity.length === 0 ? (
                <div className="text-center text-gray-400 py-6 border border-dashed border-gray-200 rounded-xl">No activity logged yet. Log the first contact!</div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {detailData.activity.map(log => (
                    <div key={log.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                      <div className="flex-1 bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{log.type}</span>
                            {log.outcome && <span className="text-xs text-gray-500">{log.outcome}</span>}
                          </div>
                          <span className="text-xs text-gray-400">{formatDateTime(log.contacted_at)}</span>
                        </div>
                        {log.notes && <p className="text-sm text-gray-700 mt-1">{log.notes}</p>}
                        {log.user_name && <p className="text-xs text-gray-400 mt-1">by {log.user_name}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Log Modal */}
      {showLogModal && detailAgent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Log Activity</h2>
                <p className="text-sm text-gray-500">{detailAgent.name} — {detailAgent.agency_name}</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Activity Type *</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={logForm.type} onChange={e => setLogForm(f => ({ ...f, type: e.target.value }))}>
                  {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Outcome</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={logForm.outcome} onChange={e => setLogForm(f => ({ ...f, outcome: e.target.value }))}>
                  <option value="">— Select outcome —</option>
                  {ACTIVITY_OUTCOMES.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Contact date</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={logForm.contacted_at} onChange={e => setLogForm(f => ({ ...f, contacted_at: e.target.value }))} />
              </div>
              <FollowUpPicker label="When to follow up *" value={logForm.next_due_date} onChange={next_due_date => setLogForm(f => ({ ...f, next_due_date }))} />
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3} placeholder="What was discussed? Any follow-up actions?" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button onClick={() => setShowLogModal(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={submitLog} disabled={logSaving} className="px-6 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                {logSaving ? 'Saving…' : 'Log Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
