import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination from '../components/Pagination';
import FollowUpPicker from '../components/FollowUpPicker';
import { formatDateTime, formatDate, SEGMENTS, MEETING_PURPOSES, SEGMENT_COLORS, cn, exportCSV } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Meeting {
  id: string; contact_name: string; company: string; user_id: string; user_name: string;
  segment: string; purpose: string; outcome: string; notes: string; photo_path: string | null;
  lat: number | null; lng: number | null; address_label: string; meeting_date: string; follow_up_date: string | null; created_at: string;
}

const EMPTY_FORM = { contact_name: '', company: '', segment: 'Corporate', purpose: 'Sales Visit', outcome: '', notes: '', address_label: '', meeting_date: new Date().toISOString().slice(0, 16), follow_up_date: '' };

export default function Meetings() {
  const { isManager } = useAuthStore();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ segment: '', user_id: '', from: '', to: '' });
  const [users, setUsers] = useState<any[]>([]);
  const [viewMeeting, setViewMeeting] = useState<Meeting | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMeetings = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.segment) q.append('segment', filters.segment);
      if (filters.user_id) q.append('user_id', filters.user_id);
      if (filters.from) q.append('from', filters.from);
      if (filters.to) q.append('to', filters.to);
      if (search) q.append('search', search);
      q.append('limit', String(ps)); q.append('offset', String((p - 1) * ps));
      const res = await api.get<any>(`/meetings?${q}`);
      setMeetings(res.data ?? res);
      setTotal(res.total ?? res.length ?? 0);
    } finally { setLoading(false); }
  }, [filters, search, page, pageSize]);

  useEffect(() => { setPage(1); }, [filters, search, pageSize]);
  useEffect(() => { loadMeetings(page, pageSize); }, [page, pageSize, filters, search]);
  useEffect(() => { if (isManager()) api.get<any[]>('/users').then(setUsers); }, []);

  const openCreate = () => {
    setEditing(null); setForm({ ...EMPTY_FORM }); setPhotoFile(null); setPhotoPreview(null); setGps(null); setShowModal(true);
  };

  const captureGPS = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsLoading(false); },
      () => { setError('Could not get GPS location.'); setGpsLoading(false); },
      { timeout: 15000 }
    );
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (gps) { fd.append('lat', String(gps.lat)); fd.append('lng', String(gps.lng)); }
      if (photoFile) fd.append('photo', photoFile);
      if (editing) await api.putForm(`/meetings/${editing.id}`, fd);
      else await api.postForm('/meetings', fd);
      setShowModal(false); loadMeetings(page, pageSize);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => { await api.del(`/meetings/${id}`); loadMeetings(page, pageSize); };

  const handleExport = async () => {
    const q = new URLSearchParams();
    if (filters.segment) q.append('segment', filters.segment);
    if (filters.user_id) q.append('user_id', filters.user_id);
    if (filters.from) q.append('from', filters.from);
    if (filters.to) q.append('to', filters.to);
    if (search) q.append('search', search);
    q.append('limit', '5000'); q.append('offset', '0');
    const res = await api.get<any>(`/meetings?${q}`);
    exportCSV('meetings', res.data ?? res, [
      { key: 'meeting_date', label: 'Date' }, { key: 'contact_name', label: 'Contact' },
      { key: 'company', label: 'Company' }, { key: 'segment', label: 'Segment' },
      { key: 'purpose', label: 'Purpose' }, { key: 'outcome', label: 'Outcome' },
      { key: 'address_label', label: 'Address' }, { key: 'follow_up_date', label: 'Follow-up' }, { key: 'notes', label: 'Notes' },
      { key: 'user_name', label: 'By' },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">🤝 Meetings</h1>
          <p className="text-xs text-gray-400 mt-0.5">{total.toLocaleString()} meetings</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary text-sm px-3 py-2 hidden sm:flex items-center gap-1">⬇ Export</button>
          <button className="btn-primary text-sm px-3 py-2" onClick={openCreate}>+ Log Meeting</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <input type="text" placeholder="🔍 Search contact, company…" className="input flex-shrink-0 text-xs py-1.5 w-48" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="select flex-shrink-0 text-xs w-28 py-1.5" value={filters.segment} onChange={e => setFilters(f => ({ ...f, segment: e.target.value }))}>
            <option value="">All Segments</option>
            {SEGMENTS.map(s => <option key={s}>{s}</option>)}
          </select>
          <input type="date" className="input flex-shrink-0 w-32 text-xs py-1.5" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          <input type="date" className="input flex-shrink-0 w-32 text-xs py-1.5" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          {isManager() && (
            <select className="select flex-shrink-0 text-xs w-36 py-1.5" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
              <option value="">All Staff</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {(search || Object.values(filters).some(v => v)) && (
            <button className="btn-ghost text-xs flex-shrink-0 px-3 py-1.5" onClick={() => { setSearch(''); setFilters({ segment: '', user_id: '', from: '', to: '' }); }}>✕ Clear</button>
          )}
          <button onClick={handleExport} className="btn-ghost text-xs flex-shrink-0 px-3 py-1.5 sm:hidden">⬇ Export</button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {meetings.map(m => (
          <div key={m.id} className="card flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMeeting(m)}>
            {m.photo_path && (
              <img src={m.photo_path} alt="Meeting" className="w-full h-40 object-cover rounded-lg" />
            )}
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">{m.contact_name || 'Unknown'}</p>
                <p className="text-sm text-gray-500">{m.company}</p>
              </div>
              <span className={`badge ${SEGMENT_COLORS[m.segment] || 'bg-gray-100 text-gray-600'}`}>{m.segment}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>🎯 {m.purpose}</span>
              {m.lat && <span>📍 {m.address_label || `${m.lat?.toFixed(4)}, ${m.lng?.toFixed(4)}`}</span>}
            </div>
            {m.outcome && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{m.outcome}</p>}
            <div className="flex items-center justify-between text-xs text-gray-400 mt-auto gap-2">
              <span>{formatDate(m.meeting_date)}</span>
              {m.follow_up_date && <span className="text-blue-600 font-medium">Follow up {formatDate(m.follow_up_date)}</span>}
              <span>{m.user_name}</span>
            </div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button className="btn-ghost text-xs px-2 py-1" onClick={() => { setEditing(m); setForm({ contact_name: m.contact_name, company: m.company, segment: m.segment, purpose: m.purpose, outcome: m.outcome, notes: m.notes, address_label: m.address_label, meeting_date: m.meeting_date?.slice(0, 16) || '', follow_up_date: (m.follow_up_date || '').slice(0, 10) }); setGps(m.lat && m.lng ? { lat: m.lat, lng: m.lng } : null); setPhotoPreview(m.photo_path); setPhotoFile(null); setShowModal(true); }}>Edit</button>
              <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(m.id)}>Delete</button>
            </div>
          </div>
        ))}
        {meetings.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-400">
            <p className="text-5xl mb-4">🤝</p>
            <p className="text-lg font-medium">No meetings recorded yet</p>
            <p className="text-sm">Click "+ Log Meeting" to add your first physical meeting</p>
          </div>
        )}
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={ps => { setPageSize(ps); setPage(1); }} />

      {/* Log Meeting Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Meeting' : 'Log Physical Meeting'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Contact Name</label><input className="input" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
            <div><label className="label">Company</label><input className="input" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
            <div><label className="label">Segment *</label>
              <select className="select" value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value }))}>
                {SEGMENTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label">Purpose</label>
              <select className="select" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}>
                {MEETING_PURPOSES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div><label className="label">Meeting Date & Time</label><input type="datetime-local" className="input" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} /></div>
            <div><label className="label">Outcome / Result</label><input className="input" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} placeholder="e.g. Proposal agreed" /></div>
          </div>
          <div><label className="label">Notes</label><textarea className="input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <FollowUpPicker label="When to follow up" value={form.follow_up_date} onChange={follow_up_date => setForm(f => ({ ...f, follow_up_date }))} />

          {/* Photo */}
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
            <label className="label">Meeting Photo</label>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                <button type="button" className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>×</button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>📷 Choose Photo</button>
                <button type="button" className="btn-secondary" onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); } }}>📸 Take Photo</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          {/* GPS */}
          <div className="border border-gray-200 rounded-xl p-4">
            <label className="label">Location</label>
            {gps ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-600">📍 {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>
                <a href={`https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lng}&zoom=17`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Map ↗</a>
                <button type="button" className="text-xs text-red-500" onClick={() => setGps(null)}>Remove</button>
              </div>
            ) : (
              <button type="button" className="btn-secondary" onClick={captureGPS} disabled={gpsLoading}>
                {gpsLoading ? '⏳ Getting location…' : '📍 Capture GPS Location'}
              </button>
            )}
            <div className="mt-2">
              <input className="input mt-1" placeholder="Location label (e.g. Taj Hotel, MG Road)" value={form.address_label} onChange={e => setForm(f => ({ ...f, address_label: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editing ? 'Update' : 'Log Meeting'}</button>
          </div>
        </form>
      </Modal>

      {/* View Meeting Modal */}
      <Modal open={!!viewMeeting} onClose={() => setViewMeeting(null)} title="Meeting Details" size="lg">
        {viewMeeting && (
          <div className="space-y-4">
            {viewMeeting.photo_path && <img src={viewMeeting.photo_path} alt="Meeting" className="w-full h-56 object-cover rounded-xl" />}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-gray-500">Contact</p><p className="font-medium">{viewMeeting.contact_name || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Company</p><p className="font-medium">{viewMeeting.company || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Segment</p><span className={`badge ${SEGMENT_COLORS[viewMeeting.segment]}`}>{viewMeeting.segment}</span></div>
              <div><p className="text-xs text-gray-500">Purpose</p><p className="font-medium">{viewMeeting.purpose}</p></div>
              <div><p className="text-xs text-gray-500">Date</p><p className="font-medium">{formatDateTime(viewMeeting.meeting_date)}</p></div>
              <div><p className="text-xs text-gray-500">Follow-up</p><p className="font-medium">{viewMeeting.follow_up_date ? formatDate(viewMeeting.follow_up_date) : '—'}</p></div>
              <div><p className="text-xs text-gray-500">Sales Rep</p><p className="font-medium">{viewMeeting.user_name}</p></div>
            </div>
            {viewMeeting.outcome && <div><p className="text-xs text-gray-500 mb-1">Outcome</p><p className="bg-gray-50 rounded-lg p-3 text-sm">{viewMeeting.outcome}</p></div>}
            {viewMeeting.notes && <div><p className="text-xs text-gray-500 mb-1">Notes</p><p className="bg-gray-50 rounded-lg p-3 text-sm">{viewMeeting.notes}</p></div>}
            {viewMeeting.lat && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Location</p>
                <p className="text-sm text-gray-600 mb-2">📍 {viewMeeting.address_label || `${viewMeeting.lat?.toFixed(5)}, ${viewMeeting.lng?.toFixed(5)}`}</p>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${viewMeeting.lat}&mlon=${viewMeeting.lng}&zoom=17`}
                  target="_blank" rel="noopener noreferrer"
                  className="btn-secondary text-sm"
                >
                  🗺 View on Map
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => handleDelete(deleteId!)} title="Delete Meeting" message="Delete this meeting record?" confirmLabel="Delete" danger />
    </div>
  );
}
