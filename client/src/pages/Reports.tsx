import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api/client';
import { formatCurrency, gradeColor, currentMonth } from '../lib/utils';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'];

export default function Reports() {
  const [callsSummary, setCallsSummary] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const loadAll = async () => {
    const [cs, rev, lb, att] = await Promise.all([
      api.get<any>(`/reports/calls-summary${from && to ? `?from=${from}&to=${to}` : ''}`),
      api.get<any>('/reports/revenue'),
      api.get<any[]>('/reports/leaderboard'),
      api.get<any[]>(`/reports/attendance-summary?month=${month}`),
    ]);
    setCallsSummary(cs);
    setRevenue(rev);
    setLeaderboard(lb);
    setAttendanceSummary(att);
  };

  useEffect(() => { loadAll(); }, [from, to, month]);

  const exportCsv = (data: any[], filename: string) => {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    const csv = [keys.join(','), ...data.map(row => keys.map(k => JSON.stringify(row[k] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">📈 Reports & Analytics</h1>
      </div>

      {/* Date Filter */}
      <div className="card flex flex-wrap gap-4 items-end">
        <div><label className="label">From</label><input type="date" className="input w-36" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input w-36" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div><label className="label">Month (Attendance)</label><input type="month" className="input w-36" value={month} onChange={e => setMonth(e.target.value)} /></div>
        <button className="btn-ghost text-sm" onClick={() => { setFrom(''); setTo(''); }}>Clear</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls by Segment */}
        {callsSummary?.bySegment?.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Calls by Segment</h3>
              <button className="btn-ghost text-xs" onClick={() => exportCsv(callsSummary.bySegment, 'calls-by-segment')}>Export CSV</button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={callsSummary.bySegment}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="segment" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Calls by Outcome */}
        {callsSummary?.byOutcome?.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Calls by Outcome</h3>
              <button className="btn-ghost text-xs" onClick={() => exportCsv(callsSummary.byOutcome, 'calls-by-outcome')}>Export CSV</button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={callsSummary.byOutcome} dataKey="count" nameKey="outcome" cx="50%" cy="50%" outerRadius={80} label={({ outcome, percent }) => `${outcome.slice(0, 8)} ${(percent * 100).toFixed(0)}%`}>
                  {callsSummary.byOutcome.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Calls by Day */}
        {callsSummary?.byDay?.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Daily Call Volume</h3>
              <button className="btn-ghost text-xs" onClick={() => exportCsv(callsSummary.byDay, 'daily-calls')}>Export CSV</button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={callsSummary.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Revenue Trend */}
        {revenue?.monthly?.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Monthly Revenue (Closed Won)</h3>
              <button className="btn-ghost text-xs" onClick={() => exportCsv(revenue.monthly, 'monthly-revenue')}>Export CSV</button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[...revenue.monthly].reverse()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">🏆 Salesperson Leaderboard (This Month)</h3>
          <button className="btn-ghost text-xs" onClick={() => exportCsv(leaderboard, 'leaderboard')}>Export CSV</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">#</th>
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Calls</th>
            <th className="pb-2 font-medium">Meetings</th>
            <th className="pb-2 font-medium">Revenue Closed</th>
            <th className="pb-2 font-medium">Score</th>
            <th className="pb-2 font-medium">Grade</th>
          </tr></thead>
          <tbody>
            {leaderboard.map((u, i) => (
              <tr key={u.id} className="table-row">
                <td className="py-3 pr-4 text-gray-400 font-medium">{i + 1}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">{u.name?.[0]}</div>
                    {u.name}
                  </div>
                </td>
                <td className="py-3 pr-4">{u.calls}</td>
                <td className="py-3 pr-4">{u.meetings}</td>
                <td className="py-3 pr-4 font-semibold text-green-600">{formatCurrency(u.revenue)}</td>
                <td className="py-3 pr-4">{u.score ? u.score.toFixed(1) : '—'}</td>
                <td className="py-3"><span className={`font-black text-lg ${gradeColor(u.grade)}`}>{u.grade}</span></td>
              </tr>
            ))}
            {leaderboard.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400">No data yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Attendance Summary */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Attendance Summary — {month}</h3>
          <button className="btn-ghost text-xs" onClick={() => exportCsv(attendanceSummary, 'attendance-summary')}>Export CSV</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Staff</th>
            <th className="pb-2 font-medium">Days Present</th>
            <th className="pb-2 font-medium">Late Days</th>
            <th className="pb-2 font-medium">On-Time Days</th>
          </tr></thead>
          <tbody>
            {attendanceSummary.map((a: any) => (
              <tr key={a.user_id} className="table-row">
                <td className="py-3 pr-4 font-medium">{a.name}</td>
                <td className="py-3 pr-4">{a.total_days}</td>
                <td className="py-3 pr-4 text-yellow-600">{a.late_days}</td>
                <td className="py-3 pr-4 text-green-600">{a.total_days - a.late_days}</td>
              </tr>
            ))}
            {attendanceSummary.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-400">No attendance data for this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
