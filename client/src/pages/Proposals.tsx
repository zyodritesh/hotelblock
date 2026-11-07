import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, formatDate } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LineItem { description: string; qty: number; rate: number; amount: number; }
interface Proposal {
  id: string; lead_id: string | null; lead_title: string | null; segment: string | null;
  user_id: string; user_name: string; title: string; status: string;
  total_value: number; line_items: string; notes: string; created_at: string; updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600', Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700', Rejected: 'bg-red-100 text-red-700',
};

const EMPTY_ITEM: LineItem = { description: '', qty: 1, rate: 0, amount: 0 };

export default function Proposals() {
  const { isManager } = useAuthStore();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('Draft');
  const [leadId, setLeadId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get<Proposal[]>('/proposals').then(setProposals);
  useEffect(() => { load(); api.get<any[]>('/leads').then(setLeads); }, []);

  const total = items.reduce((s, i) => s + (i.qty * i.rate), 0);

  const openCreate = () => {
    setEditing(null); setTitle(''); setStatus('Draft'); setLeadId(''); setNotes(''); setItems([{ ...EMPTY_ITEM }]); setShowModal(true);
  };
  const openEdit = (p: Proposal) => {
    setEditing(p); setTitle(p.title); setStatus(p.status); setLeadId(p.lead_id || ''); setNotes(p.notes);
    try { setItems(JSON.parse(p.line_items) || [{ ...EMPTY_ITEM }]); } catch { setItems([{ ...EMPTY_ITEM }]); }
    setShowModal(true);
  };

  const updateItem = (i: number, field: keyof LineItem, val: string | number) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: val };
      updated.amount = updated.qty * updated.rate;
      return updated;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const body = { title, status, lead_id: leadId || null, notes, line_items: items, total_value: total };
      if (editing) await api.put(`/proposals/${editing.id}`, body);
      else await api.post('/proposals', body);
      setShowModal(false); load();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const exportPdf = (p: Proposal) => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text(p.title, 14, 22);
    doc.setFontSize(11); doc.text(`Status: ${p.status}`, 14, 32);
    doc.text(`Date: ${formatDate(p.created_at)}`, 14, 38);
    doc.text(`Prepared by: ${p.user_name}`, 14, 44);
    if (p.lead_title) doc.text(`Lead: ${p.lead_title}`, 14, 50);
    let lineItems: LineItem[] = [];
    try { lineItems = JSON.parse(p.line_items) || []; } catch {}
    autoTable(doc, {
      startY: 60,
      head: [['Description', 'Qty', 'Rate (₹)', 'Amount (₹)']],
      body: lineItems.map(i => [i.description, i.qty, i.rate.toLocaleString(), (i.qty * i.rate).toLocaleString()]),
      foot: [['', '', 'Total', formatCurrency(p.total_value)]],
    });
    if (p.notes) { const y = (doc as any).lastAutoTable.finalY + 10; doc.text(`Notes: ${p.notes}`, 14, y); }
    doc.save(`proposal-${p.title.replace(/\s+/g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">📄 Proposals & Quotes</h1>
        <button className="btn-primary" onClick={openCreate}>+ Create Proposal</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Title</th>
            <th className="pb-2 font-medium">Lead / Segment</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Total Value</th>
            <th className="pb-2 font-medium">By</th>
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {proposals.map(p => (
              <tr key={p.id} className="table-row">
                <td className="py-3 pr-4 font-medium">{p.title}</td>
                <td className="py-3 pr-4 text-gray-500 text-xs">{p.lead_title || '—'}{p.segment && <span className="ml-1 badge bg-gray-100 text-gray-600">{p.segment}</span>}</td>
                <td className="py-3 pr-4"><span className={`badge ${STATUS_COLORS[p.status] || 'bg-gray-100'}`}>{p.status}</span></td>
                <td className="py-3 pr-4 font-semibold text-green-600">{formatCurrency(p.total_value)}</td>
                <td className="py-3 pr-4 text-gray-400 text-xs">{p.user_name}</td>
                <td className="py-3 pr-4 text-gray-400 text-xs">{formatDate(p.created_at)}</td>
                <td className="py-3">
                  <div className="flex gap-1">
                    <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn-ghost text-xs px-2 py-1 text-blue-500" onClick={() => exportPdf(p)}>PDF</button>
                    <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(p.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {proposals.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-gray-400">No proposals yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Proposal' : 'Create Proposal'} size="xl">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="label">Proposal Title *</label><input className="input" value={title} onChange={e => setTitle(e.target.value)} required /></div>
            <div><label className="label">Linked Lead</label>
              <select className="select" value={leadId} onChange={e => setLeadId(e.target.value)}>
                <option value="">— None —</option>
                {leads.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>
            <div><label className="label">Status</label>
              <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
                {['Draft', 'Sent', 'Accepted', 'Rejected'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <label className="label">Line Items</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-20">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">Rate (₹)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">Amount</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr></thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1"><input className="input border-0 p-1 text-sm" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="e.g. Banquet Hall – Grand Ballroom" /></td>
                      <td className="px-2 py-1"><input type="number" className="input border-0 p-1 text-sm w-16" value={item.qty} min={1} onChange={e => updateItem(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                      <td className="px-2 py-1"><input type="number" className="input border-0 p-1 text-sm w-24" value={item.rate} onChange={e => updateItem(i, 'rate', parseFloat(e.target.value) || 0)} /></td>
                      <td className="px-2 py-1 text-green-600 font-medium">{formatCurrency(item.qty * item.rate)}</td>
                      <td className="px-2 py-1"><button type="button" className="text-red-400 hover:text-red-600 text-lg leading-none" onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr><td colSpan={3} className="px-3 py-2 text-sm font-semibold text-right text-gray-700">Total</td><td className="px-3 py-2 font-bold text-green-600">{formatCurrency(total)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
            <button type="button" className="btn-ghost text-sm mt-2" onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])}>+ Add Line Item</button>
          </div>

          <div><label className="label">Notes / Terms</label><textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await api.del(`/proposals/${deleteId}`); load(); }} title="Delete Proposal" message="Delete this proposal?" confirmLabel="Delete" danger />
    </div>
  );
}
