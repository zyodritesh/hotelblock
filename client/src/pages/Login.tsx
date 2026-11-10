import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('admin@hotel.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post<{ token: string; user: any }>('/auth/login', { email, password });
      login(data.user, data.token);
      navigate(data.user?.role === 'agent' ? '/agent' : '/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl font-bold text-white mx-auto mb-4">H</div>
          <h1 className="text-3xl font-bold text-white">HotelBlock</h1>
          <p className="text-gray-400 mt-1">Hotel Sales & Call Tracker</p>
          <a href="/hotelblock.apk" className="inline-block mt-3 text-sm font-medium text-blue-300 underline">Download the Android app</a>
          <p className="text-xs text-slate-500 mt-1">Install the file, open HotelBlock, sign in, and allow notifications.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign In</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@hotel.com" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            <button type="submit" className="btn-primary w-full justify-center py-3" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <div className="mt-5 space-y-2">
            <p className="text-xs text-gray-400 text-center">Demo logins</p>
            {[
              { label: 'Admin — everyone', email: 'admin@hotel.com', password: 'admin123' },
              { label: 'Sales manager — whole team', email: 'rahul@hotel.com', password: 'manager123' },
              { label: 'Sales executive — own data', email: 'priya@hotel.com', password: 'sales123' },
              { label: 'Call center — assign leads', email: 'neha@hotel.com', password: 'call123' },
              { label: 'Devraj — closes assigned leads', email: 'devraj@hotel.com', password: 'devraj123' },
              { label: 'Krishan — 20 agents a day', email: 'krishan@hotel.com', password: 'krishan123' },
              { label: 'Vivek — 30 agents a day', email: 'vivek@hotel.com', password: 'vivek123' },
              { label: 'Riya — events and incoming calls', email: 'riya@hotel.com', password: 'riya123' },
              { label: 'Agent — Amit Travels, ₹4,000 wallet', email: 'amit@agent.com', password: 'agent123' },
              { label: 'Agent — Neelam Weddings, starts at ₹0', email: 'neelam@agent.com', password: 'agent123' },
            ].map(demo => (
              <button key={demo.email} type="button" onClick={() => { setEmail(demo.email); setPassword(demo.password); }}
                className="w-full text-left text-xs border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
                <span className="font-medium text-gray-700">{demo.label}</span>
                <span className="block text-gray-400">{demo.email} / {demo.password}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
