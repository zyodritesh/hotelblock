import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Hotel { id: string; name: string; city: string; }
interface Enquiry {
  id: string; title: string; segment: string; stage: string; event_date: string; event_end_date: string | null;
  property_name: string; created_at: string;
}
interface Ledger { id: string; amount: number; reason: string; note: string | null; created_at: string; }
interface Voucher {
  id: string; code: string; nights: number; rupees: number; guest_name: string; event_date: string;
  status: string; property_name: string;
}
interface Incentive {
  id: string; task: string; metric: string; target_value: number; pay_type: string; rate: number;
  actual: number; paid: boolean; paid_amount: number;
}
interface Wallet {
  balance: number; lifetime: number; tier: string; multiplier: number; nightPrice: number;
  nextTier: string | null; nextTierAt: number | null; rupeesToTier: number;
  nightsReady: number; rupeesToNextNight: number;
}
interface Portal {
  agent: { name: string; agency_name: string; city: string; owner_name: string | null; commission_type: string; commission_rate: number };
  wallet: Wallet;
  incentives: Incentive[];
  tiers: { name: string; lifetime: number; multiplier: number; nightPrice: number }[];
  hotels: Hotel[];
  enquiries: Enquiry[];
  ledger: Ledger[];
  vouchers: Voucher[];
}

