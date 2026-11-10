import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatCurrency } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import Modal from './Modal';

interface Line {
  label: string;
  actual: number;
  target: number;
  money?: boolean;
  period: 'today' | 'month';
}

interface PlanTargets {
  daily_agent_talks: number;
  lead_percent: number;
  monthly_agent_meetings: number;
  monthly_agent_visits: number;
  monthly_whatsapp_groups: number;
  monthly_wedding_closes: number;
  monthly_corporate_closes: number;
  monthly_revenue: number;
  daily_event_talks: number;
  daily_incoming_calls: number;
  daily_revenue: number;
}

interface TaskIncentive {
  id: string;
  task: string;
  metric: string;
  metric_label: string;
  kind: 'count' | 'revenue';
  target_value: number;
  actual: number;
  pay_type: 'percent' | 'fixed';
  rate: number;
  complete: boolean;
  earned: number;
  wallet_status: string | null;
}

interface PersonPlan {
  id: string;
  name: string;
  email: string;
  title: string;
  focus: string;
  summary: string;
  targets: PlanTargets;
  lines: Line[];
  incentives: TaskIncentive[];
}

interface Report {
  month: string;
  today: string;
  workingDays: number;
  workingDaysElapsed: number;
  week: string;
  total: number;
  page: number;
  limit: number;
  people: PersonPlan[];
}

interface TaskChoice { key: string; label: string; kind: 'count' | 'revenue'; }

const TASKS: TaskChoice[] = [
  { key: 'sales_closure', label: 'Sales closed', kind: 'revenue' },
  { key: 'wedding_revenue', label: 'Wedding revenue', kind: 'revenue' },
  { key: 'corporate_revenue', label: 'Corporate revenue', kind: 'revenue' },
  { key: 'event_revenue', label: 'Event revenue', kind: 'revenue' },
  { key: 'banquet_revenue', label: 'Banquet revenue', kind: 'revenue' },
  { key: 'rooms_revenue', label: 'Rooms revenue', kind: 'revenue' },
  { key: 'fit_revenue', label: 'FIT revenue', kind: 'revenue' },
  { key: 'wedding_closures', label: 'Weddings closed', kind: 'count' },
  { key: 'corporate_closures', label: 'Corporate closures', kind: 'count' },
  { key: 'agent_calls', label: 'Agent conversations', kind: 'count' },
  { key: 'agent_meetings', label: 'Agent meetings', kind: 'count' },
  { key: 'agent_visits', label: 'Agent visits', kind: 'count' },
  { key: 'whatsapp_groups', label: 'WhatsApp groups', kind: 'count' },
  { key: 'event_calls', label: 'Event conversations', kind: 'count' },
  { key: 'incoming_calls', label: 'Incoming calls', kind: 'count' },
];

const BLANK: PlanTargets = {
  daily_agent_talks: 0, lead_percent: 0, monthly_agent_meetings: 0, monthly_agent_visits: 0, monthly_whatsapp_groups: 0,
  monthly_wedding_closes: 0, monthly_corporate_closes: 0, monthly_revenue: 0,
  daily_event_talks: 0, daily_incoming_calls: 0, daily_revenue: 0,
};

const PRESETS: { id: string; label: string; focus: string; title: string; summary: string; targets: PlanTargets }[] = [
  { id: 'blank', label: 'Blank', focus: 'agents', title: 'Sales plan', summary: 'Targets set by admin.', targets: BLANK },
  {
    id: 'closer', label: 'Like Devraj — closer', focus: 'closer', title: 'Lead owner and event closer',
    summary: 'Owns the leads assigned to them and converts them, including event sales.', targets: BLANK,
  },
  {
    id: 'agents', label: 'Like Krishan — agent desk', focus: 'agents', title: 'Agent sales',
    summary: 'Agent conversations every working day, with a share of those becoming leads, plus monthly meetings, visits, WhatsApp groups, weddings and corporate closures.',
    targets: { ...BLANK, daily_agent_talks: 20, lead_percent: 20, monthly_agent_meetings: 50, monthly_agent_visits: 10, monthly_whatsapp_groups: 100, monthly_wedding_closes: 2, monthly_corporate_closes: 2, monthly_revenue: 1000000 },
  },
  {
    id: 'events', label: 'Like Riya — event desk', focus: 'events', title: 'Event desk',
    summary: 'Event client calls and incoming calls every working day, with a daily sales close.',
    targets: { ...BLANK, daily_event_talks: 10, daily_incoming_calls: 20, daily_revenue: 50000 },
  },
];

