import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDate, formatTime, cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface AttendanceRecord {
  id: string; user_id: string; user_name: string; date: string;
  check_in_at: string | null; check_out_at: string | null;
  check_in_lat: number | null; check_in_lng: number | null;
  is_late: number; status: string;
}

interface Geofence { name: string; lat: number; lng: number; radius_meters: number; checkin_cutoff: string; }

export default function Attendance() {
  const { user, isAdmin, isManager } = useAuthStore();
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [geofence, setGeofence] = useState<Geofence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedUser, setSelectedUser] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [editGeo, setEditGeo] = useState(false);
  const [geoForm, setGeoForm] = useState<Geofence>({ name: 'Hotel Premises', lat: 0, lng: 0, radius_meters: 500, checkin_cutoff: '09:30' });

  const canManage = isAdmin() || isManager();

  const loadData = async () => {
    const [todayRes, gf] = await Promise.all([
      api.get<AttendanceRecord | null>('/attendance/today'),
      api.get<Geofence>('/attendance/geofence'),
    ]);
    setToday(todayRes);
    setGeofence(gf);
    setGeoForm(gf || geoForm);
    const userId = canManage ? (selectedUser || '') : user!.id;
    const att = await api.get<AttendanceRecord[]>(`/attendance?month=${month}${userId ? `&user_id=${userId}` : ''}`);
    setRecords(att);
    if (canManage) {
      const u = await api.get<any[]>('/users');
      setUsers(u);
    }
  };

  useEffect(() => { loadData(); }, [month, selectedUser]);

  const markAttendance = async (type: 'checkin' | 'checkout') => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const pos = await getPosition();
      await api.post(`/attendance/${type}`, { lat: pos?.lat, lng: pos?.lng });
      setSuccess(type === 'checkin' ? '✅ Checked in successfully!' : '✅ Checked out successfully!');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveGeofence = async () => {
    try {
      await api.put('/attendance/geofence', geoForm);
      setEditGeo(false);
      setSuccess('Geofence settings saved!');
      loadData();
    } catch (err: any) { setError(err.message); }
  };

  const captureCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      pos => setGeoForm(g => ({ ...g, lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => setError('Could not get location.')
    );
  };

  // Calendar view
  const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const recordsByDate = Object.fromEntries(records.filter(r => r.user_id === (selectedUser || user!.id)).map(r => [r.date, r]));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Attendance</h1>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{success}</div>}

      {/* Today's Status Card */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        {today ? (
          <div className="flex flex-wrap items-center gap-6 mb-4">
            <div>
              <p className="text-xs text-gray-500">Check In</p>
              <p className="text-lg font-bold text-green-600">{today.check_in_at ? new Date(today.check_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Check Out</p>
              <p className="text-lg font-bold text-blue-600">{today.check_out_at ? new Date(today.check_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
            </div>
            {today.check_in_at && today.check_out_at && (
              <div>
                <p className="text-xs text-gray-500">Hours Worked</p>
                <p className="text-lg font-bold">{calcHours(today.check_in_at, today.check_out_at)}</p>
              </div>
            )}
            <span className={`badge text-sm px-3 py-1 ${today.is_late ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
              {today.is_late ? '⚠ Late' : '✓ On Time'}
            </span>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-4">You haven't checked in yet today.</p>
        )}

        {geofence && (geofence.lat !== 0 || geofence.lng !== 0) && (
          <p className="text-xs text-gray-500 mb-4">📍 Geo-fence: {geofence.name} — must be within {geofence.radius_meters}m to check in/out</p>
        )}

        <div className="flex gap-3 flex-wrap">
          {!today?.check_in_at && (
            <button className="btn-primary" onClick={() => markAttendance('checkin')} disabled={loading}>
              {loading ? '…' : '🟢 Check In'}
            </button>
          )}
          {today?.check_in_at && !today?.check_out_at && (
            <button className="btn-secondary" onClick={() => markAttendance('checkout')} disabled={loading}>
              {loading ? '…' : '🔴 Check Out'}
            </button>
          )}
          {today?.check_in_at && today?.check_out_at && (
            <span className="text-green-600 font-medium text-sm flex items-center gap-2">✅ Attendance complete for today</span>
          )}
        </div>
      </div>

      {/* Geofence Config (Admin) */}
      {isAdmin() && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">⚙️ Geo-Fence Settings</h3>
            <button className="btn-secondary text-sm" onClick={() => setEditGeo(!editGeo)}>{editGeo ? 'Cancel' : 'Edit'}</button>
          </div>
          {!editGeo ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-gray-500">Location Name</p><p className="font-medium">{geofence?.name || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Coordinates</p><p className="font-medium">{geofence?.lat?.toFixed(5)}, {geofence?.lng?.toFixed(5)}</p></div>
              <div><p className="text-xs text-gray-500">Radius</p><p className="font-medium">{geofence?.radius_meters}m</p></div>
              <div><p className="text-xs text-gray-500">Check-in Cutoff</p><p className="font-medium">{geofence?.checkin_cutoff}</p></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="label">Location Name</label><input className="input" value={geoForm.name} onChange={e => setGeoForm(g => ({ ...g, name: e.target.value }))} /></div>
              <div><label className="label">Radius (meters)</label><input type="number" className="input" value={geoForm.radius_meters} onChange={e => setGeoForm(g => ({ ...g, radius_meters: parseFloat(e.target.value) }))} /></div>
              <div><label className="label">Latitude</label><input type="number" step="any" className="input" value={geoForm.lat} onChange={e => setGeoForm(g => ({ ...g, lat: parseFloat(e.target.value) }))} /></div>
              <div><label className="label">Longitude</label><input type="number" step="any" className="input" value={geoForm.lng} onChange={e => setGeoForm(g => ({ ...g, lng: parseFloat(e.target.value) }))} /></div>
              <div><label className="label">Check-in Cutoff Time</label><input type="time" className="input" value={geoForm.checkin_cutoff} onChange={e => setGeoForm(g => ({ ...g, checkin_cutoff: e.target.value }))} /></div>
              <div className="flex items-end gap-2">
                <button className="btn-secondary" onClick={captureCurrentLocation}>📍 Use My Location</button>
                <button className="btn-primary" onClick={saveGeofence}>Save</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="card">
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="label">Month</label>
            <input type="month" className="input w-40" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          {canManage && (
            <div>
              <label className="label">Staff</label>
              <select className="select w-48" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                <option value="">All Staff</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Calendar Grid */}
        <h3 className="font-semibold text-gray-700 mb-3">Calendar View</h3>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: new Date(`${month}-01`).getDay() }, (_, i) => (
            <div key={`e-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, '0')}`;
            const rec = recordsByDate[day];
            const isToday = day === new Date().toISOString().slice(0, 10);
            return (
              <div key={day} className={cn(
                'rounded-lg p-1.5 text-center text-xs min-h-[52px] flex flex-col items-center justify-center',
                isToday && 'ring-2 ring-blue-400',
                rec ? (rec.is_late ? 'bg-yellow-50' : 'bg-green-50') : (new Date(day) < new Date() ? 'bg-red-50' : 'bg-gray-50')
              )}>
                <span className={cn('font-bold text-sm', isToday && 'text-blue-600')}>{i + 1}</span>
                {rec ? (
                  <>
                    <span className="text-green-700 text-[10px]">{rec.check_in_at ? new Date(rec.check_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    {rec.is_late ? <span className="text-yellow-600 text-[10px]">Late</span> : <span className="text-green-600 text-[10px]">✓</span>}
                  </>
                ) : new Date(day) < new Date() ? <span className="text-red-400 text-[10px]">Absent</span> : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Attendance Table */}
      {canManage && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-gray-800 mb-4">Team Attendance — {month}</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="pb-2 font-medium">Staff</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Check In</th>
              <th className="pb-2 font-medium">Check Out</th>
              <th className="pb-2 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="table-row">
                  <td className="py-2 pr-4 font-medium">{r.user_name}</td>
                  <td className="py-2 pr-4 text-gray-600">{formatDate(r.date)}</td>
                  <td className="py-2 pr-4">{r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="py-2 pr-4">{r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="py-2">
                    <span className={`badge ${r.is_late ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {r.is_late ? 'Late' : 'On Time'}
                    </span>
                  </td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-400">No attendance records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10000 }
    );
  });
}

function calcHours(checkIn: string, checkOut: string): string {
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}
