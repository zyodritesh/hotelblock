import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { currentMonth, formatCurrency, gradeColor, SEGMENTS, cn } from '../lib/utils';
import SalesPlanBoard from '../components/SalesPlanBoard';
import { useAuthStore } from '../store/auth';

interface Target { id: string; user_id: string; user_name: string; month: string; segment: string; calls_target: number; meetings_target: number; revenue_target: number; }
interface Score { id: string; user_id: string; user_name: string; month: string; calls_score: number; meetings_score: number; revenue_score: number; pipeline_score: number; total_score: number; grade: string; admin_note: string | null; }

export default function Targets() {
  const { user, isAdmin, isManager } = useAuthStore();
  const [targets, setTargets] = useState<Target[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editScore, setEditScore] = useState<Score | null>(null);
  const [targetForm, setTargetForm] = useState({ user_id: '', segment: 'All', calls_target: 0, meetings_target: 0, revenue_target: 0 });
  const [adminNote, setAdminNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [planIds, setPlanIds] = useState<string[]>([]);

  const canManage = isAdmin() || isManager();

  const load = async () => {
    const [t, s] = await Promise.all([
      api.get<Target[]>(`/targets?month=${month}`),
      api.get<Score[]>(`/targets/scores?month=${month}`),
    ]);
    setTargets(t);
    setScores(s);
  };

  useEffect(() => { load(); if (canManage) api.get<any[]>('/users').then(setUsers); }, [month]);
  useEffect(() => {
    api.get<{ people: { id: string }[] }>(`/sales-plans?month=${month}`)
      .then(r => setPlanIds((r.people || []).map(p => p.id)))
      .catch(() => setPlanIds([]));
  }, [month]);

  const saveTarget = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await api.post('/targets', { ...targetForm, month });
      setShowTargetModal(false); load(); setSuccess('Target saved!');
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const calcScore = async (userId: string) => {
    setLoading(true); setError('');
    try {
      await api.post('/targets/calculate-score', { user_id: userId, month });
      load(); setSuccess('Score calculated!');
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const saveNote = async () => {
    if (!editScore) return;
    await api.put(`/targets/scores/${editScore.id}`, { admin_note: adminNote });
    setShowNoteModal(false); load();
  };

  const targetsByUser = users.reduce((acc: any, u: any) => {
    acc[u.id] = targets.filter(t => t.user_id === u.id && t.segment === 'All')[0] || null;
    return acc;
  }, {});

  const scoreByUser = scores.reduce((acc: any, s) => { acc[s.user_id] = s; return acc; }, {});

  const displayUsers = (canManage ? users : [user].filter(Boolean)).filter((u: any) => !planIds.includes(u.id));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">🎯 Targets & Review Scores</h1>
          <Link to="/wallet" className="text-sm text-blue-600 hover:underline">Incentive wallet and target score →</Link>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" className="input w-36" value={month} onChange={e => setMonth(e.target.value)} />
          {canManage && <button className="btn-primary" onClick={() => { setTargetForm({ user_id: users[0]?.id || '', segment: 'All', calls_target: 0, meetings_target: 0, revenue_target: 0 }); setShowTargetModal(true); }}>+ Set Target</button>}
        </div>
      </div>

      <SalesPlanBoard month={month} />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{success}</div>}

      <div className="grid grid-cols-1 gap-6">
        {displayUsers.map((u: any) => {
          const target = targetsByUser[u.id];
          const score = scoreByUser[u.id];
          return (
            <div key={u.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">{u.name?.[0]}</div>
                  <div>
                    <p className="font-semibold text-gray-900">{u.name}</p>
                    <p className="text-sm text-gray-400 capitalize">{u.role} · {month}</p>
                  </div>
                </div>
                {score && (
                  <div className="text-right">
                    <p className={`text-4xl font-black ${gradeColor(score.grade)}`}>{score.grade}</p>
                    <p className="text-sm text-gray-500">{score.total_score.toFixed(1)} / 100</p>
                  </div>
                )}
              </div>

              {target ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <TargetBar label="Calls" current={score?.calls_score || 0} target={target.calls_target} unit="calls" color="blue" />
                    <TargetBar label="Meetings" current={score?.meetings_score || 0} target={target.meetings_target} unit="visits" color="purple" />
                    <TargetBar label="Revenue" current={score?.revenue_score || 0} target={target.revenue_target} unit="₹" color="green" />
                  </div>

                  {score && (
                    <div>
                      <p className="text-xs text-gray-500 mb-3">Score Breakdown (weighted)</p>
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: 'Calls', value: score.calls_score, weight: '25%' },
                          { label: 'Meetings', value: score.meetings_score, weight: '20%' },
                          { label: 'Revenue', value: score.revenue_score, weight: '35%' },
                          { label: 'Pipeline', value: score.pipeline_score, weight: '20%' },
                        ].map(item => (
                          <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500">{item.label} ({item.weight})</p>
                            <p className={`text-xl font-bold mt-1 ${item.value >= 75 ? 'text-green-600' : item.value >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{item.value.toFixed(0)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {score?.admin_note && (
                    <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                      <p className="text-xs font-medium text-blue-500 mb-1">Manager's Note</p>
                      {score.admin_note}
                    </div>
                  )}

                  {canManage && (
                    <div className="flex gap-2 pt-2">
                      <button className="btn-secondary text-sm" onClick={() => calcScore(u.id)} disabled={loading}>Calculate Score</button>
                      {score && <button className="btn-ghost text-sm" onClick={() => { setEditScore(score); setAdminNote(score.admin_note || ''); setShowNoteModal(true); }}>Add Review Note</button>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">🎯</p>
                  <p className="text-sm">No targets set for this month.</p>
                  {canManage && <button className="btn-primary mt-3" onClick={() => { setTargetForm({ user_id: u.id, segment: 'All', calls_target: 50, meetings_target: 10, revenue_target: 500000 }); setShowTargetModal(true); }}>Set Target</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={showTargetModal} onClose={() => setShowTargetModal(false)} title="Set Monthly Target">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={saveTarget} className="space-y-4">
          <div><label className="label">Staff Member *</label>
            <select className="select" value={targetForm.user_id} onChange={e => setTargetForm(f => ({ ...f, user_id: e.target.value }))} required>
              <option value="">— Select —</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div><label className="label">Calls Target</label><input type="number" className="input" value={targetForm.calls_target} onChange={e => setTargetForm(f => ({ ...f, calls_target: parseInt(e.target.value) || 0 }))} /></div>
          <div><label className="label">Meetings Target</label><input type="number" className="input" value={targetForm.meetings_target} onChange={e => setTargetForm(f => ({ ...f, meetings_target: parseInt(e.target.value) || 0 }))} /></div>
          <div><label className="label">Revenue Target (₹)</label><input type="number" className="input" value={targetForm.revenue_target} onChange={e => setTargetForm(f => ({ ...f, revenue_target: parseFloat(e.target.value) || 0 }))} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowTargetModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save Target'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={showNoteModal} onClose={() => setShowNoteModal(false)} title="Add Review Note" size="sm">
        <div className="space-y-4">
          <textarea className="input" rows={4} value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="Write your review note for this salesperson…" />
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowNoteModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveNote}>Save Note</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TargetBar({ label, current, target, unit, color }: { label: string; current: number; target: number; unit: string; color: string }) {
  const pct = Math.min(100, current);
  const colorClass = color === 'blue' ? 'bg-blue-500' : color === 'purple' ? 'bg-purple-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">Target: {unit === '₹' ? formatCurrency(target) : `${target} ${unit}`}</p>
    </div>
  );
}
