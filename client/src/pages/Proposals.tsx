import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency, formatDate } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types ───────────────────────────────────────────────────────────────────

const SECTIONS = ['Accommodation', 'Food & Beverage', 'Event Services', 'AV & Decor', 'Transfers & Logistics', 'Other'] as const;
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

async function generatePDF(p: Proposal, property: Property | null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, MARGIN = 14;
  const brand = property?.brand_color || '#2563eb';

  // Convert hex to RGB
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b] as [number, number, number];
  };
  const [br, bg, bb] = hexToRgb(brand);

  let y = 0;

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(br, bg, bb);
  doc.rect(0, 0, W, 42, 'F');

  // Logo
  if (property?.logo_path) {
    try {
      const imgData = await fetchImageAsBase64(property.logo_path);
      if (imgData) doc.addImage(imgData, 'JPEG', MARGIN, 8, 24, 24);
    } catch {}
  }

  // Hotel name & address
  doc.setTextColor(255, 255, 255);
  const logoOffset = property?.logo_path ? 42 : MARGIN;
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(property?.name || 'Hotel', logoOffset, 16);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  if (property?.address) doc.text(`${property.address}${property.city ? ', ' + property.city : ''}`, logoOffset, 22);
  if (property?.phone) doc.text(`Tel: ${property.phone}`, logoOffset, 27);
  if (property?.email) doc.text(property.email, logoOffset, 32);
  if (property?.website) doc.text(property.website, logoOffset, 37);

  // PROPOSAL label (right side)
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text('PROPOSAL', W - MARGIN, 16, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${p.ref_number || '—'}`, W - MARGIN, 23, { align: 'right' });
  doc.text(`Date: ${formatDate(p.created_at)}`, W - MARGIN, 29, { align: 'right' });
  if (p.validity_date) doc.text(`Valid until: ${formatDate(p.validity_date)}`, W - MARGIN, 35, { align: 'right' });
  if (property?.gst_number) doc.text(`GST: ${property.gst_number}`, W - MARGIN, 41, { align: 'right' });

  y = 50;

  // ── Proposal title ────────────────────────────────────────────────────────
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(p.title, MARGIN, y); y += 8;

  // ── Two-column info block ─────────────────────────────────────────────────
  const col2 = 110;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.setTextColor(br, bg, bb);
  doc.text('PREPARED FOR', MARGIN, y);
  doc.text('EVENT DETAILS', col2, y);
  y += 1;
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, 100, y);
  doc.line(col2, y, W - MARGIN, y);
  y += 5;

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const leftLines: [string, string][] = [
    ['Name', p.client_name || '—'],
    ['Company', p.client_company || '—'],
    ['Phone', p.client_phone || '—'],
    ['Email', p.client_email || '—'],
  ];
  const rightLines: [string, string][] = [
    ['Event Date', p.event_date ? formatDate(p.event_date) : '—'],
    ['Event Type', p.event_type || '—'],
    ['Venue', p.venue || '—'],
    ['No. of Guests', p.pax ? String(p.pax) : '—'],
  ];
  leftLines.forEach(([label, value], i) => {
    doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, MARGIN, y + i * 6);
    doc.setFont('helvetica', 'normal'); doc.text(value, MARGIN + 22, y + i * 6);
  });
  rightLines.forEach(([label, value], i) => {
    doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, col2, y + i * 6);
    doc.setFont('helvetica', 'normal'); doc.text(value, col2 + 26, y + i * 6);
  });
  y += leftLines.length * 6 + 8;

  // ── Line items grouped by section ────────────────────────────────────────
  let lineItems: LineItem[] = [];
  try { lineItems = JSON.parse(p.line_items) || []; } catch {}

  const sectionGroups = SECTIONS.map(s => ({
    section: s,
    items: lineItems.filter(i => i.section === s),
  })).filter(g => g.items.length > 0);

  for (const group of sectionGroups) {
    // Section header
    doc.setFillColor(br, bg, bb);
    doc.rect(MARGIN, y, W - MARGIN * 2, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(group.section.toUpperCase(), MARGIN + 3, y + 4.2);
    y += 6;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Description', 'Qty', 'Rate (₹)', 'Amount (₹)']],
      body: group.items.map(i => [
        i.description,
        String(i.qty),
        i.rate.toLocaleString('en-IN'),
        (i.qty * i.rate).toLocaleString('en-IN'),
      ]),
      headStyles: { fillColor: [240, 240, 240], textColor: [60, 60, 60], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
      columnStyles: { 1: { halign: 'center', cellWidth: 15 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 } },
      tableLineColor: [220, 220, 220],
      tableLineWidth: 0.1,
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── Totals block ─────────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, i) => s + i.qty * i.rate, 0);
  const discountAmt = p.discount || 0;
  const taxAmt = ((subtotal - discountAmt) * (p.tax_percent || 18)) / 100;
  const grandTotal = subtotal - discountAmt + taxAmt;

  y += 2;
  const totalsX = W - MARGIN - 80;
  const totalsLabelX = totalsX;
  const totalsValX = W - MARGIN;

  const totalsRows: [string, string][] = [
    ['Subtotal', `₹${subtotal.toLocaleString('en-IN')}`],
  ];
  if (discountAmt > 0) totalsRows.push(['Discount', `-₹${discountAmt.toLocaleString('en-IN')}`]);
  totalsRows.push([`GST @ ${p.tax_percent || 18}%`, `₹${taxAmt.toLocaleString('en-IN')}`]);

  doc.setFontSize(9);
  totalsRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
    doc.text(label, totalsLabelX, y, { align: 'left' });
    doc.text(value, totalsValX, y, { align: 'right' });
    y += 6;
  });

  // Grand total highlighted
  doc.setFillColor(br, bg, bb);
  doc.rect(totalsX - 3, y - 4, W - MARGIN - totalsX + 3, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', totalsLabelX, y + 0.5);
  doc.text(`₹${grandTotal.toLocaleString('en-IN')}`, totalsValX, y + 0.5, { align: 'right' });
  y += 14;

  // ── Terms ─────────────────────────────────────────────────────────────────
  if (p.payment_terms || p.cancellation_policy) {
    doc.setTextColor(br, bg, bb);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('TERMS & CONDITIONS', MARGIN, y); y += 2;
    doc.setDrawColor(br, bg, bb); doc.setLineWidth(0.4);
    doc.line(MARGIN, y, W - MARGIN, y); y += 5;

    if (p.payment_terms) {
      doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text('Payment Terms:', MARGIN, y); y += 4;
      doc.setFont('helvetica', 'normal');
      const ptLines = doc.splitTextToSize(p.payment_terms, W - MARGIN * 2);
      doc.text(ptLines, MARGIN, y); y += ptLines.length * 4 + 3;
    }

    if (p.cancellation_policy) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
      doc.text('Cancellation Policy:', MARGIN, y); y += 4;
      doc.setFont('helvetica', 'normal');
      const cpLines = doc.splitTextToSize(p.cancellation_policy, W - MARGIN * 2);
      doc.text(cpLines, MARGIN, y); y += cpLines.length * 4 + 3;
    }
  }

  if (p.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
    doc.text('Notes:', MARGIN, y); y += 4;
    doc.setFont('helvetica', 'normal');
    const nLines = doc.splitTextToSize(p.notes, W - MARGIN * 2);
    doc.text(nLines, MARGIN, y); y += nLines.length * 4 + 4;
  }

  // ── Photos page ───────────────────────────────────────────────────────────
  let photos: string[] = [];
  try { photos = JSON.parse(p.photos || '[]'); } catch {}

  if (photos.length > 0) {
    doc.addPage();
    doc.setFillColor(br, bg, bb);
    doc.rect(0, 0, W, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('VENUE & PROPERTY PHOTOS', MARGIN, 11);

    let px = MARGIN, py = 24;
    const imgW = 85, imgH = 60;
    let col = 0;
    for (const photoUrl of photos.slice(0, 6)) {
      try {
        const imgData = await fetchImageAsBase64(photoUrl);
        if (imgData) {
          doc.addImage(imgData, 'JPEG', px, py, imgW, imgH);
          col++;
          if (col % 2 === 0) { px = MARGIN; py += imgH + 8; }
          else { px += imgW + 8; }
        }
      } catch {}
    }
  }

  // ── Footer on all pages ───────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 287, W, 10, 'F');
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(`${property?.name || 'Hotel'} — Confidential Proposal`, MARGIN, 293);
    doc.text(`Page ${i} of ${pageCount}`, W - MARGIN, 293, { align: 'right' });
  }

  doc.save(`${p.ref_number || 'proposal'}-${p.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`);
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    const res = await fetch(fullUrl);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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

  // Form state
  const [form, setForm] = useState({
    title: '', status: 'Draft', lead_id: '', property_id: activePropertyId || '',
    client_name: '', client_company: '', client_phone: '', client_email: '',
    event_date: '', event_type: 'Conference', venue: '', pax: 0,
    validity_date: '', payment_terms: DEFAULT_PAYMENT, cancellation_policy: DEFAULT_CANCELLATION,
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
      tax_percent: 18, discount: 0, notes: '' });
    setItems([{ ...EMPTY_ITEM }]);
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
      tax_percent: p.tax_percent || 18, discount: p.discount || 0, notes: p.notes || '',
    });
    try { setItems(JSON.parse(p.line_items) || [{ ...EMPTY_ITEM }]); } catch { setItems([{ ...EMPTY_ITEM }]); }
    setShowModal(true);
  };

  const updateItem = (i: number, field: keyof LineItem, val: string | number) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
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
    await generatePDF(p, fullProp);
  };

  // Group items by section for display in view modal
  const getGroupedItems = (lineItemsJson: string) => {
    let items: LineItem[] = [];
    try { items = JSON.parse(lineItemsJson) || []; } catch {}
    return SECTIONS.map(s => ({ section: s, items: items.filter(i => i.section === s) })).filter(g => g.items.length > 0);
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
                          {SECTIONS.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1"><input className="input border-0 p-1 text-sm" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="e.g. Grand Ballroom — Full Day" /></td>
                      <td className="px-2 py-1"><input type="number" className="input border-0 p-1 text-sm w-14" value={item.qty} min={1} onChange={e => updateItem(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                      <td className="px-2 py-1"><input type="number" className="input border-0 p-1 text-sm w-24" value={item.rate} onChange={e => updateItem(i, 'rate', parseFloat(e.target.value) || 0)} /></td>
                      <td className="px-2 py-1 text-green-600 font-medium">{formatCurrency(item.qty * item.rate)}</td>
                      <td className="px-2 py-1"><button type="button" className="text-red-400 hover:text-red-600 text-xl leading-none" onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn-ghost text-sm mt-2" onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])}>+ Add Line Item</button>

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
              <div><label className="label">Payment Terms</label><textarea className="input" rows={3} value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} /></div>
              <div><label className="label">Cancellation Policy</label><textarea className="input" rows={4} value={form.cancellation_policy} onChange={e => setForm(f => ({ ...f, cancellation_policy: e.target.value }))} /></div>
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
