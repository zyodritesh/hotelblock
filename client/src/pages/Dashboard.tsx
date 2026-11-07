import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api/client';
import { formatCurrency, formatDateTime, formatDate, SEGMENT_COLORS, STAGE_COLORS } from '../lib/utils';
import KpiCard from '../components/KpiCard';
import { useAuthStore } from '../store/auth';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316'];

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    api.get<any>('/reports/dashboard').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading dashboard…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <Link to="/attendance" className="btn-primary">
          🕐 Mark Attendance
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard title="Calls Today" value={data.callsToday} icon="📞" color="blue" />
        <KpiCard title="Calls This Week" value={data.callsWeek} icon="📅" color="purple" />
        <KpiCard title="Meetings Today" value={data.meetingsToday} icon="🤝" color="teal" />
        <KpiCard title="Open Leads" value={data.openLeads} icon="🔄" color="orange" />
        <KpiCard title="Pipeline Value" value={formatCurrency(data.pipelineValue)} icon="💰" color="green" />
        <KpiCard title="Closed (MTD)" value={formatCurrency(data.closedRevenueMTD)} icon="🏆" color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline by Stage */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Pipeline by Stage</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.pipelineByStage} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Value']} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline by Segment */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Pipeline by Segment</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.pipelineBySegment} dataKey="value" nameKey="segment" cx="50%" cy="50%" outerRadius={80} label={({ segment, percent }) => `${segment} ${(percent * 100).toFixed(0)}%`}>
                {data.pipelineBySegment.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Calls */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Recent Calls</h3>
            <Link to="/calls" className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {data.recentCalls.length === 0 && <p className="text-gray-400 text-sm">No calls yet today.</p>}
            {data.recentCalls.map((call: any) => (
              <div key={call.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm flex-shrink-0">📞</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{call.contact_name || 'Unknown'} — {call.company}</p>
                  <p className="text-xs text-gray-400">{call.segment} · {call.outcome} · {formatDateTime(call.created_at)}</p>
                </div>
                <span className={`badge text-xs ${SEGMENT_COLORS[call.segment] || 'bg-gray-100 text-gray-600'}`}>{call.segment}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Upcoming Follow-ups</h3>
            <Link to="/tasks" className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {data.upcomingTasks.length === 0 && <p className="text-gray-400 text-sm">No pending tasks.</p>}
            {data.upcomingTasks.map((task: any) => {
              const overdue = task.due_date && new Date(task.due_date) < new Date();
              return (
                <div key={task.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${overdue ? 'bg-red-500' : 'bg-yellow-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {overdue ? '⚠ Overdue — ' : ''}{formatDate(task.due_date)} · {task.user_name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Today's Attendance */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Today's Attendance</h3>
          <Link to="/attendance" className="text-sm text-blue-600 hover:underline">Manage →</Link>
        </div>
        {data.todayAttendance.length === 0 ? (
          <p className="text-gray-400 text-sm">No check-ins recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Staff</th>
                <th className="pb-2 font-medium">Check In</th>
                <th className="pb-2 font-medium">Check Out</th>
                <th className="pb-2 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {data.todayAttendance.map((a: any) => (
                  <tr key={a.id} className="table-row">
                    <td className="py-2 pr-4 font-medium">{a.user_name}</td>
                    <td className="py-2 pr-4 text-gray-600">{a.check_in_at ? new Date(a.check_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="py-2 pr-4 text-gray-600">{a.check_out_at ? new Date(a.check_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="py-2">
                      <span className={`badge ${a.is_late ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {a.is_late ? 'Late' : 'On Time'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}
