import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { currentMonth, formatCurrency, formatDateTime } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Metric {
  key: string; label: string; kind: 'count' | 'revenue'; hint: string;
  actual: number; target: number; weight: number; achievement: number; points: number;
}
interface EventRow { id: string; action: string; actor_name: string | null; amount: number; note: string; created_at: string; }
interface Txn {
  id: string; scope: string; user_id: string | null; employee_name: string | null; month: string;
  title: string; metric: string | null; amount: number; status: 'added' | 'approved' | 'paid';
  maker_name: string | null; approved_name: string | null; paid_name: string | null;
  approved_at: string | null; paid_at: string | null; note: string; created_at: string;
  events: EventRow[];
}
interface Person { id: string; name: string; role: string; added: number; approved: number; paid: number; score: number; }
interface Rule { id: string; scope: string; metric: string; name: string; calc: string; rate: number; active: number; }
interface Payload {
  month: string;
  me: { id: string; name: string; role: string };
  subject: { id: string; name: string; role: string };
  wallet: { name: string; added: number; approved: number; paid: number };
  teamWallet: { added: number; approved: number; paid: number };
  people: Person[];
  scorecard: { name: string; score: number; metrics: Metric[] };
  teamScore: { score: number; metrics: Metric[] };
  transactions: Txn[];
  rules: Rule[];
  metrics: { key: string; label: string; kind: string; hint: string }[];
}

const STATUS: Record<string, string> = {
  added: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
};

function moneyOrCount(kind: string, n: number) {
  return kind === 'revenue' ? formatCurrency(n) : String(Math.round(n));
}

function calcLabel(calc: string, rate: number) {
  if (calc === 'percent') return `${rate}% of revenue`;
  if (calc === 'on_target') return `${formatCurrency(rate)} when target is hit`;
  return `${formatCurrency(rate)} each`;
}

