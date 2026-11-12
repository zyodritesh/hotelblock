import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination from '../components/Pagination';
import { formatDate, ACCOUNT_TYPES, exportCSV } from '../lib/utils';

interface Account {
  id: string; name: string; type: string; phone: string; email: string; address: string; notes: string;
  contact_count: number; created_at: string;
}

const EMPTY = { name: '', type: 'Corporate', phone: '', email: '', address: '', notes: '' };

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<Account | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p = page, ps = pageSize) => {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (typeFilter) q.set('type', typeFilter);
    q.set('limit', String(ps));
    q.set('offset', String((p - 1) * ps));
    const res = await api.get<any>(`/accounts?${q}`);
    setAccounts(res.data ?? res);
    setTotal(res.total ?? 0);
  }, [search, typeFilter, page, pageSize]);

  useEffect(() => { setPage(1); }, [search, typeFilter, pageSize]);
  useEffect(() => { load(page, pageSize); }, [page, pageSize, search, typeFilter]);

  const handleExport = async () => {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (typeFilter) q.set('type', typeFilter);
    q.set('limit', '5000'); q.set('offset', '0');
    const res = await api.get<any>(`/accounts?${q}`);
    exportCSV('accounts', res.data ?? res, [
      { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' },
      { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'address', label: 'Address' }, { key: 'contact_count', label: 'Contacts' },
      { key: 'notes', label: 'Notes' }, { key: 'created_at', label: 'Added' },
    ]);
  };

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); };
  const openEdit = (a: Account) => { setEditing(a); setForm({ name: a.name, type: a.type, phone: a.phone, email: a.email, address: a.address, notes: a.notes }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (editing) await api.put(`/accounts/${editing.id}`, form);
      else await api.post('/accounts', form);
      setShowModal(false); load(page, pageSize);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const TYPE_COLORS: Record<string, string> = {
    Corporate: 'bg-blue-100 text-blue-700', 'Travel Agency': 'bg-purple-100 text-purple-700',
    'Wedding Planner': 'bg-pink-100 text-pink-700', 'Event Company': 'bg-green-100 text-green-700',
    Government: 'bg-gray-100 text-gray-700', NGO: 'bg-teal-100 text-teal-700',
    Individual: 'bg-yellow-100 text-yellow-700', Other: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">🏢 Accounts</h1>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm px-3 py-2" onClick={handleExport}>⬇ Export</button>
          <button className="btn-primary" onClick={openCreate}>+ Add Account</button>
        </div>
      </div>
      <div className="card flex flex-wrap gap-2">
        <input className="input max-w-sm" placeholder="Search name, type, address…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select w-44" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <span className="text-sm text-gray-400 self-center">{total} accounts</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map(a => (
          <div key={a.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-900">{a.name}</p>
                <span className={`badge text-xs mt-1 ${TYPE_COLORS[a.type] || 'bg-gray-100 text-gray-600'}`}>{a.type}</span>
              </div>
              <div className="flex gap-1">
                <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(a)}>Edit</button>
                <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(a.id)}>Del</button>
              </div>
            </div>
            <div className="space-y-1 text-sm text-gray-500 mt-3">
              {a.phone && <p>📞 {a.phone}</p>}
              {a.email && <p>✉ {a.email}</p>}
              {a.address && <p>📍 {a.address}</p>}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
              <span>{a.contact_count} contact{a.contact_count !== 1 ? 's' : ''}</span>
              <span>{formatDate(a.created_at)}</span>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            <p className="text-4xl mb-3">🏢</p>
            <p>No accounts found. Add your first account.</p>
          </div>
        )}
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={ps => { setPageSize(ps); setPage(1); }} pageSizes={[12, 24, 48]} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Account' : 'Add Account'}>
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Type</label>
            <select className="select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">Address</label><textarea className="input" rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update' : 'Add Account'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await api.del(`/accounts/${deleteId}`); load(page, pageSize); }} title="Delete Account" message="Delete this account?" confirmLabel="Delete" danger />
    </div>
  );
}
