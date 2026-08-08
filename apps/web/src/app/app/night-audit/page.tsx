'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';

type Precheck = {
  businessDate: string;
  ready: boolean;
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  preview: { roomChargeCandidates: number };
};

export default function NightAuditPage() {
  const { token, property, setPropertyId, user } = useAuth();
  const qc = useQueryClient();
  const [result, setResult] = useState<string>('');

  const precheck = useQuery({
    queryKey: ['night-audit', property?.id],
    enabled: !!token && !!property,
    queryFn: () =>
      api<Precheck>(`/v1/night-audit/precheck?propertyId=${property!.id}`, {
        token,
      }),
  });

  const run = useMutation({
    mutationFn: () =>
      api<{ previousBusinessDate: string; businessDate: string; roomChargesPosted: number }>(
        `/v1/night-audit/run?propertyId=${property!.id}`,
        {
          token,
          method: 'POST',
          idempotencyKey: `night-audit-${property!.id}-${property!.businessDate}`,
        },
      ),
    onSuccess: async (data) => {
      setResult(
        `Closed ${data.previousBusinessDate}. Business date is now ${data.businessDate}. Posted ${data.roomChargesPosted} room charge(s).`,
      );
      await qc.invalidateQueries();
      // refresh property business date from /me
      if (user) {
        const me = await api<typeof user>('/v1/auth/me', { token });
        const refreshed = me.properties.find((p) => p.id === property?.id);
        if (refreshed) setPropertyId(refreshed.id);
      }
    },
    onError: (err: Error) => setResult(err.message),
  });

  if (!precheck.data) {
    return <div className="text-[var(--ink-muted)]">Loading night audit…</div>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="animate-rise">
        <h1
          className="text-3xl font-bold tracking-[-0.04em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Night Audit
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Pre-checks, room postings and business-date close
        </p>
      </div>

      <div className="panel p-5 animate-rise-delay-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-[var(--ink-muted)]">Current business date</div>
            <div
              className="text-3xl font-bold tracking-[-0.03em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {precheck.data.businessDate}
            </div>
          </div>
          <span className={`status-pill ${precheck.data.ready ? 'ok' : 'danger'}`}>
            {precheck.data.ready ? 'Ready to close' : 'Blocked'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              Room charge candidates
            </div>
            <div className="text-2xl font-bold mt-1">
              {precheck.data.preview.roomChargeCandidates}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              Blockers
            </div>
            <div className="text-2xl font-bold mt-1">
              {precheck.data.blockers.length}
            </div>
          </div>
        </div>

        {precheck.data.blockers.length ? (
          <ul className="mt-4 space-y-2">
            {precheck.data.blockers.map((b) => (
              <li key={b.code} className="status-pill danger">
                {b.message}
              </li>
            ))}
          </ul>
        ) : null}

        {precheck.data.warnings.length ? (
          <ul className="mt-3 space-y-2">
            {precheck.data.warnings.map((w) => (
              <li key={w.code} className="status-pill warn">
                {w.message}
              </li>
            ))}
          </ul>
        ) : null}

        <button
          className="btn btn-primary mt-6"
          disabled={!precheck.data.ready || run.isPending}
          onClick={() => run.mutate()}
        >
          {run.isPending ? 'Running…' : 'Run night audit'}
        </button>

        {result ? <p className="mt-4 text-sm">{result}</p> : null}
      </div>
    </div>
  );
}
