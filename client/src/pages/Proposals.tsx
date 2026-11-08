import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, formatDate } from '../lib/utils';
import { downloadProposalPdf } from '../lib/proposalPdf';
import { useAuthStore } from '../store/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

const EVENT_TYPES = ['Conference', 'Wedding', 'Social Event', 'Corporate Dinner', 'Product Launch', 'Training', 'Exhibition', 'Other'] as const;
const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600', Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700', Rejected: 'bg-red-100 text-red-700',
};

interface LineItem { section: string; description: string; qty: number; rate: number; }
interface Proposal {
  id: string; ref_number: string; lead_id: string | null; lead_title: string | null; segment: string | null;
  user_id: string; user_name: string; property_id: string | null; property_name: string | null;
  title: string; status: string;
  client_name: string; client_company: string; client_phone: string; client_email: string;
  event_date: string | null; event_type: string; venue: string; pax: number;
  validity_date: string | null; payment_terms: string; cancellation_policy: string;
  terms: string;
  tax_percent: number; discount: number; total_value: number;
  line_items: string; photos: string; notes: string;
  created_at: string; updated_at: string;
}
interface Property {
  id: string; name: string; address: string; city: string; phone: string; email: string;
  website: string; gst_number: string; logo_path: string | null; brand_color: string;
}

const EMPTY_ITEM: LineItem = { section: 'Accommodation', description: '', qty: 1, rate: 0 };

const DEFAULT_PAYMENT = '50% advance at the time of booking.\n50% balance to be settled on or before the event date.';
const DEFAULT_CANCELLATION = '• Cancellation 30+ days prior: Full refund less booking fee.\n• Cancellation 15–29 days prior: 50% refund.\n• Cancellation less than 15 days: No refund.';

// ─── PDF Generator ────────────────────────────────────────────────────────────

