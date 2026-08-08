'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, prettyStatus, statusTone } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';

type Connection = {
  id: string;
  provider: string;
  status: string;
  externalId: string | null;
  errorCount: number;
  lastAriAt: string | null;
  lastBookingAt: string | null;
};

export default function DistributionPage() {
  const { token, property } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const connections = useQuery({
    queryKey: ['channels', property?.id],
    enabled: !!token && !!property,
    queryFn: () =>
      api<Connection[]>(
        `/v1/distribution/connections?propertyId=${property!.id}`,
        { token },
      ),
  });

  const provision = useMutation({
    mutationFn: () =>
      api(`/v1/distribution/channex/provision?propertyId=${property!.id}`, {
        token,
        method: 'POST',
      }),
    onSuccess: async () => {
      setNote('Channex property provisioned (staging stub).');
      await qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/distribution/connections/${id}/activate`, {
        token,
        method: 'POST',
      }),
    onSuccess: async () => {
      setNote('Connection activated. ARI publishing can begin.');
      await qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const sync = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/distribution/connections/${id}/full-sync`, {
        token,
        method: 'POST',
      }),
    onSuccess: async () => {
      setNote('500-day full sync queued (stub).');
      await qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="animate-rise">
        <h1
          className="text-3xl font-bold tracking-[-0.04em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Channel Manager
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Hotel OS owns inventory; Channex is the OTA transport layer
        </p>
      </div>

      {note ? <div className="panel px-4 py-3 text-sm">{note}</div> : null}

      <div className="flex gap-2 animate-rise-delay-1">
        <button
          className="btn btn-accent"
          disabled={provision.isPending}
          onClick={() => provision.mutate()}
        >
          Provision Channex
        </button>
      </div>

      <div className="panel overflow-auto animate-rise-delay-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>External ID</th>
              <th>Status</th>
              <th>Errors</th>
              <th>Last ARI</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(connections.data || []).map((c) => (
              <tr key={c.id}>
                <td className="font-semibold capitalize">{c.provider}</td>
                <td>{c.externalId || '—'}</td>
                <td>
                  <span className={`status-pill ${statusTone(c.status)}`}>
                    {prettyStatus(c.status)}
                  </span>
                </td>
                <td>{c.errorCount}</td>
                <td className="text-[var(--ink-muted)]">
                  {c.lastAriAt
                    ? new Date(c.lastAriAt).toLocaleString('en-IN')
                    : '—'}
                </td>
                <td className="space-x-2">
                  <button
                    className="btn btn-secondary"
                    onClick={() => sync.mutate(c.id)}
                  >
                    Full sync
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => activate.mutate(c.id)}
                  >
                    Activate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