function inr(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

interface OfferNote { id: string; title: string; body: string; read_at: string | null; created_at: string; }

const METRIC_LABEL: Record<string, string> = {
  enquiries: 'enquiries',
  bookings: 'bookings',
  revenue: 'revenue',
};

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function AgentPortal() {
  const [data, setData] = useState<Portal | null>(null);
  const [offers, setOffers] = useState<OfferNote[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<'wallet' | 'enquiry' | 'night' | 'offers'>('wallet');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [enquiry, setEnquiry] = useState({ property_id: '', guest_name: '', guest_phone: '', segment: 'Rooms', event_date: '', event_end_date: '', pax: '2', notes: '' });
  const [night, setNight] = useState({ property_id: '', guest_name: '', event_date: '', event_end_date: '', nights: '1' });

  const load = () => Promise.all([
    api.get<Portal>('/agent-portal/me'),
    api.get<{ data: OfferNote[]; unread: number }>('/agent-portal/inbox'),
  ]).then(([portal, inbox]) => {
    setData(portal);
    setOffers(inbox.data);
    setUnread(inbox.unread);
  }).catch((err: Error) => setError(err.message));
  useEffect(() => { load(); }, []);

  const openOffers = () => {
    setTab('offers');
    if (unread > 0) {
      api.post('/agent-portal/inbox/read', {}).then(() => setUnread(0)).catch(() => {});
      setOffers(current => current.map(row => ({ ...row, read_at: row.read_at || new Date().toISOString() })));
    }
  };

  const sendEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await api.post<{ posted: { task: string; amount: number }[] }>('/agent-portal/enquiries', {
        ...enquiry, pax: Number(enquiry.pax) || 0, event_end_date: enquiry.event_end_date || enquiry.event_date,
      });
      const bonus = result.posted?.length ? ` Incentive paid: ${result.posted.map(p => `${p.task} ${inr(p.amount)}`).join(', ')}.` : '';
      setNotice(`Enquiry sent to your hotel contact.${bonus}`);
      setEnquiry(f => ({ ...f, guest_name: '', guest_phone: '', notes: '' }));
      setTab('wallet');
      await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await api.post<{ code: string; rupees: number }>('/agent-portal/redeem', {
        ...night, nights: Number(night.nights), event_end_date: night.event_end_date || night.event_date,
      });
      setNotice(`Free night booked. Give the hotel code ${result.code}. ${inr(result.rupees)} left your wallet.`);
      setNight(f => ({ ...f, guest_name: '' }));
      setTab('wallet');
      await load();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (!data) {
    return <p className="text-sm text-stone-500">{error || 'Loading your club…'}</p>;
  }

  const w = data.wallet;
  const nightProgress = w.nightPrice > 0 ? Math.min(100, Math.round((w.balance / w.nightPrice) * 100)) : 0;
  const tierProgress = w.nextTierAt ? Math.min(100, Math.round((w.lifetime / w.nextTierAt) * 100)) : 100;
  const commission = data.agent.commission_type === 'fixed'
    ? `${inr(data.agent.commission_rate)} on every confirmed booking`
    : `${data.agent.commission_rate}% of every confirmed booking`;

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">{notice}</div>}

      <div className="rounded-3xl bg-stone-950 text-white p-5">
        <p className="text-xs uppercase tracking-widest text-stone-400">{data.agent.agency_name || 'Your agency'}</p>
        <p className="text-4xl font-semibold mt-2">{inr(w.balance)}</p>
        <p className="text-sm text-stone-300 mt-1">Wallet · {w.tier} · {w.multiplier}× earnings</p>
        <div className="mt-4 h-2 rounded-full bg-stone-800 overflow-hidden">
          <div className="h-full bg-amber-400" style={{ width: `${nightProgress}%` }} />
        </div>
        <p className="text-xs text-stone-400 mt-2">
          {w.rupeesToNextNight === 0 ? 'A free night is ready to use.' : `${inr(w.rupeesToNextNight)} more for a free night at ${inr(w.nightPrice)}.`}
          {w.nightsReady > 0 ? ` ${w.nightsReady} night${w.nightsReady === 1 ? '' : 's'} ready.` : ''}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {([
          ['wallet', 'Wallet'],
          ['enquiry', 'Enquiry'],
          ['night', 'Night'],
          ['offers', unread > 0 ? `Offers ${unread}` : 'Offers'],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => (key === 'offers' ? openOffers() : setTab(key))}
            className={`rounded-xl py-2 text-xs sm:text-sm font-medium ${tab === key ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'wallet' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-stone-900">Your commission</p>
            <p className="text-sm text-stone-600">{data.agent.commission_rate > 0 ? commission : 'Your hotel has not set a commission yet.'} Loyalty multiplies it by {w.multiplier}.</p>
            <div>
              <div className="flex justify-between text-xs text-stone-500 mb-1">
                <span>{w.tier}</span>
                <span>{w.nextTier ? `${inr(w.rupeesToTier)} to ${w.nextTier}` : 'Top tier'}</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full bg-stone-900" style={{ width: `${tierProgress}%` }} />
              </div>
            </div>
            <p className="text-xs text-stone-500">Lifetime earned {inr(w.lifetime)}. A higher tier raises your pay and makes a free night cheaper. {data.agent.owner_name ? `Your hotel contact is ${data.agent.owner_name}.` : ''}</p>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-stone-900">Incentives this month</p>
            {data.incentives.length === 0 && <p className="text-sm text-stone-500">No incentive is set yet. Send enquiries so the hotel can reward the ones that confirm.</p>}
            {data.incentives.map(item => {
              const goal = item.metric === 'revenue' ? item.target_value : item.target_value;
              const width = goal > 0 ? Math.min(100, Math.round((item.actual / goal) * 100)) : 0;
              const pay = item.pay_type === 'percent' ? `${item.rate}% of confirmed revenue` : inr(item.rate);
              return (
                <div key={item.id}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-stone-800">{item.task}</span>
                    <span className="text-stone-500">{item.paid ? `Paid ${inr(item.paid_amount)}` : pay}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-100 mt-2 overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${width}%` }} />
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{item.metric === 'revenue' ? inr(item.actual) : item.actual} / {item.metric === 'revenue' ? inr(item.target_value) : item.target_value} {METRIC_LABEL[item.metric]}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <p className="text-sm font-semibold text-stone-900 mb-2">Wallet history</p>
            {data.ledger.length === 0 && <p className="text-sm text-stone-500">Nothing in the wallet yet.</p>}
            <div className="space-y-2">
              {data.ledger.map(row => (
                <div key={row.id} className="flex justify-between text-sm">
                  <span className="text-stone-600">{row.note || row.reason}</span>
                  <span className={row.amount >= 0 ? 'text-emerald-700 font-medium' : 'text-stone-800'}>{row.amount >= 0 ? '+' : '−'}{inr(Math.abs(row.amount))}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <p className="text-sm font-semibold text-stone-900 mb-2">My enquiries</p>
            {data.enquiries.length === 0 && <p className="text-sm text-stone-500">Send the first one. A confirmed booking pays your commission.</p>}
            <div className="space-y-2">
              {data.enquiries.map(row => (
                <div key={row.id} className="flex justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-stone-800">{row.title}</p>
                    <p className="text-xs text-stone-500">{row.property_name} · {row.segment} · {row.event_date}</p>
                  </div>
                  <span className="text-xs text-stone-500 shrink-0">{row.stage}</span>
                </div>
              ))}
            </div>
          </div>

          {data.vouchers.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <p className="text-sm font-semibold text-stone-900 mb-2">Free night codes</p>
              {data.vouchers.map(v => (
                <div key={v.id} className="flex justify-between text-sm py-1">
                  <span>{v.code} · {v.guest_name}</span>
                  <span className="text-stone-500">{v.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'enquiry' && (
        <form onSubmit={sendEnquiry} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-stone-900">Send an enquiry</p>
          <p className="text-xs text-stone-500">Each enquiry moves you toward this month’s incentive. When the hotel confirms it, your commission lands in the wallet.</p>
          <label className="block text-xs font-medium text-stone-600">Hotel
            <select className="input mt-1" required value={enquiry.property_id} onChange={e => setEnquiry(f => ({ ...f, property_id: e.target.value }))}>
              <option value="">Choose a hotel</option>
              {data.hotels.map(h => <option key={h.id} value={h.id}>{h.name}{h.city ? ` — ${h.city}` : ''}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-stone-600">Guest name
            <input className="input mt-1" required value={enquiry.guest_name} onChange={e => setEnquiry(f => ({ ...f, guest_name: e.target.value }))} />
          </label>
          <label className="block text-xs font-medium text-stone-600">Guest phone
            <input className="input mt-1" value={enquiry.guest_phone} onChange={e => setEnquiry(f => ({ ...f, guest_phone: e.target.value }))} />
          </label>
          <label className="block text-xs font-medium text-stone-600">What they need
            <select className="input mt-1" value={enquiry.segment} onChange={e => setEnquiry(f => ({ ...f, segment: e.target.value }))}>
              {['Rooms', 'Corporate', 'Events', 'Banquets'].map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-stone-600">From
              <input type="date" className="input mt-1" required value={enquiry.event_date} onChange={e => setEnquiry(f => ({ ...f, event_date: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium text-stone-600">To
              <input type="date" className="input mt-1" value={enquiry.event_end_date} onChange={e => setEnquiry(f => ({ ...f, event_end_date: e.target.value }))} />
            </label>
          </div>
          <label className="block text-xs font-medium text-stone-600">Guests
            <input type="number" min="1" className="input mt-1" value={enquiry.pax} onChange={e => setEnquiry(f => ({ ...f, pax: e.target.value }))} />
          </label>
          <label className="block text-xs font-medium text-stone-600">Notes
            <textarea className="input mt-1" rows={3} value={enquiry.notes} onChange={e => setEnquiry(f => ({ ...f, notes: e.target.value }))} />
          </label>
          <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'}</button>
        </form>
      )}

      {tab === 'offers' && (
        <div className="space-y-3">
          {offers.length === 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <p className="text-sm text-stone-500">No offers yet. When the hotel sends a rate or a message, it lands here.</p>
            </div>
          )}
          {offers.map(row => (
            <div key={row.id} className={`rounded-2xl border p-4 ${row.read_at ? 'bg-white border-stone-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex justify-between gap-3">
                <p className="font-semibold text-stone-900">{row.title}</p>
                <p className="text-xs text-stone-400 shrink-0">{when(row.created_at)}</p>
              </div>
              <p className="text-sm text-stone-700 mt-2 whitespace-pre-wrap">{row.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'night' && (
        <form onSubmit={redeem} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-stone-900">Use a free night</p>
          <p className="text-xs text-stone-500">A night at your {w.tier} rate costs {inr(w.nightPrice)}. The hotel gets a code to honor at check-in.</p>
          <label className="block text-xs font-medium text-stone-600">Nights
            <select className="input mt-1" value={night.nights} onChange={e => setNight(f => ({ ...f, nights: e.target.value }))}>
              <option value="1">1 night · {inr(w.nightPrice)}</option>
              <option value="2">2 nights · {inr(w.nightPrice * 2)}</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-stone-600">Hotel
            <select className="input mt-1" required value={night.property_id} onChange={e => setNight(f => ({ ...f, property_id: e.target.value }))}>
              <option value="">Choose a hotel</option>
              {data.hotels.map(h => <option key={h.id} value={h.id}>{h.name}{h.city ? ` — ${h.city}` : ''}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-stone-600">Guest name
            <input className="input mt-1" required value={night.guest_name} onChange={e => setNight(f => ({ ...f, guest_name: e.target.value }))} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-stone-600">Check-in
              <input type="date" className="input mt-1" required value={night.event_date} onChange={e => setNight(f => ({ ...f, event_date: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium text-stone-600">Check-out
              <input type="date" className="input mt-1" value={night.event_end_date} onChange={e => setNight(f => ({ ...f, event_end_date: e.target.value }))} />
            </label>
          </div>
          <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'Booking…' : 'Use wallet'}</button>
        </form>
      )}
    </div>
  );
}
