import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ProposalTemplates from '../components/ProposalTemplates';

interface User { id: string; name: string; email: string; role: string; active: number; }
interface Hotel {
  id: string; name: string; address: string; city: string; phone: string; email: string;
  website: string; gst_number: string; logo_path: string | null; brand_color: string;
}

const EMPTY_HOTEL = { name: '', address: '', city: '', phone: '', email: '', website: '', gst_number: '', brand_color: '#2563eb' };

const ROLE_COLORS: Record<string, string> = { admin: 'bg-red-100 text-red-700', manager: 'bg-purple-100 text-purple-700', executive: 'bg-blue-100 text-blue-700', call_center: 'bg-teal-100 text-teal-700' };
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', manager: 'Sales manager', executive: 'Sales executive', call_center: 'Call center' };

export default function Settings() {
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'executive', active: 1 });
  const [settingsForm, setSettingsForm] = useState({ hotel_name: '', hotel_tagline: '' });
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [showHotel, setShowHotel] = useState(false);
  const [editHotel, setEditHotel] = useState<Hotel | null>(null);
  const [hotelForm, setHotelForm] = useState(EMPTY_HOTEL);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [deactivateHotelId, setDeactivateHotelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    const [u, s, h] = await Promise.all([
      api.get<User[]>('/users'),
      api.get<Record<string, string>>('/settings'),
      api.get<Hotel[]>('/properties'),
    ]);
    setUsers(u);
    setSettings(s);
    setHotels(h);
    setSettingsForm({ hotel_name: s.hotel_name || '', hotel_tagline: s.hotel_tagline || '' });
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditUser(null); setUserForm({ name: '', email: '', password: '', role: 'executive', active: 1 }); setShowUserModal(true); };
  const openEdit = (u: User) => { setEditUser(u); setUserForm({ name: u.name, email: u.email, password: '', role: u.role, active: u.active }); setShowUserModal(true); };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const body: any = { ...userForm };
      if (!body.password) delete body.password;
      if (editUser) await api.put(`/users/${editUser.id}`, body);
      else await api.post('/users', body);
      setShowUserModal(false); load(); setSuccess(editUser ? 'User updated.' : 'User created.');
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const deactivateUser = async (id: string) => {
    await api.del(`/users/${id}`); load(); setSuccess('User deactivated.');
  };

  const openHotel = (hotel?: Hotel) => {
    setEditHotel(hotel || null);
    setHotelForm(hotel ? {
      name: hotel.name, address: hotel.address || '', city: hotel.city || '', phone: hotel.phone || '',
      email: hotel.email || '', website: hotel.website || '', gst_number: hotel.gst_number || '', brand_color: hotel.brand_color || '#2563eb',
    } : EMPTY_HOTEL);
    setLogoFile(null);
    setError('');
    setShowHotel(true);
  };

  const saveHotel = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(hotelForm).forEach(([key, value]) => fd.append(key, value));
      if (logoFile) fd.append('logo', logoFile);
      if (editHotel) await api.putForm(`/properties/${editHotel.id}`, fd);
      else await api.postForm('/properties', fd);
      setShowHotel(false);
      setSuccess(editHotel ? 'Hotel updated.' : 'Hotel added.');
      load();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const deactivateHotel = async (id: string) => {
    await api.del(`/properties/${id}`);
    setSuccess('Hotel removed from the list. Existing leads keep their history.');
    load();
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.put('/settings', settingsForm);
      setSuccess('Settings saved!');
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="page-title">⚙️ Settings</h1>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{success}</div>}

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800">🏨 Hotels</h2>
          <button className="btn-primary" onClick={() => openHotel()}>+ Add hotel</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">A lead belongs to one hotel. Its proposal uses that hotel’s logo, address, phone and GST. Add as many hotels as you run.</p>
        <div className="space-y-3">
          {hotels.map(hotel => (
            <div key={hotel.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100">
              {hotel.logo_path ? (
                <img src={hotel.logo_path} alt="" className="w-12 h-12 rounded-lg object-contain bg-gray-50 border border-gray-100" />
              ) : (
                <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: hotel.brand_color || '#2563eb' }}>{hotel.name[0]}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{hotel.name}</p>
                <p className="text-sm text-gray-500">{[hotel.address, hotel.city].filter(Boolean).join(', ') || 'Address not set'}</p>
                <p className="text-xs text-gray-400 mt-1">{[hotel.phone, hotel.email, hotel.gst_number ? `GST ${hotel.gst_number}` : ''].filter(Boolean).join(' · ') || 'Add phone, email and GST'}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-sm px-3 py-1" onClick={() => openHotel(hotel)}>Edit</button>
                <button className="btn-ghost text-sm px-3 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeactivateHotelId(hotel.id)}>Remove</button>
              </div>
            </div>
          ))}
          {hotels.length === 0 && <p className="text-sm text-gray-400">No hotels yet.</p>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-1">Workspace name</h2>
        <p className="text-xs text-gray-500 mb-4">This name is not printed on a proposal. Each proposal uses the hotel on its lead.</p>
        <form onSubmit={saveSettings} className="space-y-4">
          <div><label className="label">Hotel Name</label><input className="input max-w-sm" value={settingsForm.hotel_name} onChange={e => setSettingsForm(f => ({ ...f, hotel_name: e.target.value }))} /></div>
          <div><label className="label">Tagline</label><input className="input max-w-sm" value={settingsForm.hotel_tagline} onChange={e => setSettingsForm(f => ({ ...f, hotel_tagline: e.target.value }))} /></div>
          <button type="submit" className="btn-primary" disabled={loading}>Save Branding</button>
        </form>
      </div>

      <ProposalTemplates />

      {/* User Management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">👥 User Management</h2>
          <button className="btn-primary" onClick={openCreate}>+ Add User</button>
        </div>
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className={`flex items-center gap-4 p-3 rounded-xl border ${u.active ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">{u.name[0]}</div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{u.name}</p>
                <p className="text-sm text-gray-500">{u.email}</p>
              </div>
              <span className={`badge ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>{ROLE_LABELS[u.role] || u.role}</span>
              {!u.active && <span className="badge bg-gray-100 text-gray-500">Inactive</span>}
              <div className="flex gap-2">
                <button className="btn-ghost text-sm px-3 py-1" onClick={() => openEdit(u)}>Edit</button>
                {u.active && <button className="btn-ghost text-sm px-3 py-1 text-red-500 hover:bg-red-50" onClick={() => setDeactivateId(u.id)}>Deactivate</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={showUserModal} onClose={() => setShowUserModal(false)} title={editUser ? 'Edit User' : 'Add User'}>
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={saveUser} className="space-y-4">
          <div><label className="label">Full Name *</label><input className="input" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Email *</label><input type="email" className="input" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} required /></div>
          <div><label className="label">{editUser ? 'New Password (leave blank to keep)' : 'Password *'}</label><input type="password" className="input" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} required={!editUser} /></div>
          <div><label className="label">Role</label>
            <select className="select" value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
              <option value="executive">Sales Executive</option>
              <option value="call_center">Call Center</option>
              <option value="manager">Sales Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowUserModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : editUser ? 'Update User' : 'Create User'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={showHotel} onClose={() => setShowHotel(false)} title={editHotel ? 'Edit hotel' : 'Add hotel'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={saveHotel} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className="label">Hotel name *</label><input className="input" required value={hotelForm.name} onChange={e => setHotelForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="md:col-span-2"><label className="label">Address</label><input className="input" value={hotelForm.address} onChange={e => setHotelForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div><label className="label">City</label><input className="input" value={hotelForm.city} onChange={e => setHotelForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div><label className="label">Phone</label><input className="input" value={hotelForm.phone} onChange={e => setHotelForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label">Email</label><input className="input" value={hotelForm.email} onChange={e => setHotelForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">Website</label><input className="input" value={hotelForm.website} onChange={e => setHotelForm(f => ({ ...f, website: e.target.value }))} /></div>
          <div><label className="label">GST number</label><input className="input" value={hotelForm.gst_number} onChange={e => setHotelForm(f => ({ ...f, gst_number: e.target.value }))} placeholder="07AAYOR0001A1Z5" /></div>
          <div><label className="label">Brand colour</label><input type="color" className="input h-10 p-1" value={hotelForm.brand_color} onChange={e => setHotelForm(f => ({ ...f, brand_color: e.target.value }))} /></div>
          <div className="md:col-span-2"><label className="label">Logo</label><input type="file" accept="image/*" className="input" onChange={e => setLogoFile(e.target.files?.[0] || null)} />
            {editHotel?.logo_path && !logoFile && <img src={editHotel.logo_path} alt="" className="mt-2 h-12 object-contain" />}
          </div>
          <div className="md:col-span-2 flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setShowHotel(false)}>Cancel</button>
            <button className="btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save hotel'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deactivateId} onClose={() => setDeactivateId(null)} onConfirm={() => deactivateUser(deactivateId!)} title="Deactivate User" message="This user will no longer be able to log in." confirmLabel="Deactivate" danger />
      <ConfirmDialog open={!!deactivateHotelId} onClose={() => setDeactivateHotelId(null)} onConfirm={() => deactivateHotel(deactivateHotelId!)} title="Remove hotel" message="This hotel will no longer appear when you add a lead. Leads and proposals already saved keep it." confirmLabel="Remove" danger />
    </div>
  );
}
