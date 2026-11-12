import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from './utils';

export interface ProposalPdfItem { section: string; description: string; qty: number; rate: number; }
export interface ProposalPdfProperty {
  name?: string | null; address?: string | null; city?: string | null;
  phone?: string | null; email?: string | null; website?: string | null;
  gst_number?: string | null; logo_path?: string | null; brand_color?: string | null;
}
export interface ProposalPdfInput {
  ref_number?: string | null; title: string; created_at?: string | null;
  validity_date?: string | null; client_name?: string | null; client_company?: string | null;
  client_phone?: string | null; client_email?: string | null; event_date?: string | null;
  event_type?: string | null; venue?: string | null; pax?: number | null;
  terms?: string | null; payment_terms?: string | null; cancellation_policy?: string | null;
  tax_percent?: number | null; discount?: number | null; notes?: string | null;
  line_items: string; photos?: string | null;
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = 278;

function rgb(hex: string): [number, number, number] {
  const h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#1e3a5f';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function pdfText(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/\u20B9/g, 'INR ')
    .replace(/[\u2012\u2013\u2014\u2015]/g, ' - ')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2022/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\xFF]/g, '');
}

function inr(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

function groupLineItems(lineItems: ProposalPdfItem[], sectionOrder: string[]) {
  const known = new Set(sectionOrder);
  const extras = [...new Set(lineItems.map(i => i.section))].filter(s => s && !known.has(s));
  return [...sectionOrder, ...extras]
    .map(section => ({ section, items: lineItems.filter(i => i.section === section) }))
    .filter(g => g.items.length > 0);
}

export async function buildProposalPdf(p: ProposalPdfInput, property: ProposalPdfProperty | null, sectionOrder: string[] = []) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setCharSpace(0);
  const [br, bg, bb] = rgb(property?.brand_color || '#1e3a5f');
  const hotel = pdfText(property?.name || 'Hotel');
  let y = 0;

  const rule = (yy: number, weight = 0.3) => {
    doc.setDrawColor(br, bg, bb);
    doc.setLineWidth(weight);
    doc.line(M, yy, PAGE_W - M, yy);
  };

  const continuation = () => {
    doc.setFillColor(br, bg, bb);
    doc.rect(0, 0, PAGE_W, 2.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(hotel, M, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(pdfText(p.ref_number || 'Proposal'), PAGE_W - M, 10, { align: 'right' });
    rule(13, 0.35);
    return 20;
  };

  const newPage = () => {
    doc.addPage();
    y = continuation();
  };

  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };

  // Brand bar and identity
  doc.setFillColor(br, bg, bb);
  doc.rect(0, 0, PAGE_W, 3.2, 'F');

  let textLeft = M;
  if (property?.logo_path) {
    try {
      const img = await fetchImageAsBase64(property.logo_path);
      if (img) {
        doc.addImage(img, 'JPEG', M, 8, 16, 16);
        textLeft = M + 20;
      }
    } catch { /* logo is optional */ }
  }

  doc.setTextColor(24, 24, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(hotel, textLeft, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 96);
  const place = pdfText([property?.address, property?.city].filter(Boolean).join(', '));
  const reach = pdfText([property?.phone ? `Tel ${property.phone}` : '', property?.email || ''].filter(Boolean).join('   |   '));
  const contactLines = [place, reach].filter(Boolean).flatMap(line => doc.splitTextToSize(line, 112) as string[]);
  doc.text(contactLines, textLeft, 19);
  let identityBottom = 19 + contactLines.length * 3.6;
  if (property?.website || property?.gst_number) {
    const extra = pdfText([property?.website, property?.gst_number ? `GSTIN ${property.gst_number}` : ''].filter(Boolean).join('   |   '));
    doc.text(extra, textLeft, identityBottom);
    identityBottom += 4;
  }

  // Document meta, right aligned, clear of the hotel block
  const meta: [string, string][] = [
    ['REF', pdfText(p.ref_number || '-')],
    ['DATE', p.created_at ? formatDate(p.created_at) : '-'],
  ];
  if (p.validity_date) meta.push(['VALID UNTIL', formatDate(p.validity_date)]);
  let my = 12;
  meta.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 126);
    doc.text(label, PAGE_W - M - 42, my);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 27);
    doc.text(value, PAGE_W - M, my, { align: 'right' });
    my += 5.2;
  });

  y = Math.max(identityBottom, my) + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(br, bg, bb);
  doc.text('PROPOSAL', M, y);
  y += 1.5;
  rule(y, 0.45);
  y += 7;

  doc.setTextColor(24, 24, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(pdfText(p.title || 'Proposal'), CONTENT_W) as string[];
  doc.text(titleLines, M, y);
  y += titleLines.length * 6 + 4;

  // Two equal cards
  const gap = 6;
  const cardW = (CONTENT_W - gap) / 2;
  const leftRows: [string, string][] = [
    ['Name', pdfText(p.client_name || '-')],
    ['Company', pdfText(p.client_company || '-')],
    ['Phone', pdfText(p.client_phone || '-')],
    ['Email', pdfText(p.client_email || '-')],
  ];
  const rightRows: [string, string][] = [
    ['Event date', p.event_date ? formatDate(p.event_date) : '-'],
    ['Event type', pdfText(p.event_type || '-')],
    ['Venue', pdfText(p.venue || '-')],
    ['Guests', p.pax ? String(p.pax) : '-'],
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const layoutRows = (rows: [string, string][]) => {
    const valueW = cardW - 10 - 24;
    return rows.map(([label, value]) => {
      const lines = doc.splitTextToSize(String(value), valueW) as string[];
      return { label, lines, h: Math.max(5.2, lines.length * 4) };
    });
  };
  const leftLaid = layoutRows(leftRows);
  const rightLaid = layoutRows(rightRows);
  const cardH = 8 + Math.max(
    leftLaid.reduce((s, r) => s + r.h, 0),
    rightLaid.reduce((s, r) => s + r.h, 0),
  ) + 3;

  ensure(cardH + 4);
  const drawCard = (x: number, heading: string, rows: ReturnType<typeof layoutRows>) => {
    doc.setFillColor(247, 248, 250);
    doc.roundedRect(x, y, cardW, cardH, 1.2, 1.2, 'F');
    doc.setFillColor(br, bg, bb);
    doc.rect(x, y, 1.3, cardH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(br, bg, bb);
    doc.text(heading, x + 5, y + 5.5);
    let ry = y + 11;
    rows.forEach(row => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 116);
      doc.text(row.label, x + 5, ry);
      doc.setTextColor(24, 24, 27);
      doc.text(row.lines, x + 5 + 24, ry);
      ry += row.h;
    });
  };
  drawCard(M, 'PREPARED FOR', leftLaid);
  drawCard(M + cardW + gap, 'EVENT DETAILS', rightLaid);
  y += cardH + 8;

  let lineItems: ProposalPdfItem[] = [];
  try { lineItems = JSON.parse(p.line_items) || []; } catch { /* empty quote */ }
  const groups = groupLineItems(lineItems, sectionOrder);

  for (const group of groups) {
    ensure(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(br, bg, bb);
    doc.text(pdfText(group.section).toUpperCase(), M, y);
    y += 1.6;
    rule(y, 0.25);
    y += 1.5;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 16, bottom: PAGE_H - BOTTOM },
      tableWidth: CONTENT_W,
      head: [[
        { content: 'Description', styles: { halign: 'left' } },
        { content: 'Qty', styles: { halign: 'center' } },
        { content: 'Rate (INR)', styles: { halign: 'right' } },
        { content: 'Amount (INR)', styles: { halign: 'right' } },
      ]],
      body: group.items.map(i => [
        pdfText(i.description || '-'),
        String(i.qty ?? 0),
        inr(Number(i.rate) || 0),
        inr((Number(i.qty) || 0) * (Number(i.rate) || 0)),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 9,
        textColor: [32, 32, 36],
        cellPadding: { top: 2.3, bottom: 2.3, left: 2, right: 2 },
        lineColor: [226, 228, 232],
        lineWidth: 0.15,
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [br, bg, bb],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 },
      },
      alternateRowStyles: { fillColor: [248, 249, 251] },
      columnStyles: {
        0: { cellWidth: 98 },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 33, halign: 'right' },
        3: { cellWidth: 33, halign: 'right' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 7;
  }

  const subtotal = lineItems.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const discountAmt = Number(p.discount) || 0;
  const taxable = Math.max(0, subtotal - discountAmt);
  const taxPct = p.tax_percent ?? 18;
  const taxAmt = (taxable * taxPct) / 100;
  const grandTotal = taxable + taxAmt;

  const totalRows: [string, string][] = [['Subtotal', inr(subtotal)]];
  if (discountAmt > 0) totalRows.push(['Discount', `-${inr(discountAmt)}`]);
  totalRows.push([`GST @ ${taxPct}%`, inr(taxAmt)]);
  const totalsH = 6 + totalRows.length * 6 + 12;
  ensure(totalsH);

  rule(y, 0.3);
  y += 6;
  const labelX = PAGE_W - M - 78;
  const valueX = PAGE_W - M;
  doc.setFontSize(9);
  totalRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 86);
    doc.text(label, labelX, y);
    doc.setTextColor(24, 24, 27);
    doc.text(value, valueX, y, { align: 'right' });
    y += 6;
  });
  y += 1;
  doc.setFillColor(br, bg, bb);
  doc.roundedRect(labelX - 3, y - 4.2, valueX - (labelX - 3), 9, 0.8, 0.8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', labelX, y + 1.6);
  doc.text(`INR ${inr(grandTotal)}`, valueX - 2, y + 1.6, { align: 'right' });
  y += 14;

  const termsText = pdfText((p.terms || '').trim())
    || [p.payment_terms && `Payment terms\n${p.payment_terms}`, p.cancellation_policy && `Cancellation\n${p.cancellation_policy}`].filter(Boolean).join('\n\n');
  if (termsText) {
    if (y > BOTTOM - 48) newPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(br, bg, bb);
    doc.text('TERMS & CONDITIONS', M, y);
    y += 1.6;
    rule(y, 0.35);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(45, 45, 50);
    const termLines = doc.splitTextToSize(termsText, CONTENT_W) as string[];
    for (const line of termLines) {
      ensure(5);
      const heading = /^\d+\.\s+\S/.test(line) && line.length < 48 && !/[.]$/.test(line.trim());
      doc.setFont('helvetica', heading ? 'bold' : 'normal');
      doc.setTextColor(heading ? 24 : 45, heading ? 24 : 45, heading ? 27 : 50);
      doc.text(line, M, y);
      y += line.trim() === '' ? 2.4 : 4.15;
    }
    y += 4;
  }

  if (p.notes) {
    const noteLines = doc.splitTextToSize(pdfText(p.notes), CONTENT_W - 8) as string[];
    const boxH = 8 + noteLines.length * 4;
    ensure(boxH + 2);
    doc.setFillColor(247, 248, 250);
    doc.roundedRect(M, y, CONTENT_W, boxH, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(br, bg, bb);
    doc.text('NOTES', M + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(45, 45, 50);
    doc.text(noteLines, M + 4, y + 10);
    y += boxH + 6;
  }

  let photos: string[] = [];
  try { photos = JSON.parse(p.photos || '[]'); } catch { /* none */ }
  if (photos.length > 0) {
    doc.addPage();
    y = continuation();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text('Venue & property', M, y);
    y += 6;
    let col = 0;
    const imgW = (CONTENT_W - 6) / 2;
    const imgH = 58;
    for (const photoUrl of photos.slice(0, 6)) {
      if (y + imgH > BOTTOM) { newPage(); col = 0; }
      try {
        const img = await fetchImageAsBase64(photoUrl);
        if (!img) continue;
        const x = M + (col % 2) * (imgW + 6);
        doc.addImage(img, 'JPEG', x, y, imgW, imgH);
        col++;
        if (col % 2 === 0) y += imgH + 6;
      } catch { /* skip a broken photo */ }
    }
  }

  // Pages that autoTable created do not get the continuation header. Paint a slim bar on every page, then the footer.
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFillColor(br, bg, bb);
      doc.rect(0, 0, PAGE_W, 2.4, 'F');
    }
    doc.setDrawColor(220, 220, 224);
    doc.setLineWidth(0.2);
    doc.line(M, 286, PAGE_W - M, 286);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 126);
    doc.text(`${hotel}  |  Confidential proposal`, M, 291);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - M, 291, { align: 'right' });
  }

  return doc;
}

export async function downloadProposalPdf(p: ProposalPdfInput, property: ProposalPdfProperty | null, sectionOrder: string[] = []) {
  const doc = await buildProposalPdf(p, property, sectionOrder);
  const slug = (p.title || 'proposal').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  doc.save(`${p.ref_number || 'proposal'}-${slug}.pdf`);
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
