import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api/client';
import { formatCurrency, formatDateTime, formatDate, SEGMENT_COLORS, STAGE_COLORS } from '../lib/utils';
import KpiCard from '../components/KpiCard';
import SalesPlanBoard from '../components/SalesPlanBoard';
import { useAuthStore } from '../store/auth';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316'];

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agentsDue, setAgentsDue] = useState<any[]>([]);
  const [agentCompliance, setAgentCompliance] = useState<number | null>(null);
  const { user, token } = useAuthStore();

  useEffect(() => {
    api.get<any>('/reports/dashboard').then(setData).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    fetch('/api/agents/due-today', { headers: h }).then(r => r.json()).then(d => setAgentsDue(Array.isArray(d) ? d.slice(0, 5) : [])).catch(() => {});
    fetch('/api/agents/compliance', { headers: h }).then(r => r.json()).then((d: any[]) => {
      const me = Array.isArray(d) ? d.find(c => c.user_id === user?.id) : null;
      if (me) setAgentCompliance(me.compliance_pct);
    }).catch(() => {});
  }, [token, user?.id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading dashboard…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p className="text-xs mt-1 font-medium text-blue-700">
            {user?.role === 'call_center' ? 'Access: your own calls and meetings. You can add a lead for anyone in the company.' : user?.role === 'executive' ? 'Access: your own calls, meetings, and proposals. Leads you own or created are visible to you.' : user?.role === 'manager' ? 'Access: every sales executive, plus your own records.' : 'Access: full team, including settings.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/wallet" className="btn-secondary text-sm px-3 py-2">👛 Wallet</Link>
          <Link to="/attendance" className="btn-primary text-sm px-3 py-2">🕐 Attendance</Link>
        </div>
      </div>

      <SalesPlanBoard month={new Date().toISOString().slice(0, 7)} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard title="Calls Today" value={data.callsToday} icon="📞" color="blue" />
        <KpiCard title="Calls This Week" value={data.callsWeek} icon="📅" color="purple" />
        <KpiCard title="Meetings Today" value={data.meetingsToday} icon="🤝" color="teal" />
        <KpiCard title="Open Leads" value={data.openLeads} icon="🔄" color="orange" />
        <KpiCard title="Pipeline Value" value={formatCurrency(data.pipelineValue)} icon="💰" color="green" />
        <KpiCard title="Closed (MTD)" value={formatCurrency(data.closedRevenueMTD)} icon="🏆" color="green" />
      </div>

      {/* Agent Network KPIs */}
      {(agentsDue.length > 0 || agentCompliance !== null) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">🌐 Agent Follow-ups Due</h3>
              <Link to="/agents/due" className="text-sm text-blue-600 hover:underline">View all →</Link>
            </div>
            {agentsDue.length === 0 ? (
              <p className="text-green-600 text-sm font-medium">✓ All agents contacted — great job!</p>
            ) : (
              <div className="space-y-2">
                {agentsDue.map((a: any) => (
                  <div key={a.id} className={`flex items-center justify-between py-2 px-3 rounded-lg border-l-4 ${a.due_status === 'Overdue' ? 'border-red-400 bg-red-50' : a.due_status === 'Due Today' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300 bg-gray-50'}`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900">{a.name}</span>
                      {a.agency_name && <span className="text-xs text-gray-500 ml-2">{a.agency_name}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {a.days_overdue > 0 && <span className="text-xs text-red-600 font-semibold">+{a.days_overdue}d overdue</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.due_status === 'Overdue' ? 'bg-red-100 text-red-700' : a.due_status === 'Due Today' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{a.due_status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {agentCompliance !== null && (
            <div className="card flex flex-col justify-between">
              <h3 className="font-semibold text-gray-800 mb-3">Agent Compliance</h3>
              <div className="flex flex-col items-center justify-center flex-1 gap-3">
                <div className={`text-5xl font-bold ${agentCompliance >= 80 ? 'text-green-600' : agentCompliance >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{agentCompliance}%</div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-3 rounded-full ${agentCompliance >= 80 ? 'bg-green-500' : agentCompliance >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${agentCompliance}%` }} />
                </div>
                <p className="text-xs text-gray-500 text-center">Monthly agent contact rate</p>
              </div>
              <Link to="/agents/due" className="mt-3 text-center text-sm text-blue-600 hover:underline">Go to My Follow-ups →</Link>
            </div>
          )}
        </div>
      )}

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
