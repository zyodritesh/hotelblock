import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate } from '../lib/utils';

interface Contact {
  id: string; account_id: string; account_name: string; name: string; title: string;
  phone: string; email: string; notes: string; created_at: string;
}

const EMPTY = { account_id: '', name: '', title: '', phone: '', email: '', notes: '' };

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get<Contact[]>(`/contacts${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(setContacts);
  };

  useEffect(() => { load(); }, [search]);
  useEffect(() => { api.get<any[]>('/accounts').then(setAccounts); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); };
  const openEdit = (c: Contact) => { setEditing(c); setForm({ account_id: c.account_id || '', name: c.name, title: c.title, phone: c.phone, email: c.email, notes: c.notes }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (editing) await api.put(`/contacts/${editing.id}`, form);
      else await api.post('/contacts', form);
      setShowModal(false); load();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">👥 Contacts</h1>
        <button className="btn-primary" onClick={openCreate}>+ Add Contact</button>
      </div>
      <div className="card">
        <input className="input max-w-sm" placeholder="Search by name, email, phone…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Title</th>
            <th className="pb-2 font-medium">Account</th>
            <th className="pb-2 font-medium">Phone</th>
            <th className="pb-2 font-medium">Email</th>
            <th className="pb-2 font-medium">Added</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} className="table-row">
                <td className="py-3 pr-4 font-medium">{c.name}</td>
                <td className="py-3 pr-4 text-gray-500">{c.title || '—'}</td>
                <td className="py-3 pr-4"><span className="text-blue-600">{c.account_name || '—'}</span></td>
                <td className="py-3 pr-4 text-gray-600">{c.phone || '—'}</td>
                <td className="py-3 pr-4 text-gray-600">{c.email || '—'}</td>
                <td className="py-3 pr-4 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                <td className="py-3">
                  <div className="flex gap-1">
                    <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(c)}>Edit</button>
                    <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(c.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-gray-400">No contacts found.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Contact' : 'Add Contact'}>
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">Full Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Title / Designation</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label className="label">Account</label>
            <select className="select" value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
              <option value="">— No Account —</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update' : 'Add Contact'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await api.del(`/contacts/${deleteId}`); load(); }} title="Delete Contact" message="Delete this contact?" confirmLabel="Delete" danger />
    </div>
  );
}
