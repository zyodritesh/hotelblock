'use client';

import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { api, formatINR } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

type Availability = {
  nights: number;
  options: Array<{
    roomProductId: string;
    roomProductName: string;
    ratePlanId: string;
    ratePlanName: string;
    nightlyRate: number;
    totalRate: number;
    available: number;
    currency: string;
    mealPlan: string | null;
  }>;
};

export default function NewReservationPage() {
  const { token, property } = useAuth();
  const router = useRouter();
  const businessDate = property?.businessDate || format(new Date(), 'yyyy-MM-dd');
  const [arrivalDate, setArrivalDate] = useState(businessDate);
  const [departureDate, setDepartureDate] = useState(
    format(addDays(parseISO(businessDate), 2), 'yyyy-MM-dd'),
  );
  const [adults, setAdults] = useState(2);
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [selected, setSelected] = useState<Availability['options'][number] | null>(
    null,
  );
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState('');

  const search = useMutation({
    mutationFn: () =>
      api<Availability>('/v1/availability/search', {
        token,
        method: 'POST',
        body: {
          propertyId: property!.id,
          arrivalDate,
          departureDate,
          adults,
          rooms: 1,
        },
      }),
    onSuccess: (data) => {
      setAvailability(data);
      setSelected(data.options[0] || null);
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; confirmationNo: string }>('/v1/reservations', {
        token,
        method: 'POST',
        idempotencyKey: `res-${property!.id}-${arrivalDate}-${fullName}-${Date.now()}`,
        body: {
          propertyId: property!.id,
          arrivalDate,
          departureDate,
          adults,
          roomProductId: selected!.roomProductId,
          ratePlanId: selected!.ratePlanId,
          guest: { fullName, mobile },
          confirm: true,
          source: 'direct',
        },
      }),
    onSuccess: (res) => {
      router.push('/app/arrivals');
      alert(`Reservation confirmed: ${res.confirmationNo}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    search.mutate();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="animate-rise">
        <h1
          className="text-3xl font-bold tracking-[-0.04em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          New Reservation
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Search live inventory, select rate, confirm atomically
        </p>
      </div>

      <form onSubmit={onSearch} className="panel p-5 grid gap-4 md:grid-cols-4 animate-rise-delay-1">
        <div className="field">
          <label>Arrival</label>
          <input
            type="date"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Departure</label>
          <input
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Adults</label>
          <input
            type="number"
            min={1}
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
          />
        </div>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" disabled={search.isPending}>
            {search.isPending ? 'Searching…' : 'Search availability'}
          </button>
        </div>
      </form>

      {availability ? (
        <div className="panel p-5 animate-rise-delay-2">
          <h2 className="font-bold text-lg mb-3">
            {availability.options.length} option(s) · {availability.nights} night(s)
          </h2>
          <div className="space-y-2">
            {availability.options.map((opt) => (
              <label
                key={`${opt.roomProductId}-${opt.ratePlanId}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/70 p-3 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="rate"
                    checked={selected?.ratePlanId === opt.ratePlanId}
                    onChange={() => setSelected(opt)}
                  />
                  <div>
                    <div className="font-semibold">{opt.roomProductName}</div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {opt.ratePlanName} · {opt.mealPlan || 'EP'} · {opt.available} left
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">
                    {formatINR(opt.totalRate, opt.currency)}
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">
                    {formatINR(opt.nightlyRate, opt.currency)} / night
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="field">
              <label>Guest name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Mobile</label>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
          </div>

          <button
            className="btn btn-accent mt-5"
            disabled={!selected || !fullName || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Confirming…' : 'Confirm reservation'}
          </button>
        </div>
      ) : null}

      {error ? <div className="text-[var(--danger)] text-sm">{error}</div> : null}
    </div>
  );
}
