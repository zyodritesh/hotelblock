import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { dialNumber, openWhatsApp } from '../lib/phone';
import { useAuthStore } from '../store/auth';

interface Plan {
  id: string;
  user_id: string;
  user_name: string;
  city: string;
  title: string;
  start_date: string;
  end_date: string;
  notes: string;
  status: string;
  stages?: Record<string, number>;
}

interface Stop {
  id: string;
  agent_id: string | null;
  agent_name: string;
  agency_name: string;
  phone: string;
  stage: string;
  meet_date: string | null;
  meet_time: string;
  call_note: string;
  outcome_note: string;
}

interface AgentHit { id: string; name: string; agency_name: string; city: string; phone: string; }

const STAGES = [
  { id: 'planned', label: 'Meeting planned' },
  { id: 'to_schedule', label: 'To be scheduled' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'met', label: 'Met' },
  { id: 'missed', label: 'Missed' },
];

function dayLabel(value?: string | null) {
  if (!value) return '';
  const [year, month, date] = value.split('-').map(Number);
  if (!year || !month || !date) return value;
  return new Date(year, month - 1, date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function stageLabel(id: string) {
  return STAGES.find(stage => stage.id === id)?.label || id;
}

export default function Travel() {
  const { isManager } = useAuthStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [staff, setStaff] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [plan, setPlan] = useState<(Plan & { stops: Stop[] }) | null>(null);
  const [error, setError] = useState('');
  const [city, setCity] = useState('');
  const [start, setStart] = useState('2026-11-17');
  const [end, setEnd] = useState('2026-11-20');
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [stopQuery, setStopQuery] = useState('');
  const [agentQuery, setAgentQuery] = useState('');
  const [agents, setAgents] = useState<AgentHit[]>([]);
  const [picked, setPicked] = useState<AgentHit | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agency, setAgency] = useState('');
  const [phone, setPhone] = useState('');
  const [meetDate, setMeetDate] = useState('');
  const [meetTime, setMeetTime] = useState('');
  const [callNote, setCallNote] = useState('');
  const [stage, setStage] = useState('planned');

  const loadPlans = () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (staff) params.set('user_id', staff);
    const qs = params.toString();
    api.get<Plan[]>(`/travel${qs ? `?${qs}` : ''}`).then(setPlans).catch((err: Error) => setError(err.message));
  };

  const loadPlan = (id: string) => {
    api.get<Plan & { stops: Stop[] }>(`/travel/${id}`).then(row => {
      setPlan(row);
      setMeetDate(row.start_date);
    }).catch((err: Error) => setError(err.message));
  };

  useEffect(() => { loadPlans(); }, [query, staff]);
  useEffect(() => { if (isManager()) api.get<{ id: string; name: string }[]>('/users').then(setUsers).catch(() => {}); }, []);
  useEffect(() => { if (openId) loadPlan(openId); }, [openId]);

  useEffect(() => {
    if (!plan || agentQuery.trim().length < 2) { setAgents([]); return; }
    const handle = setTimeout(() => {
      api.get<AgentHit[]>(`/travel/agents?q=${encodeURIComponent(agentQuery.trim())}&city=${encodeURIComponent(plan.city)}`)
        .then(setAgents).catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [agentQuery, plan?.city]);

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = await api.post<Plan>('/travel', { city, start_date: start, end_date: end, notes: note, user_id: owner || undefined });
      setCity(''); setNote('');
      setOpenId(created.id);
      loadPlans();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const addStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    setError('');
    setBusy(true);
    try {
      await api.post(`/travel/${plan.id}/stops`, {
        agent_id: picked?.id || '',
        agent_name: picked?.name || agentName,
        agency_name: picked?.agency_name || agency,
        phone: picked?.phone || phone,
        stage, meet_date: meetDate, meet_time: meetTime, call_note: callNote,
      });
      setPicked(null); setAgentQuery(''); setAgentName(''); setAgency(''); setPhone(''); setMeetTime(''); setCallNote(''); setStage('planned');
      loadPlan(plan.id);
      loadPlans();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const moveStop = async (stop: Stop, next: string, extra: Partial<Stop> = {}) => {
    if (!plan) return;
    setError('');
    try {
      await api.put(`/travel/${plan.id}/stops/${stop.id}`, {
        stage: next,
        meet_date: extra.meet_date ?? stop.meet_date ?? '',
        meet_time: extra.meet_time ?? stop.meet_time ?? '',
        call_note: extra.call_note ?? stop.call_note ?? '',
        outcome_note: extra.outcome_note ?? stop.outcome_note ?? '',
      });
      loadPlan(plan.id);
      loadPlans();
    } catch (err: any) { setError(err.message); }
  };

  const removeStop = async (stop: Stop) => {
    if (!plan) return;
    await api.del(`/travel/${plan.id}/stops/${stop.id}`);
    loadPlan(plan.id);
    loadPlans();
  };

  const visibleStops = (plan?.stops || []).filter(stop => {
    const needle = stopQuery.trim().toLowerCase();
    if (!needle) return true;
    return `${stop.agent_name} ${stop.agency_name} ${stop.phone} ${stageLabel(stop.stage)}`.toLowerCase().includes(needle);
  });

  if (plan && openId) {
    return (
      <div className="max-w-3xl space-y-4">
        <button className="text-sm text-blue-600" onClick={() => { setOpenId(null); setPlan(null); loadPlans(); }}>← All travel plans</button>
        <div>
          <h1 className="page-title">{plan.city}</h1>
          <p className="text-sm text-stone-500 mt-1">{dayLabel(plan.start_date)} to {dayLabel(plan.end_date)} · {plan.user_name}</p>
          {plan.notes && <p className="text-sm text-stone-600 mt-1">{plan.notes}</p>}
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

        <form onSubmit={addStop} className="card space-y-3">
          <p className="text-sm font-semibold text-stone-900">Add who he is meeting</p>
          <input className="input" placeholder="Search an agent by name, agency, or city" value={picked ? picked.name : agentQuery} onChange={e => { setPicked(null); setAgentQuery(e.target.value); setAgentName(e.target.value); }} />
          {!picked && agents.length > 0 && (
            <div className="rounded-xl border border-stone-200 divide-y divide-stone-100">
              {agents.map(agent => (
                <button type="button" key={agent.id} className="w-full text-left px-3 py-2 text-sm" onClick={() => { setPicked(agent); setAgentName(agent.name); setAgency(agent.agency_name || ''); setPhone(agent.phone || ''); setAgents([]); }}>
                  <span className="font-medium text-stone-900">{agent.name}</span>
                  <span className="block text-xs text-stone-500">{[agent.agency_name, agent.city].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
          {!picked && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className="input" placeholder="Agency, if this agent is new" value={agency} onChange={e => setAgency(e.target.value)} />
              <input className="input" placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="input" min={plan.start_date} max={plan.end_date} value={meetDate} onChange={e => setMeetDate(e.target.value)} />
            <input type="time" className="input" value={meetTime} onChange={e => setMeetTime(e.target.value)} />
          </div>
          <textarea className="input" rows={2} placeholder="What was said on the call" value={callNote} onChange={e => setCallNote(e.target.value)} />
          <select className="select" value={stage} onChange={e => setStage(e.target.value)}>
            {STAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button className="btn-primary" disabled={busy || (!picked && !agentName.trim())}>{busy ? 'Saving…' : 'Add to this trip'}</button>
        </form>

        <div className="space-y-2">
          <input className="input" placeholder="Search who, agency, or stage" value={stopQuery} onChange={e => setStopQuery(e.target.value)} />
          {STAGES.map(item => {
            const rows = visibleStops.filter(stop => stop.stage === item.id);
            if (!rows.length) return null;
            return (
              <section key={item.id} className="space-y-2">
                <h2 className="text-sm font-semibold text-stone-700">{item.label} · {rows.length}</h2>
                {rows.map(stop => <StopCard key={stop.id} stop={stop} plan={plan} onMove={moveStop} onRemove={removeStop} />)}
              </section>
            );
          })}
          {visibleStops.length === 0 && <p className="text-sm text-stone-500">No meeting matches this search. Add the agent above.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="page-title">Travel plans</h1>
        <p className="text-sm text-stone-500 mt-1">Plan the city and the dates, then add each agent: meeting planned, still to be scheduled, or confirmed with a time.</p>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={createPlan} className="card space-y-3">
        <p className="text-sm font-semibold text-stone-900">New trip</p>
        <input className="input" required placeholder="City, for example Ahmedabad" value={city} onChange={e => setCity(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-stone-500">From
            <input type="date" className="input mt-1" required value={start} onChange={e => setStart(e.target.value)} />
          </label>
          <label className="text-xs text-stone-500">To
            <input type="date" className="input mt-1" required value={end} onChange={e => setEnd(e.target.value)} />
          </label>
        </div>
        {isManager() && (
          <select className="select" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">This trip is mine</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        )}
        <textarea className="input" rows={2} placeholder="What this trip is for" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save travel plan'}</button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input className="input" placeholder="Search city or person" value={query} onChange={e => setQuery(e.target.value)} />
        {isManager() && (
          <select className="select" value={staff} onChange={e => setStaff(e.target.value)}>
            <option value="">All staff</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-2">
        {plans.length === 0 && <p className="text-sm text-stone-500">No travel plan yet.</p>}
        {plans.map(item => (
          <button key={item.id} className="card w-full text-left" onClick={() => setOpenId(item.id)}>
            <p className="font-semibold text-stone-900">{item.city}</p>
            <p className="text-sm text-stone-500">{dayLabel(item.start_date)} to {dayLabel(item.end_date)} · {item.user_name}</p>
            <p className="text-xs text-stone-500 mt-2">{STAGES.map(stageItem => `${stageLabel(stageItem.id)} ${item.stages?.[stageItem.id] || 0}`).join(' · ')}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StopCard({ stop, plan, onMove, onRemove }: {
  stop: Stop;
  plan: Plan;
  onMove: (stop: Stop, stage: string, extra?: Partial<Stop>) => void;
  onRemove: (stop: Stop) => void;
}) {
  const [time, setTime] = useState(stop.meet_time || '');
  const [date, setDate] = useState(stop.meet_date || plan.start_date);
  const [callNote, setCallNote] = useState(stop.call_note || '');
  const [outcome, setOutcome] = useState(stop.outcome_note || '');
  const [open, setOpen] = useState(stop.stage === 'to_schedule' || stop.stage === 'confirmed');

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-stone-900">{stop.agent_name}</p>
          <p className="text-xs text-stone-500 truncate">{[stop.agency_name, stop.phone].filter(Boolean).join(' · ') || 'No phone yet'}</p>
        </div>
        <p className="text-xs text-stone-600 shrink-0 text-right">{stop.meet_date ? `${dayLabel(stop.meet_date)}${stop.meet_time ? ` · ${stop.meet_time}` : ''}` : 'Time not fixed'}</p>
      </div>
      {stop.call_note && <p className="text-sm text-stone-600">{stop.call_note}</p>}
      <div className="flex flex-wrap gap-2">
        {stop.phone && <button type="button" className="h-9 px-3 rounded-full bg-green-600 text-white text-xs font-semibold" onClick={() => dialNumber(stop.phone)}>Call</button>}
        {stop.phone && <button type="button" className="h-9 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold" onClick={() => openWhatsApp(stop.phone)}>WhatsApp</button>}
        <button type="button" className="h-9 px-3 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold" onClick={() => setOpen(value => !value)}>{open ? 'Hide' : 'Set time'}</button>
      </div>
      {open && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="input" min={plan.start_date} max={plan.end_date} value={date} onChange={e => setDate(e.target.value)} />
            <input type="time" className="input" value={time} onChange={e => setTime(e.target.value)} />
          </div>
          <textarea className="input" rows={2} placeholder="Call note: what time he agreed" value={callNote} onChange={e => setCallNote(e.target.value)} />
          <textarea className="input" rows={2} placeholder="After the meeting, what was agreed" value={outcome} onChange={e => setOutcome(e.target.value)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {STAGES.map(item => (
          <button
            key={item.id}
            type="button"
            className={`h-9 px-3 rounded-full text-xs font-semibold ${stop.stage === item.id ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-700'}`}
            onClick={() => onMove(stop, item.id, { meet_date: date, meet_time: time, call_note: callNote, outcome_note: outcome })}
          >{item.label}</button>
        ))}
        <button type="button" className="h-9 px-3 text-xs text-red-600" onClick={() => onRemove(stop)}>Remove</button>
      </div>
    </div>
  );
}