function groupLineItems(lineItems: LineItem[], sectionOrder: string[]) {
  const known = new Set(sectionOrder);
  const extras = [...new Set(lineItems.map(i => i.section))].filter(s => s && !known.has(s));
  return [...sectionOrder, ...extras]
    .map(section => ({ section, items: lineItems.filter(i => i.section === section) }))
    .filter(g => g.items.length > 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Proposals() {
  const { isManager, activePropertyId } = useAuthStore();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewProposal, setViewProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [itemTemplates, setItemTemplates] = useState<{ id: string; section_name: string; description: string; default_rate: number }[]>([]);
  const [termTemplates, setTermTemplates] = useState<{ id: string; name: string; body: string; is_default: number }[]>([]);
  const sectionNames = sections.map(s => s.name);
  const defaultTerms = termTemplates.find(t => t.is_default)?.body || termTemplates[0]?.body || '';

  // Form state
  const [form, setForm] = useState({
    title: '', status: 'Draft', lead_id: '', property_id: activePropertyId || '',
    client_name: '', client_company: '', client_phone: '', client_email: '',
    event_date: '', event_type: 'Conference', venue: '', pax: 0,
    validity_date: '', payment_terms: DEFAULT_PAYMENT, cancellation_policy: DEFAULT_CANCELLATION,
    terms: '',
    tax_percent: 18, discount: 0, notes: '',
  });
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

  const load = () => {
    const p = activePropertyId ? `?property_id=${activePropertyId}` : '';
    api.get<Proposal[]>(`/proposals${p}`).then(setProposals);
  };

  useEffect(() => {
    load();
    api.get<any>('/leads?limit=500').then(r => setLeads(r.data ?? r));
    api.get<Property[]>('/properties').then(setProperties);
    api.get<any>('/catalog').then(data => {
      setSections(data.sections || []);
      setItemTemplates(data.items || []);
      setTermTemplates(data.terms || []);
    }).catch(() => {});
  }, [activePropertyId]);

  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const discountAmt = form.discount || 0;
  const taxAmt = ((subtotal - discountAmt) * form.tax_percent) / 100;
  const grandTotal = subtotal - discountAmt + taxAmt;

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', status: 'Draft', lead_id: '', property_id: activePropertyId || '',
      client_name: '', client_company: '', client_phone: '', client_email: '',
      event_date: '', event_type: 'Conference', venue: '', pax: 0,
      validity_date: '', payment_terms: DEFAULT_PAYMENT, cancellation_policy: DEFAULT_CANCELLATION,
      terms: defaultTerms,
      tax_percent: 18, discount: 0, notes: '' });
    setItems([{ ...EMPTY_ITEM, section: sectionNames[0] || 'Accommodation' }]);
    setShowModal(true);
  };

  const openEdit = (p: Proposal) => {
    setEditing(p);
    setForm({
      title: p.title, status: p.status, lead_id: p.lead_id || '', property_id: p.property_id || '',
      client_name: p.client_name || '', client_company: p.client_company || '',
      client_phone: p.client_phone || '', client_email: p.client_email || '',
      event_date: p.event_date || '', event_type: p.event_type || 'Conference',
      venue: p.venue || '', pax: p.pax || 0,
      validity_date: p.validity_date || '',
      payment_terms: p.payment_terms || DEFAULT_PAYMENT,
      cancellation_policy: p.cancellation_policy || DEFAULT_CANCELLATION,
      terms: p.terms || defaultTerms,
      tax_percent: p.tax_percent || 18, discount: p.discount || 0, notes: p.notes || '',
    });
    try { setItems(JSON.parse(p.line_items) || [{ ...EMPTY_ITEM }]); } catch { setItems([{ ...EMPTY_ITEM }]); }
    setShowModal(true);
  };

  const updateItem = (i: number, field: keyof LineItem, val: string | number) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  };

  const applyDescription = (i: number, templateId: string) => {
    const tpl = itemTemplates.find(t => t.id === templateId);
    if (!tpl) return;
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, description: tpl.description, rate: tpl.default_rate } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const body = { ...form, line_items: items, total_value: grandTotal };
      if (editing) await api.put(`/proposals/${editing.id}`, body);
      else await api.post('/proposals', body);
      setShowModal(false); load();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!viewProposal || !e.target.files?.length) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      Array.from(e.target.files).forEach(f => fd.append('photos', f));
      const result = await api.postForm<{ photos: string[] }>(`/proposals/${viewProposal.id}/photos`, fd);
      setViewProposal(prev => prev ? { ...prev, photos: JSON.stringify(result.photos) } : null);
      load();
    } catch (err: any) { setError(err.message); } finally { setPhotoUploading(false); }
  };

  const removePhoto = async (photoPath: string) => {
    if (!viewProposal) return;
    const result = await api.put<{ photos: string[] }>(`/proposals/${viewProposal.id}/photos`, { photo_path: photoPath });
    setViewProposal(prev => prev ? { ...prev, photos: JSON.stringify(result.photos) } : null);
    load();
  };

  const handleExportPdf = async (p: Proposal) => {
    const fullProp = properties.find(pr => pr.id === p.property_id) || null;
    await downloadProposalPdf(p, fullProp, sectionNames);
  };

  // Group items by section for display in view modal
  const getGroupedItems = (lineItemsJson: string) => {
    let parsed: LineItem[] = [];
    try { parsed = JSON.parse(lineItemsJson) || []; } catch {}
    return groupLineItems(parsed, sectionNames);
  };

  const getPhotos = (photosJson: string): string[] => {
    try { return JSON.parse(photosJson) || []; } catch { return []; }
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
            <th className="pb-2 font-medium">Ref / Title</th>
            <th className="pb-2 font-medium">Client</th>
            <th className="pb-2 font-medium">Property</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Total (incl. GST)</th>
            <th className="pb-2 font-medium">Event Date</th>
            <th className="pb-2 font-medium">By</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {proposals.map(p => (
              <tr key={p.id} className="table-row cursor-pointer hover:bg-blue-50/30" onClick={() => setViewProposal(p)}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-blue-600">{p.ref_number || '—'}</p>
                  <p className="text-xs text-gray-500 truncate max-w-[160px]">{p.title}</p>
                </td>
                <td className="py-3 pr-4">
                  <p className="font-medium">{p.client_name || '—'}</p>
                  <p className="text-xs text-gray-400">{p.client_company}</p>
                </td>
                <td className="py-3 pr-4 text-gray-500 text-xs">{p.property_name || '—'}</td>
                <td className="py-3 pr-4"><span className={`badge ${STATUS_COLORS[p.status] || 'bg-gray-100'}`}>{p.status}</span></td>
                <td className="py-3 pr-4 font-semibold text-green-600">{formatCurrency(p.total_value)}</td>
                <td className="py-3 pr-4 text-gray-500 text-xs">{formatDate(p.event_date)}</td>
                <td className="py-3 pr-4 text-gray-400 text-xs">{p.user_name}</td>
                <td className="py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn-ghost text-xs px-2 py-1 text-blue-500" onClick={() => handleExportPdf(p)}>PDF</button>
                    <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(p.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {proposals.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-gray-400">No proposals yet. Click "+ Create Proposal" to get started.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? `Edit — ${editing.ref_number}` : 'New Proposal'} size="xl">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Basic */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><label className="label">Proposal Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required /></div>
              <div><label className="label">Property</label>
                <select className="select" value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="label">Linked Lead</label>
                <select className="select" value={form.lead_id} onChange={e => setForm(f => ({ ...f, lead_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {leads.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
              <div><label className="label">Status</label>
                <select className="select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {['Draft', 'Sent', 'Accepted', 'Rejected'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Valid Until</label><input type="date" className="input" value={form.validity_date} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} /></div>
            </div>
          </section>

          {/* Client */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Client Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="label">Client Name</label><input className="input" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
              <div><label className="label">Company</label><input className="input" value={form.client_company} onChange={e => setForm(f => ({ ...f, client_company: e.target.value }))} /></div>
              <div><label className="label">Phone</label><input className="input" value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} /></div>
              <div><label className="label">Email</label><input type="email" className="input" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} /></div>
            </div>
          </section>

          {/* Event */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Event Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="label">Event Date</label><input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
              <div><label className="label">Event Type</label>
                <select className="select" value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
                  {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">Venue / Hall</label><input className="input" value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} placeholder="e.g. Grand Ballroom" /></div>
              <div><label className="label">No. of Guests (Pax)</label><input type="number" className="input" value={form.pax} onChange={e => setForm(f => ({ ...f, pax: parseInt(e.target.value) || 0 }))} /></div>
            </div>
          </section>

          {/* Line Items */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Line Items</h4>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-36">Section</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">Rate (₹)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">Amount</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr></thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1">
                        <select className="select text-xs py-1 px-2" value={item.section} onChange={e => updateItem(i, 'section', e.target.value)}>
                          {(sectionNames.length ? sectionNames : ['Accommodation']).map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select className="select text-xs py-1 px-2 mb-1" value="" onChange={e => { applyDescription(i, e.target.value); e.target.value = ''; }}>
                          <option value="">Description from template…</option>
                          {itemTemplates.filter(t => t.section_name === item.section).map(t => (
                            <option key={t.id} value={t.id}>{t.description} — ₹{t.default_rate.toLocaleString('en-IN')}</option>
                          ))}
                        </select>
                        <input className="input border-0 p-1 text-sm" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Or type a custom description" />
                      </td>
                      <td className="px-2 py-1"><input type="number" className="input border-0 p-1 text-sm w-14" value={item.qty} min={1} onChange={e => updateItem(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                      <td className="px-2 py-1"><input type="number" className="input border-0 p-1 text-sm w-24" value={item.rate} onChange={e => updateItem(i, 'rate', parseFloat(e.target.value) || 0)} /></td>
                      <td className="px-2 py-1 text-green-600 font-medium">{formatCurrency(item.qty * item.rate)}</td>
                      <td className="px-2 py-1"><button type="button" className="text-red-400 hover:text-red-600 text-xl leading-none" onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn-ghost text-sm mt-2" onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM, section: sectionNames[0] || 'Accommodation' }])}>+ Add Line Item</button>

            {/* Totals summary */}
            <div className="mt-4 flex justify-end">
              <div className="w-72 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="flex-1">Discount (₹)</span>
                  <input type="number" className="input w-28 py-1 text-right" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="flex-1">GST (%)</span>
                  <input type="number" className="input w-28 py-1 text-right" value={form.tax_percent} onChange={e => setForm(f => ({ ...f, tax_percent: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="flex justify-between text-gray-600"><span>Tax Amount</span><span>{formatCurrency(taxAmt)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Grand Total</span><span className="text-green-600">{formatCurrency(grandTotal)}</span></div>
              </div>
            </div>
          </section>

          {/* Terms */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Terms & Conditions</h4>
            <div className="space-y-4">
              <div>
                <label className="label">Load a template</label>
                <select className="select" value="" onChange={e => {
                  const tpl = termTemplates.find(t => t.id === e.target.value);
                  if (tpl) setForm(f => ({ ...f, terms: tpl.body }));
                }}>
                  <option value="">Choose a template to fill the text below…</option>
                  {termTemplates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">The text below belongs to this proposal only. Change the master wording in Settings.</p>
              </div>
              <div><label className="label">Terms for this proposal</label><textarea className="input" rows={10} value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} /></div>
              <div><label className="label">Additional Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update Proposal' : 'Create Proposal'}</button>
          </div>
        </form>
      </Modal>

      {/* ── View / Photos Modal ── */}
      <Modal open={!!viewProposal} onClose={() => setViewProposal(null)} title={`${viewProposal?.ref_number || ''} — ${viewProposal?.title || ''}`} size="xl">
        {viewProposal && (
          <div className="space-y-6">
            {/* Status + actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`badge text-sm px-3 py-1 ${STATUS_COLORS[viewProposal.status]}`}>{viewProposal.status}</span>
              <span className="text-sm text-gray-500">Created {formatDate(viewProposal.created_at)} by {viewProposal.user_name}</span>
              <div className="ml-auto flex gap-2">
                <button className="btn-secondary text-sm" onClick={() => { setViewProposal(null); openEdit(viewProposal); }}>Edit</button>
                <button className="btn-primary text-sm" onClick={() => handleExportPdf(viewProposal)}>⬇ Download PDF</button>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                ['Client', viewProposal.client_name || '—'],
                ['Company', viewProposal.client_company || '—'],
                ['Phone', viewProposal.client_phone || '—'],
                ['Email', viewProposal.client_email || '—'],
                ['Event Date', formatDate(viewProposal.event_date)],
                ['Event Type', viewProposal.event_type || '—'],
                ['Venue', viewProposal.venue || '—'],
                ['Pax', viewProposal.pax ? String(viewProposal.pax) : '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
            </div>

            {/* Line items by section */}
            {getGroupedItems(viewProposal.line_items).map(group => (
              <div key={group.section}>
                <h4 className="text-xs font-bold text-white bg-blue-600 px-3 py-1 rounded-t-lg">{group.section}</h4>
                <table className="w-full text-sm border border-gray-100 rounded-b-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-500">Description</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-500 w-12">Qty</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 w-28">Rate</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 w-28">Amount</th>
                  </tr></thead>
                  <tbody>
                    {group.items.map((item, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-center">{item.qty}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.rate)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.qty * item.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                {(() => {
                  let items: LineItem[] = [];
                  try { items = JSON.parse(viewProposal.line_items) || []; } catch {}
                  const sub = items.reduce((s, i) => s + i.qty * i.rate, 0);
                  const disc = viewProposal.discount || 0;
                  const tax = ((sub - disc) * (viewProposal.tax_percent || 18)) / 100;
                  const total = sub - disc + tax;
                  return <>
                    <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(sub)}</span></div>
                    {disc > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-{formatCurrency(disc)}</span></div>}
                    <div className="flex justify-between text-gray-500"><span>GST {viewProposal.tax_percent}%</span><span>{formatCurrency(tax)}</span></div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span className="text-green-600">{formatCurrency(total)}</span></div>
                  </>;
                })()}
              </div>
            </div>

            {(viewProposal.terms || viewProposal.payment_terms || viewProposal.cancellation_policy) && (
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">Terms & Conditions</h4>
                <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 font-sans">{viewProposal.terms || `${viewProposal.payment_terms || ''}\n\n${viewProposal.cancellation_policy || ''}`}</pre>
              </div>
            )}

            {/* Photos section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-800">Venue & Property Photos</h4>
                <button className="btn-secondary text-sm" onClick={() => photoRef.current?.click()} disabled={photoUploading}>
                  {photoUploading ? 'Uploading…' : '+ Add Photos'}
                </button>
                <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {getPhotos(viewProposal.photos).map((photo, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden aspect-video bg-gray-100">
                    <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center"
                      onClick={() => removePhoto(photo)}
                    >×</button>
                  </div>
                ))}
                {getPhotos(viewProposal.photos).length === 0 && (
                  <div className="col-span-4 py-8 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer" onClick={() => photoRef.current?.click()}>
                    <p className="text-3xl mb-2">🖼️</p>
                    <p className="text-sm">Click to add venue photos — they'll appear in the PDF</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await api.del(`/proposals/${deleteId}`); load(); }} title="Delete Proposal" message="Delete this proposal permanently?" confirmLabel="Delete" danger />
    </div>
  );
}