interface TaskDraft { task: string; metric: string; target_value: string; pay_type: 'percent' | 'fixed'; rate: string; }
const NEW_TASK: TaskDraft = { task: 'Sales closed this month', metric: 'sales_closure', target_value: '0', pay_type: 'percent', rate: '2' };

function show(line: Line) {
  if (line.money) return formatCurrency(line.actual);
  return String(line.actual);
}

function targetText(line: Line) {
  if (line.target <= 0) return '';
  return line.money ? formatCurrency(line.target) : String(line.target);
}

function measure(kind: string, n: number) {
  return kind === 'revenue' ? formatCurrency(n) : String(Math.round(n));
}

function Bar({ line }: { line: Line }) {
  if (line.target <= 0) {
    return (
      <div className="flex items-center justify-between text-sm py-1">
        <span className="text-gray-600">{line.label}</span>
        <span className="font-semibold text-gray-900">{show(line)}</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((line.actual / line.target) * 100));
  const tone = pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span>{line.label}</span>
        <span className="font-medium text-gray-900">{show(line)} / {targetText(line)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SalesPlanBoard({ month, pageSize = 12 }: { month: string; pageSize?: number }) {
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();
  const [report, setReport] = useState<Report | null>(null);
  const [draftQ, setDraftQ] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PersonPlan | null>(null);
  const [form, setForm] = useState<PlanTargets | null>(null);
  const [summary, setSummary] = useState('');
  const [creating, setCreating] = useState(false);
  const [preset, setPreset] = useState('blank');
  const [focus, setFocus] = useState('agents');
  const [title, setTitle] = useState('Sales plan');
  const [createSummary, setCreateSummary] = useState('Targets set by admin.');
  const [createTargets, setCreateTargets] = useState<PlanTargets>(BLANK);
  const [personQuery, setPersonQuery] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [taskFor, setTaskFor] = useState<PersonPlan | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDraft>(NEW_TASK);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setQ(draftQ.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [draftQ]);

  useEffect(() => { setPage(1); }, [month]);

  const load = () => {
    const params = new URLSearchParams({ month, page: String(page), limit: String(pageSize) });
    if (q) params.set('q', q);
    return api.get<Report>(`/sales-plans?${params}`).then(setReport).catch(() => setReport(null));
  };

  useEffect(() => { load(); }, [month, q, page, pageSize]);

  useEffect(() => {
    if (!creating) return;
    const t = setTimeout(() => {
      api.get<{ id: string; name: string; role: string }[]>(`/users/directory?q=${encodeURIComponent(personQuery)}&limit=20`)
        .then(setPeople)
        .catch(() => setPeople([]));
    }, 200);
    return () => clearTimeout(t);
  }, [creating, personQuery]);

  const applyPreset = (id: string) => {
    const found = PRESETS.find(p => p.id === id) || PRESETS[0];
    setPreset(id);
    setFocus(found.focus);
    setTitle(found.title);
    setCreateSummary(found.summary);
    setCreateTargets({ ...found.targets });
  };

  const openCreate = () => {
    setError('');
    applyPreset('blank');
    setChosen(null);
    setPersonQuery('');
    setCreating(true);
  };

  const saveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) { setError('Choose a person'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/sales-plans', { user_id: chosen.id, month, focus, title, summary: createSummary, ...createTargets });
      setCreating(false);
      setNotice(`Plan created for ${chosen.name}.`);
      setDraftQ(chosen.name);
      await load();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const openEdit = (person: PersonPlan) => {
    setError('');
    setEditing(person);
    setForm({ ...person.targets });
    setSummary(person.summary);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !form) return;
    setSaving(true); setError('');
    try {
      await api.put(`/sales-plans/${editing.id}`, { ...form, summary, month });
      setEditing(null);
      setNotice(`Targets saved for ${editing.name}.`);
      await load();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const removePlan = async (person: PersonPlan) => {
    if (!window.confirm(`Remove ${person.name}'s plan for this month? Incentive tasks for the month are removed. Amounts already in the wallet stay there.`)) return;
    setError('');
    try {
      await api.del(`/sales-plans/${person.id}?month=${month}`);
      setNotice(`Plan removed for ${person.name}.`);
      await load();
    } catch (err: any) { setError(err.message); }
  };

  const openTask = (person: PersonPlan, existing?: TaskIncentive) => {
    setError('');
    setTaskFor(person);
    setTaskId(existing?.id || null);
    setTask(existing ? {
      task: existing.task,
      metric: existing.metric,
      target_value: String(existing.target_value),
      pay_type: existing.pay_type,
      rate: String(existing.rate),
    } : NEW_TASK);
  };

  const taskKind = TASKS.find(t => t.key === task.metric)?.kind || 'revenue';

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFor) return;
    setSaving(true); setError('');
    const body = { ...task, target_value: Number(task.target_value) || 0, rate: Number(task.rate), month };
    try {
      if (taskId) await api.put(`/sales-plans/${taskFor.id}/incentives/${taskId}`, body);
      else await api.post(`/sales-plans/${taskFor.id}/incentives`, body);
      setNotice(taskId ? `Incentive updated for ${taskFor.name}.` : `Incentive set for ${taskFor.name}. It is paid only when the task is done.`);
      setTaskFor(null);
      await load();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const removeTask = async (person: PersonPlan, item: TaskIncentive) => {
    if (!window.confirm(`Remove “${item.task}” for ${person.name}?`)) return;
    try {
      await api.del(`/sales-plans/${person.id}/incentives/${item.id}`);
      setNotice('Incentive task removed.');
      await load();
    } catch (err: any) { setError(err.message); }
  };

  const postTask = async (person: PersonPlan, item: TaskIncentive) => {
    setSaving(true); setError('');
    try {
      const res = await api.post<{ amount: number; updated: boolean }>(`/sales-plans/${person.id}/incentives/${item.id}/post`, {});
      setNotice(`${formatCurrency(res.amount)} ${res.updated ? 'updated in' : 'added to'} ${person.name}'s wallet. Approve it before it is paid.`);
      await load();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  if (!report) return null;
  if (!admin && report.people.length === 0) return null;

  const pages = Math.max(1, Math.ceil((report.total || 0) / (report.limit || pageSize)));

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sales team plan</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {report.total || 0} {report.total === 1 ? 'person has' : 'people have'} a plan this month.
            {' '}{report.workingDays} working days ({report.week}), {report.workingDaysElapsed} passed.
            {admin && ' Add a plan for any person. An incentive is a task: when it is done, pay a percentage of the sales they closed, or a fixed amount.'}
          </p>
        </div>
        {admin && (
          <div className="flex gap-2">
            <input className="input w-44" placeholder="Search a person" value={draftQ} onChange={e => setDraftQ(e.target.value)} />
            <button type="button" className="btn-primary whitespace-nowrap" onClick={openCreate}>+ Add person</button>
          </div>
        )}
      </div>
      {error && !creating && !editing && !taskFor && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{notice} {notice.toLowerCase().includes('wallet') && <Link to="/wallet" className="underline">Open wallet</Link>}</div>}
      {report.people.length === 0 && (
        <div className="card text-sm text-gray-600">
          {q ? `No plan matches “${q}”.` : 'No plans for this month yet.'}
          {admin && ' Use Add person to set targets for someone on the team.'}
        </div>
      )}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        {report.people.map(person => {
          const today = person.lines.filter(l => l.period === 'today');
          const monthLines = person.lines.filter(l => l.period === 'month');
          return (
            <div key={person.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-gray-900">{person.name}</p>
                  <p className="text-xs text-blue-700 font-medium">{person.title}</p>
                </div>
                {admin && (
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button type="button" className="btn-secondary text-xs px-2 py-1" onClick={() => openEdit(person)}>Edit target</button>
                    <button type="button" className="btn-primary text-xs px-2 py-1" onClick={() => openTask(person)}>Add incentive</button>
                    <button type="button" className="text-xs text-red-600 px-1" onClick={() => removePlan(person)}>Remove</button>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-3">{person.summary}</p>
              {today.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Today</p>
                  {today.map(line => <Bar key={line.label + line.period} line={line} />)}
                </div>
              )}
              {monthLines.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">This month</p>
                  {monthLines.map(line => <Bar key={line.label + line.period} line={line} />)}
                </div>
              )}
              {person.incentives?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Incentive when the task is done</p>
                  {person.incentives.map(item => (
                    <div key={item.id} className="rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-sm font-medium text-gray-900">{item.task}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {item.metric_label}: {measure(item.kind, item.actual)}
                        {item.target_value > 0 ? ` / ${measure(item.kind, item.target_value)}` : item.pay_type === 'percent' ? ' · on every rupee closed' : ''}
                        {item.complete ? ' · done' : ' · not yet'}
                      </p>
                      <p className="text-sm text-gray-800 mt-1">
                        {item.pay_type === 'percent' ? `${item.rate}% of ${item.metric_label.toLowerCase()}` : `${formatCurrency(item.rate)} fixed`}
                        {' · '}{item.earned > 0 ? `earned ${formatCurrency(item.earned)}` : 'nothing earned yet'}
                        {item.wallet_status ? ` · in wallet (${item.wallet_status})` : ''}
                      </p>
                      {admin && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {item.earned > 0 && item.wallet_status !== 'approved' && item.wallet_status !== 'paid' && (
                            <button type="button" className="btn-primary text-xs px-2 py-1" disabled={saving} onClick={() => postTask(person, item)}>
                              {item.wallet_status === 'added' ? 'Update wallet' : 'Add to wallet'}
                            </button>
                          )}
                          <button type="button" className="btn-secondary text-xs px-2 py-1" onClick={() => openTask(person, item)}>Edit</button>
                          <button type="button" className="text-xs text-red-600" onClick={() => removeTask(person, item)}>Remove</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
          <span className="text-gray-500">Page {page} of {pages}</span>
          <button type="button" className="btn-secondary" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      <Modal open={!!editing && !!form} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}'s targets` : 'Edit targets'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-3 text-sm">{error}</div>}
        {form && (
          <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <p className="sm:col-span-2 text-xs text-gray-500">These numbers are for {month}. Daily targets are per working day, Monday to Saturday. Set a number to 0 to drop that line.</p>
            <TargetFields form={form} setForm={setForm} />
            <label className="sm:col-span-2 text-sm"><span className="label">What this person is expected to do</span>
              <textarea className="input" rows={3} value={summary} onChange={e => setSummary(e.target.value)} />
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save targets'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add a person’s plan" size="xl">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-3 text-sm">{error}</div>}
        <form onSubmit={saveCreate} className="space-y-3">
          <p className="text-xs text-gray-500">Same kind of plan as Devraj, Krishan, Vivek and Riya. Pick anyone in the company. This is for {month}.</p>
          <label className="text-sm block"><span className="label">Person</span>
            <input className="input" placeholder="Type a name" value={chosen ? chosen.name : personQuery} onChange={e => { setChosen(null); setPersonQuery(e.target.value); }} />
          </label>
          {!chosen && (
            <div className="max-h-36 overflow-auto border border-gray-200 rounded-lg">
              {people.map(p => (
                <button type="button" key={p.id} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setChosen(p); setPersonQuery(''); }}>
                  {p.name} <span className="text-gray-400">{p.role}</span>
                </button>
              ))}
              {people.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No one matches.</p>}
            </div>
          )}
          <label className="text-sm block"><span className="label">Start from</span>
            <select className="input" value={preset} onChange={e => applyPreset(e.target.value)}>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm"><span className="label">Role on the plan</span>
              <select className="input" value={focus} onChange={e => setFocus(e.target.value)}>
                <option value="closer">Closer — owns assigned leads</option>
                <option value="agents">Agent sales</option>
                <option value="events">Event desk</option>
              </select>
            </label>
            <label className="text-sm"><span className="label">Title</span>
              <input className="input" required value={title} onChange={e => setTitle(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TargetFields form={createTargets} setForm={setCreateTargets} />
          </div>
          <label className="text-sm block"><span className="label">What they are expected to do</span>
            <textarea className="input" rows={2} value={createSummary} onChange={e => setCreateSummary(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-primary" disabled={saving || !chosen}>{saving ? 'Saving…' : 'Create plan'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!taskFor} onClose={() => setTaskFor(null)} title={taskFor ? `${taskId ? 'Edit' : 'Add'} incentive for ${taskFor.name}` : 'Incentive'} size="lg">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-3 text-sm">{error}</div>}
        <form onSubmit={saveTask} className="space-y-3">
          <p className="text-xs text-gray-500">Write the task they must finish. Then choose how it is paid: a percentage of the sales they closed, or one fixed amount when the task is complete. This is for {month}.</p>
          <label className="text-sm block"><span className="label">What must be completed</span>
            <input className="input" required value={task.task} onChange={e => setTask(f => ({ ...f, task: e.target.value }))} placeholder="Close ₹10 lakh this month" />
          </label>
          <label className="text-sm block"><span className="label">Measured by</span>
            <select className="input" value={task.metric} onChange={e => {
              const next = TASKS.find(t => t.key === e.target.value);
              setTask(f => ({ ...f, metric: e.target.value, pay_type: next?.kind === 'count' ? 'fixed' : f.pay_type }));
            }}>
              {TASKS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-sm block"><span className="label">{taskKind === 'revenue' ? 'Reach this revenue (₹) before it pays' : 'Reach this number before it pays'}</span>
            <input className="input" type="number" min="0" value={task.target_value} onChange={e => setTask(f => ({ ...f, target_value: e.target.value }))} />
          </label>
          <p className="text-xs text-gray-500">
            {task.pay_type === 'percent' && Number(task.target_value) <= 0
              ? 'Leave this at 0 to pay the percentage on every rupee they close.'
              : task.pay_type === 'percent'
                ? 'The percentage is paid only after they reach this.'
                : 'The fixed amount is paid once, when they reach this.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="label">Pay as</span>
              <select className="input" value={task.pay_type} onChange={e => setTask(f => ({ ...f, pay_type: e.target.value as 'percent' | 'fixed' }))}>
                <option value="percent" disabled={taskKind === 'count'}>Percentage of what they closed</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>
            <label className="text-sm"><span className="label">{task.pay_type === 'percent' ? 'Percent' : 'Amount (₹)'}</span>
              <input className="input" required type="number" min="0.01" step="0.01" value={task.rate} onChange={e => setTask(f => ({ ...f, rate: e.target.value }))} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setTaskFor(null)}>Cancel</button>
            <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save incentive'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function TargetFields({ form, setForm }: { form: PlanTargets; setForm: (next: PlanTargets) => void }) {
  return (
    <>
      <Field label="Agent conversations / day" value={form.daily_agent_talks} onChange={v => setForm({ ...form, daily_agent_talks: v })} />
      <Field label="Leads from those talks (%)" value={form.lead_percent} onChange={v => setForm({ ...form, lead_percent: v })} />
      <Field label="Agent meetings / month" value={form.monthly_agent_meetings} onChange={v => setForm({ ...form, monthly_agent_meetings: v })} />
      <Field label="Agent visits / month" value={form.monthly_agent_visits} onChange={v => setForm({ ...form, monthly_agent_visits: v })} />
      <Field label="WhatsApp groups / month" value={form.monthly_whatsapp_groups} onChange={v => setForm({ ...form, monthly_whatsapp_groups: v })} />
      <Field label="Weddings closed / month" value={form.monthly_wedding_closes} onChange={v => setForm({ ...form, monthly_wedding_closes: v })} />
      <Field label="Corporate closures / month" value={form.monthly_corporate_closes} onChange={v => setForm({ ...form, monthly_corporate_closes: v })} />
      <Field label="Revenue target (₹ / month)" value={form.monthly_revenue} onChange={v => setForm({ ...form, monthly_revenue: v })} />
      <Field label="Event conversations / day" value={form.daily_event_talks} onChange={v => setForm({ ...form, daily_event_talks: v })} />
      <Field label="Incoming calls / day" value={form.daily_incoming_calls} onChange={v => setForm({ ...form, daily_incoming_calls: v })} />
      <Field label="Sales closed / day (₹)" value={form.daily_revenue} onChange={v => setForm({ ...form, daily_revenue: v })} />
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-sm"><span className="label">{label}</span>
      <input className="input" type="number" min="0" value={value} onChange={e => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}
