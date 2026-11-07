import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import {
  ACTIVITY_TYPES, ACTIVITY_OUTCOMES, DUE_STATUS_CONFIG,
  TIER_CONFIG, overdueUrgencyColor, formatDate
} from '../lib/utils';

const API = '/api';

interface DueAgent {
  id: string; name: string; agency_name: string; type: string;
  country: string; city: string; phone: string; email: string;
  tier: string; frequency: string | null; frequency_days: number | null;
  last_contact_date: string | null; next_due_date: string | null;
  due_status: string; days_overdue: number; assigned_name?: string;
}

interface ComplianceStat {
  user_id: string; user_name: string;
  total_assigned: number; overdue_count: number; never_contacted: number;
  contacted_this_month: number; compliance_pct: number; streak_days: number;
}

export default function AgentDue() {
  const { token, user, isAdmin, isManager } = useAuthStore();
  const [dueAgents, setDueAgents] = useState<DueAgent[]>([]);
  const [compliance, setCompliance] = useState<ComplianceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logAgent, setLogAgent] = useState<DueAgent | null>(null);
  const [logForm, setLogForm] = useState({ type: 'Call', outcome: '', notes: '', contacted_at: new Date().toISOString().slice(0, 16) });
  const [logSaving, setLogSaving] = useState(false);
  const [tab, setTab] = useState<'due' | 'leaderboard'>('due');

  const isAdminOrManager = isAdmin() || isManager();

  const headers = useCallback(() => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }), [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dueRes, compRes] = await Promise.all([
        fetch(`${API}/agents/due-today`, { headers: headers() }),
        fetch(`${API}/agents/compliance`, { headers: headers() }),
      ]);
      const [dueData, compData] = await Promise.all([dueRes.json(), compRes.json()]);
      setDueAgents(Array.isArray(dueData) ? dueData : []);
      setCompliance(Array.isArray(compData) ? compData : []);
    } finally { setLoading(false); }
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  const openLog = (a: DueAgent) => {
    setLogAgent(a);
    setLogForm({ type: 'Call', outcome: '', notes: '', contacted_at: new Date().toISOString().slice(0, 16) });
    setShowLogModal(true);
  };

  const submitLog = async () => {
    if (!logAgent) return;
    setLogSaving(true);
    try {
      await fetch(`${API}/agents/${logAgent.id}/log`, { method: 'POST', headers: headers(), body: JSON.stringify(logForm) });
      setShowLogModal(false);
      load();
    } finally { setLogSaving(false); }
  };

  const myStats = compliance.find(c => c.user_id === user?.id);
  const overdue = dueAgents.filter(a => a.due_status === 'Overdue');
  const dueToday = dueAgents.filter(a => a.due_status === 'Due Today');
  const neverContacted = dueAgents.filter(a => a.due_status === 'Never Contacted');

  function ComplianceBar({ pct }: { pct: number }) {
    const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold w-8 text-right">{pct}%</span>
      </div>
    );
  }

  const AgentCard = ({ a }: { a: DueAgent }) => {
    const dsc = DUE_STATUS_CONFIG[a.due_status] || DUE_STATUS_CONFIG['On Track'];
    const tc = TIER_CONFIG[a.tier] || TIER_CONFIG['B'];
    const urgencyClass = a.due_status === 'Overdue' ? overdueUrgencyColor(a.days_overdue) : a.due_status === 'Due Today' ? 'border-l-yellow-400 bg-yellow-50' : 'border-l-gray-300 bg-white';
    return (
      <div className={`border-l-4 rounded-lg p-4 flex items-start justify-between gap-3 ${urgencyClass}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{a.name}</span>
            {a.agency_name && <span className="text-gray-500 text-sm truncate">{a.agency_name}</span>}
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${tc.color}`}>{tc.label}</span>
            {isAdminOrManager && a.assigned_name && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{a.assigned_name}</span>}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
            <span>{a.type}</span>
            {[a.city, a.country].filter(Boolean).length > 0 && <span>{[a.city, a.country].filter(Boolean).join(', ')}</span>}
            {a.phone && <a href={`tel:${a.phone}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">{a.phone}</a>}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs">
            <span className="text-gray-500">Last: <span className="font-medium text-gray-700">{formatDate(a.last_contact_date)}</span></span>
            <span className="text-gray-500">Next: <span className={`font-medium ${a.due_status === 'Overdue' ? 'text-red-600' : 'text-gray-700'}`}>{formatDate(a.next_due_date)}</span></span>
            {a.frequency && <span className="text-gray-400">{a.frequency}</span>}
          </div>
          {a.days_overdue > 0 && (
            <div className="mt-1 text-xs text-red-600 font-semibold">{a.days_overdue} day{a.days_overdue !== 1 ? 's' : ''} overdue</div>
          )}
        </div>
        <button onClick={() => openLog(a)} className="flex-shrink-0 bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 whitespace-nowrap">
          Log Contact
        </button>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Follow-ups</h1>
          <p className="text-sm text-gray-500 mt-1">Agents requiring contact today or overdue</p>
        </div>
        <a href="/agents" className="text-blue-600 hover:text-blue-800 text-sm font-medium border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50">
          View All Agents →
        </a>
      </div>

      {/* Personal stats */}
      {myStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{myStats.total_assigned}</div>
            <div className="text-xs text-gray-500 mt-1">Assigned Agents</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-2xl font-bold ${myStats.overdue_count > 0 ? 'text-red-600' : 'text-green-600'}`}>{myStats.overdue_count}</div>
            <div className="text-xs text-gray-500 mt-1">Overdue</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-2xl font-bold text-blue-600">{myStats.contacted_this_month}</div>
            <div className="text-xs text-gray-500 mt-1">Contacted This Month</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-orange-500">{myStats.streak_days}</div>
              <span className="text-lg">🔥</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Day Streak</div>
          </div>
        </div>
      )}

      {/* Monthly compliance bar */}
      {myStats && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Monthly Compliance</span>
            <span className="text-xs text-gray-500">{myStats.contacted_this_month} / {myStats.total_assigned} agents contacted</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${myStats.compliance_pct >= 80 ? 'bg-green-500' : myStats.compliance_pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${myStats.compliance_pct}%` }}
              />
            </div>
            <span className="text-sm font-bold w-10 text-right">{myStats.compliance_pct}%</span>
          </div>
          {myStats.compliance_pct < 80 && (
            <p className="text-xs text-gray-500 mt-2">
              {myStats.compliance_pct < 50
                ? 'You need to catch up! Contact more agents this month.'
                : "Good progress! Keep it up to hit 80%."
              }
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('due')} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === 'due' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
          Due List {dueAgents.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{dueAgents.length}</span>}
        </button>
        {isAdminOrManager && <button onClick={() => setTab('leaderboard')} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === 'leaderboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
          Team Leaderboard
        </button>}
      </div>

      {tab === 'due' && (
        <div>
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading…</div>
          ) : dueAgents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <div className="text-4xl mb-3">🎉</div>
              <div className="text-xl font-semibold text-gray-700">All caught up!</div>
              <div className="text-gray-500 text-sm mt-1">No agents due for follow-up today.</div>
            </div>
          ) : (
            <div className="space-y-6">
              {overdue.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                    Overdue ({overdue.length})
                  </h2>
                  <div className="space-y-2">{overdue.map(a => <AgentCard key={a.id} a={a} />)}</div>
                </div>
              )}
              {dueToday.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-yellow-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block"></span>
                    Due Today ({dueToday.length})
                  </h2>
                  <div className="space-y-2">{dueToday.map(a => <AgentCard key={a.id} a={a} />)}</div>
                </div>
              )}
              {neverContacted.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-400 inline-block"></span>
                    Never Contacted ({neverContacted.length})
                  </h2>
                  <div className="space-y-2">{neverContacted.map(a => <AgentCard key={a.id} a={a} />)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">#</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Sales Person</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Assigned</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Overdue</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Contacted/Mo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Streak</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...compliance].sort((a, b) => b.compliance_pct - a.compliance_pct).map((c, i) => (
                <tr key={c.user_id} className={c.user_id === user?.id ? 'bg-blue-50' : ''}>
                  <td className="px-4 py-3 font-bold text-gray-500">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {c.user_name}
                    {c.user_id === user?.id && <span className="ml-1 text-xs text-blue-600">(you)</span>}
                  </td>
                  <td className="px-4 py-3">{c.total_assigned}</td>
                  <td className="px-4 py-3">
                    <span className={c.overdue_count > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{c.overdue_count}</span>
                  </td>
                  <td className="px-4 py-3">{c.contacted_this_month}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${c.streak_days >= 7 ? 'text-orange-500' : c.streak_days > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                      {c.streak_days > 0 ? `🔥 ${c.streak_days}d` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 w-36">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-2 rounded-full ${c.compliance_pct >= 80 ? 'bg-green-500' : c.compliance_pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${c.compliance_pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold w-8 text-right">{c.compliance_pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && logAgent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Log Activity</h2>
                <p className="text-sm text-gray-500">{logAgent.name} — {logAgent.agency_name}</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Activity Type *</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={logForm.type} onChange={e => setLogForm(f => ({ ...f, type: e.target.value }))}>
                  {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Outcome</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={logForm.outcome} onChange={e => setLogForm(f => ({ ...f, outcome: e.target.value }))}>
                  <option value="">— Select outcome —</option>
                  {ACTIVITY_OUTCOMES.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Date & Time</label>
                <input type="datetime-local" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={logForm.contacted_at} onChange={e => setLogForm(f => ({ ...f, contacted_at: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3} placeholder="What was discussed? Any follow-up actions?" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {logAgent.days_overdue > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  This agent is {logAgent.days_overdue} day{logAgent.days_overdue !== 1 ? 's' : ''} overdue. Logging this contact will reschedule the next follow-up.
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button onClick={() => setShowLogModal(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={submitLog} disabled={logSaving} className="px-6 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                {logSaving ? 'Saving…' : 'Log Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
