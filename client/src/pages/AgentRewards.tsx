import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

interface Voucher {
  id: string; code: string; nights: number; rupees: number; guest_name: string;
  event_date: string; event_end_date: string | null; status: string; created_at: string;
  agent_name: string; agency_name: string; property_name: string;
}

function inr(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

export default function AgentRewards() {
  const { isManager } = useAuthStore();
  const [rows, setRows] = useState<Voucher[]>([]);
  const [error, setError] = useState('');

  const load = () => api.get<Voucher[]>('/agent-portal/vouchers').then(setRows).catch((err: Error) => setError(err.message));
  useEffect(() => { load(); }, []);

  const markUsed = async (id: string) => {
    setError('');
    try {
      await api.post(`/agent-portal/vouchers/${id}/use`, {});
      load();
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="page-title">Agent free nights</h1>
        <p className="text-sm text-gray-500">When an agent spends wallet money, a code is issued. Mark it used when the guest checks in.</p>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-400">
              <th className="py-2 pr-3">Code</th>
              <th className="py-2 pr-3">Agent</th>
              <th className="py-2 pr-3">Guest</th>
              <th className="py-2 pr-3">Hotel</th>
              <th className="py-2 pr-3">Stay</th>
              <th className="py-2 pr-3">Spent</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="py-3 pr-3 font-medium">{row.code}</td>
                <td className="py-3 pr-3">{row.agent_name}<span className="block text-xs text-gray-400">{row.agency_name}</span></td>
                <td className="py-3 pr-3">{row.guest_name}</td>
                <td className="py-3 pr-3">{row.property_name || '—'}</td>
                <td className="py-3 pr-3">{row.nights} night{row.nights === 1 ? '' : 's'} · {row.event_date}</td>
                <td className="py-3 pr-3">{inr(row.rupees)}</td>
                <td className="py-3">
                  {row.status === 'issued' && isManager() ? (
                    <button className="btn-ghost text-xs" onClick={() => markUsed(row.id)}>Mark used</button>
                  ) : (
                    <span className="capitalize text-gray-500">{row.status}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">No free nights have been used yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
