import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

interface AgentRow { id: string; name: string; agency_name: string; city: string; }
interface SentOffer { id: string; title: string; body: string; recipient_count: number; created_at: string; sender_name: string | null; }

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function AgentOffers() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [history, setHistory] = useState<SentOffer[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([
    api.get<AgentRow[]>('/agent-portal/offers/audience'),
    api.get<SentOffer[]>('/agent-portal/offers'),
  ]).then(([people, sent]) => {
    setAgents(people);
    setHistory(sent);
  }).catch((err: Error) => setError(err.message));

  useEffect(() => { load(); }, []);

  const toggle = (id: string) => {
    setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.post<{ recipient_count: number }>('/agent-portal/offers', {
        title, body, agent_ids: everyone ? [] : picked,
      });
      setNotice(`Sent to ${result.recipient_count} agent${result.recipient_count === 1 ? '' : 's'}. It shows in their app under Offers, and on the phone if they allowed notifications.`);
      setTitle('');
      setBody('');
      setPicked([]);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent offers</h1>
          <p className="text-sm text-stone-500 mt-1">Send a rate, a weekend offer, or any message to agents who can sign in. They see it in the Agent Club app.</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      <form onSubmit={send} className="card space-y-3">
        <label className="block text-sm font-medium text-stone-700">Title
          <input className="input mt-1" required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekend rooms at ₹4,500" />
        </label>
        <label className="block text-sm font-medium text-stone-700">Message
          <textarea className="input mt-1" required rows={4} maxLength={500} value={body} onChange={e => setBody(e.target.value)} placeholder="Book by Friday. Includes breakfast for two." />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={everyone} onChange={e => setEveryone(e.target.checked)} />
          All agents who can sign in ({agents.length})
        </label>
        {!everyone && (
          <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 max-h-64 overflow-y-auto">
            {agents.length === 0 && <p className="p-3 text-sm text-stone-500">No agent has a login yet. Open Agent Network and turn on their portal login.</p>}
            {agents.map(agent => (
              <label key={agent.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={picked.includes(agent.id)} onChange={() => toggle(agent.id)} />
                <span className="min-w-0">
                  <span className="font-medium text-stone-800">{agent.name}</span>
                  <span className="block text-xs text-stone-500 truncate">{[agent.agency_name, agent.city].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <button className="btn-primary" disabled={busy || agents.length === 0}>{busy ? 'Sending…' : 'Send offer'}</button>
      </form>

      <div className="card">
        <p className="text-sm font-semibold text-stone-900 mb-3">Sent</p>
        {history.length === 0 && <p className="text-sm text-stone-500">Nothing sent yet.</p>}
        <div className="space-y-3">
          {history.map(row => (
            <div key={row.id} className="border-b border-stone-100 pb-3 last:border-0 last:pb-0">
              <div className="flex justify-between gap-3">
                <p className="font-medium text-stone-900">{row.title}</p>
                <p className="text-xs text-stone-400 shrink-0">{when(row.created_at)}</p>
              </div>
              <p className="text-sm text-stone-600 mt-1 whitespace-pre-wrap">{row.body}</p>
              <p className="text-xs text-stone-400 mt-1">{row.sender_name || 'Staff'} · {row.recipient_count} agent{row.recipient_count === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