export default function Wallet() {
  const { isAdmin, isManager } = useAuthStore();
  const canManage = isAdmin() || isManager();
  const [month, setMonth] = useState(currentMonth());
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState('');
  const [allHistory, setAllHistory] = useState(false);
  const [tab, setTab] = useState<'wallet' | 'score' | 'rules'>('wallet');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const [trail, setTrail] = useState<Txn | null>(null);
  const [addForm, setAddForm] = useState({ scope: 'individual', user_id: '', title: '', metric: 'corporate_closures', amount: '', note: '' });
  const [targetScope, setTargetScope] = useState<'individual' | 'team'>('individual');
  const [targetUser, setTargetUser] = useState('');
  const [targetDraft, setTargetDraft] = useState<Record<string, { target_value: string; weight: string }>>({});
  const [ruleForm, setRuleForm] = useState({ scope: 'individual', metric: 'corporate_closures', name: '', calc: 'per_unit', rate: '' });

  const load = async () => {
    const q = new URLSearchParams({ month });
    if (userId) q.set('user_id', userId);
    if (status) q.set('status', status);
    if (scope) q.set('scope', scope);
    if (allHistory) q.set('all', '1');
    const res = await api.get<Payload>(`/incentives?${q.toString()}`);
    setData(res);
    return res;
  };

  useEffect(() => { load().catch((e: any) => setError(e.message)); }, [month, userId, status, scope, allHistory]);

  const act = async (path: string) => {
    setBusy(true); setError('');
    try { await api.post(path, {}); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const saveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/incentives', { ...addForm, amount: Number(addForm.amount), month, user_id: addForm.scope === 'team' ? null : addForm.user_id });
      setShowAdd(false);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const openTargets = (which: 'individual' | 'team') => {
    if (!data) return;
    setTargetScope(which);
    const src = which === 'team' ? data.teamScore.metrics : data.scorecard.metrics;
    const draft: Record<string, { target_value: string; weight: string }> = {};
    src.forEach(m => { draft[m.key] = { target_value: String(m.target || ''), weight: String(m.weight || 10) }; });
    setTargetDraft(draft);
    setTargetUser(which === 'individual' ? (userId || data.subject.id) : '');
    setShowTargets(true);
  };

  const saveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setBusy(true); setError('');
    try {
      const targets = data.metrics.map(m => ({
        metric: m.key,
        target_value: Number(targetDraft[m.key]?.target_value || 0),
        weight: Number(targetDraft[m.key]?.weight || 10),
      }));
      await api.post('/incentives/targets', {
        scope: targetScope,
        user_id: targetScope === 'individual' ? (targetUser || data.subject.id) : undefined,
        month,
        targets,
      });
      setShowTargets(false);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/incentives/rules', { ...ruleForm, rate: Number(ruleForm.rate) });
      setShowRule(false);
      setRuleForm({ scope: 'individual', metric: 'corporate_closures', name: '', calc: 'per_unit', rate: '' });
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const buildFromRules = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.post<{ created: number }>('/incentives/calculate', { month });
      await load();
      setError(res.created ? '' : 'Nothing new to add. Rules already have a line for this month, or the score is still zero.');
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (!data) return <div className="text-gray-500 py-16 text-center">Loading wallet…</div>;

  const metricName = (key: string | null) => data.metrics.find(m => m.key === key)?.label || '';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Incentive wallet</h1>
          <p className="text-sm text-gray-500 mt-1">Personal payouts and the shared team pool. Every line keeps who added it, who approved it, and when it was paid.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" className="input w-36" value={month} onChange={e => setMonth(e.target.value)} />
          {canManage && (
            <>
              <button className="btn-primary" onClick={() => { setAddForm(f => ({ ...f, user_id: data.people[0]?.id || '' })); setShowAdd(true); }}>+ Add incentive</button>
              <button className="btn-secondary" disabled={busy} onClick={buildFromRules}>Build from rules</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">{error}</div>}

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {(['wallet', 'score', 'rules'] as const).filter(t => t !== 'rules' || canManage).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {t === 'wallet' ? 'Wallet' : t === 'score' ? 'Target score' : 'Rules'}
          </button>
        ))}
      </div>

      {tab === 'wallet' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <WalletCard title={`${data.wallet.name} · added`} amount={data.wallet.added} tone="amber" hint="Waiting for approval" />
            <WalletCard title={`${data.wallet.name} · approved`} amount={data.wallet.approved} tone="blue" hint="In the wallet, not paid yet" />
            <WalletCard title={`${data.wallet.name} · paid`} amount={data.wallet.paid} tone="green" hint="Already paid out" />
            <WalletCard title="Team · added" amount={data.teamWallet.added} tone="amber" hint="Shared pool, not approved" />
            <WalletCard title="Team · approved" amount={data.teamWallet.approved} tone="blue" hint="Shared pool in the wallet" />
            <WalletCard title="Team · paid" amount={data.teamWallet.paid} tone="green" hint="Shared pool already paid" />
          </div>

          {canManage && data.people.length > 1 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-3">Every employee this month</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="py-2 pr-3">Employee</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Added</th>
                      <th className="py-2 pr-3">Approved</th>
                      <th className="py-2">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map(p => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="py-2 pr-3">
                          <button className="font-medium text-blue-700" onClick={() => setUserId(p.id)}>{p.name}</button>
                          <span className="text-xs text-gray-400 ml-2 capitalize">{p.role}</span>
                        </td>
                        <td className="py-2 pr-3 font-semibold">{p.score.toFixed(0)}</td>
                        <td className="py-2 pr-3">{formatCurrency(p.added)}</td>
                        <td className="py-2 pr-3">{formatCurrency(p.approved)}</td>
                        <td className="py-2">{formatCurrency(p.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canManage && (
              <select className="input w-auto" value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">All transactions</option>
                {data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Added, approved, paid</option>
              <option value="added">Added</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
            <select className="input w-auto" value={scope} onChange={e => setScope(e.target.value)}>
              <option value="">Individual and team</option>
              <option value="individual">Individual</option>
              <option value="team">Team</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 px-2">
              <input type="checkbox" checked={allHistory} onChange={e => setAllHistory(e.target.checked)} />
              All months
            </label>
          </div>

          <div className="space-y-3">
            {data.transactions.length === 0 && <div className="card text-sm text-gray-500">No incentives for this filter.</div>}
            {data.transactions.map(tx => (
              <div key={tx.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS[tx.status]}`}>{tx.status}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tx.scope === 'team' ? 'Team' : 'Individual'}</span>
                      <span className="text-xs text-gray-400">{tx.month}</span>
                    </div>
                    <p className="font-semibold text-gray-900 mt-1">{tx.title}</p>
                    <p className="text-sm text-gray-500">
                      {tx.scope === 'team' ? 'Team pool' : tx.employee_name}
                      {tx.metric ? ` · ${metricName(tx.metric)}` : ''}
                    </p>
                    <p className="text-sm text-gray-700 mt-1"><span className="text-gray-500">Incentive maker:</span> {tx.maker_name || '—'}</p>
                    {tx.note && <p className="text-xs text-gray-500 mt-1">{tx.note}</p>}
                  </div>
                  <p className="text-lg font-bold text-gray-900 whitespace-nowrap">{formatCurrency(tx.amount)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button className="text-xs text-blue-700 font-medium" onClick={() => setTrail(tx)}>Transaction history</button>
                  {canManage && tx.status === 'added' && <button disabled={busy} className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg" onClick={() => act(`/incentives/${tx.id}/approve`)}>Approve</button>}
                  {canManage && tx.status === 'approved' && <button disabled={busy} className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg" onClick={() => act(`/incentives/${tx.id}/pay`)}>Mark paid</button>}
                  {canManage && tx.status === 'added' && <button disabled={busy} className="text-xs text-red-600" onClick={() => actDelete(tx.id)}>Remove</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'score' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            {canManage && (
              <select className="input w-auto" value={data.people.some(p => p.id === userId) ? userId : (data.people.some(p => p.id === data.subject.id) ? data.subject.id : '')} onChange={e => setUserId(e.target.value)}>
                {!data.people.some(p => p.id === data.subject.id) && <option value="">Choose an employee</option>}
                {data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {canManage && <button className="btn-secondary" onClick={() => openTargets('individual')}>Set individual targets</button>}
            {canManage && <button className="btn-secondary" onClick={() => openTargets('team')}>Set team targets</button>}
          </div>
          {data.people.some(p => p.id === data.subject.id) || data.people.some(p => p.id === userId) ? (
            <ScorePanel title={`${data.scorecard.name} · target score`} score={data.scorecard.score} metrics={data.scorecard.metrics} />
          ) : (
            <div className="card text-sm text-gray-500">Choose an employee to see an individual target score. The team score is below.</div>
          )}
          <ScorePanel title="Team · target score" score={data.teamScore.score} metrics={data.teamScore.metrics} />
          <p className="text-xs text-gray-500">Score is the weighted average of how close each number is to its target, capped at 100. Closures and revenue come from Closed Won leads in the selected month.</p>
        </div>
      )}

      {tab === 'rules' && canManage && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setShowRule(true)}>+ Add rule</button>
          </div>
          {data.rules.map(rule => (
            <div key={rule.id} className="card flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{rule.name}</p>
                <p className="text-sm text-gray-500 capitalize">{rule.scope} · {metricName(rule.metric)} · {calcLabel(rule.calc, rule.rate)}</p>
              </div>
              <button
                className={`text-xs font-semibold px-2 py-1 rounded-full ${rule.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                onClick={async () => { await api.put(`/incentives/rules/${rule.id}`, { active: rule.active ? 0 : 1 }); load(); }}
              >
                {rule.active ? 'On' : 'Off'}
              </button>
            </div>
          ))}
          <p className="text-xs text-gray-500">“Build from rules” adds one incentive per employee (or one team line) when the month’s score produces an amount. It will not add the same rule twice.</p>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add incentive">
        <form className="space-y-3" onSubmit={saveAdd}>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="label">For</span>
              <select className="input" value={addForm.scope} onChange={e => setAddForm(f => ({ ...f, scope: e.target.value }))}>
                <option value="individual">One employee</option>
                <option value="team">Whole team</option>
              </select>
            </label>
            {addForm.scope === 'individual' && (
              <label className="text-sm"><span className="label">Employee</span>
                <select className="input" required value={addForm.user_id} onChange={e => setAddForm(f => ({ ...f, user_id: e.target.value }))}>
                  <option value="">Select</option>
                  {data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="text-sm block"><span className="label">Title</span>
            <input className="input" required value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="Wedding closure — November" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="label">Linked score</span>
              <select className="input" value={addForm.metric} onChange={e => setAddForm(f => ({ ...f, metric: e.target.value }))}>
                {data.metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="label">Amount (₹)</span>
              <input className="input" required type="number" min="1" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
            </label>
          </div>
          <label className="text-sm block"><span className="label">Note</span>
            <textarea className="input" rows={2} value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} />
          </label>
          <p className="text-xs text-gray-500">This is saved as Added. You are the incentive maker. Approve it before it can be paid.</p>
          <button className="btn-primary" disabled={busy}>Save</button>
        </form>
      </Modal>

      <Modal open={showTargets} onClose={() => setShowTargets(false)} title={targetScope === 'team' ? 'Team targets' : 'Individual targets'} size="lg">
        <form onSubmit={saveTargets} className="space-y-3">
          {targetScope === 'individual' && (
            <select className="input" value={targetUser} onChange={e => setTargetUser(e.target.value)}>
              {data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <p className="text-xs text-gray-500">Month {month}. Weight is how much that line counts in the target score.</p>
          {data.metrics.map(m => (
            <div key={m.key} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div className="text-sm font-medium text-gray-800">{m.label}</div>
              <label className="text-xs text-gray-500">Target
                <input className="input" type="number" min="0" value={targetDraft[m.key]?.target_value || ''} onChange={e => setTargetDraft(d => ({ ...d, [m.key]: { ...d[m.key], target_value: e.target.value } }))} />
              </label>
              <label className="text-xs text-gray-500">Weight
                <input className="input" type="number" min="1" value={targetDraft[m.key]?.weight || ''} onChange={e => setTargetDraft(d => ({ ...d, [m.key]: { ...d[m.key], weight: e.target.value } }))} />
              </label>
            </div>
          ))}
          <button className="btn-primary" disabled={busy}>Save targets</button>
        </form>
      </Modal>

      <Modal open={showRule} onClose={() => setShowRule(false)} title="Incentive rule">
        <form className="space-y-3" onSubmit={saveRule}>
          <label className="text-sm block"><span className="label">Name</span>
            <input className="input" required value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="label">Applies to</span>
              <select className="input" value={ruleForm.scope} onChange={e => setRuleForm(f => ({ ...f, scope: e.target.value }))}>
                <option value="individual">Each employee</option>
                <option value="team">Team pool</option>
              </select>
            </label>
            <label className="text-sm"><span className="label">Score</span>
              <select className="input" value={ruleForm.metric} onChange={e => setRuleForm(f => ({ ...f, metric: e.target.value }))}>
                {data.metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="label">How it pays</span>
              <select className="input" value={ruleForm.calc} onChange={e => setRuleForm(f => ({ ...f, calc: e.target.value }))}>
                <option value="per_unit">Amount per closure or per rupee</option>
                <option value="percent">Percent of revenue</option>
                <option value="on_target">Flat amount when target is met</option>
              </select>
            </label>
            <label className="text-sm"><span className="label">Rate</span>
              <input className="input" required type="number" min="0" step="0.01" value={ruleForm.rate} onChange={e => setRuleForm(f => ({ ...f, rate: e.target.value }))} />
            </label>
          </div>
          <button className="btn-primary" disabled={busy}>Save rule</button>
        </form>
      </Modal>

      <Modal open={!!trail} onClose={() => setTrail(null)} title="Transaction history">
        {trail && (
          <div className="space-y-3">
            <p className="font-semibold">{trail.title}</p>
            <p className="text-sm text-gray-500">{formatCurrency(trail.amount)} · {trail.scope === 'team' ? 'Team' : trail.employee_name}</p>
            <ol className="space-y-3">
              {trail.events.map(ev => (
                <li key={ev.id} className="border-l-2 border-blue-200 pl-3">
                  <p className="text-sm font-semibold capitalize text-gray-900">{ev.action}</p>
                  <p className="text-sm text-gray-600">{ev.actor_name || '—'} · {formatDateTime(ev.created_at)}</p>
                  {ev.note && <p className="text-xs text-gray-500">{ev.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Modal>
    </div>
  );

  async function actDelete(id: string) {
    setBusy(true); setError('');
    try { await api.del(`/incentives/${id}`); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
}

function WalletCard({ title, amount, hint, tone }: { title: string; amount: number; hint: string; tone: 'amber' | 'blue' | 'green' }) {
  const ring = tone === 'amber' ? 'border-amber-200' : tone === 'blue' ? 'border-blue-200' : 'border-emerald-200';
  return (
    <div className={`card border ${ring}`}>
      <p className="text-xs font-medium text-gray-500">{title}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(amount)}</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
}

function ScorePanel({ title, score, metrics }: { title: string; score: number; metrics: Metric[] }) {
  return (
    <div className="card">
      <div className="flex items-end justify-between mb-4">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <p className="text-3xl font-black text-blue-700">{score.toFixed(0)}<span className="text-base font-medium text-gray-400">/100</span></p>
      </div>
      <div className="space-y-3">
        {metrics.map(m => (
          <div key={m.key}>
            <div className="flex justify-between text-sm gap-3">
              <span className="font-medium text-gray-800">{m.label}</span>
              <span className="text-gray-500 whitespace-nowrap">{moneyOrCount(m.kind, m.actual)} / {m.target > 0 ? moneyOrCount(m.kind, m.target) : '—'}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
              <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, m.achievement || 0)}%` }} />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{m.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
