'use client';

import { useQuery } from '@tanstack/react-query';
import { api, formatINR, prettyStatus, statusTone } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';

type Dashboard = {
  property: { name: string; businessDate: string; currency: string };
  kpis: {
    occupancyPct: number;
    adr: number;
    revpar: number;
    arrivals: number;
    departures: number;
    inHouse: number;
    vacantClean: number;
    dirty: number;
    ooo: number;
    openHkTasks: number;
  };
  channel: {
    status: string;
    provider: string;
    errorCount: number;
  } | null;
  activity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
  roomStatus: Record<string, number>;
};

export default function DashboardPage() {
  const { token, property } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', property?.id],
    enabled: !!token && !!property,
    queryFn: () =>
      api<Dashboard>(`/v1/dashboard/executive?propertyId=${property!.id}`, {
        token,
      }),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return <div className="text-[var(--ink-muted)]">Loading command centre…</div>;
  }
  if (error) {
    return <div className="text-[var(--danger)]">Failed to load dashboard</div>;
  }

  const kpis = [
    { label: 'Occupancy', value: `${data.kpis.occupancyPct}%` },
    { label: 'ADR', value: formatINR(data.kpis.adr, data.property.currency) },
    { label: 'RevPAR', value: formatINR(data.kpis.revpar, data.property.currency) },
    { label: 'Arrivals', value: String(data.kpis.arrivals) },
    { label: 'In-house', value: String(data.kpis.inHouse) },
    { label: 'Vacant clean', value: String(data.kpis.vacantClean) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h1
            className="text-3xl font-bold tracking-[-0.04em]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Command Centre
          </h1>
          <p className="mt-1 text-[var(--ink-muted)]">
            Live operational pulse for {data.property.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/reservations/new" className="btn btn-accent">
            New reservation
          </Link>
          <Link href="/app/arrivals" className="btn btn-secondary">
            Arrivals board
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 animate-rise-delay-1">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="panel kpi">
            <div className="label">{kpi.label}</div>
            <div className="value">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr] animate-rise-delay-2">
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Room readiness</h2>
            <span className="status-pill info">{data.kpis.dirty} turning</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.roomStatus).map(([status, count]) => (
              <div
                key={status}
                className="rounded-xl border border-[var(--line)] bg-white/70 p-3"
              >
                <div className={`status-pill ${statusTone(status)} mb-2`}>
                  {prettyStatus(status)}
                </div>
                <div
                  className="text-2xl font-bold"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {count}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="font-bold text-lg mb-4">Channel health</h2>
          {data.channel ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold capitalize">{data.channel.provider}</div>
                  <div className="text-sm text-[var(--ink-muted)]">Distribution connector</div>
                </div>
                <span className={`status-pill ${statusTone(data.channel.status)}`}>
                  {prettyStatus(data.channel.status)}
                </span>
              </div>
              <div className="text-sm text-[var(--ink-muted)]">
                Open sync errors: <strong>{data.channel.errorCount}</strong>
              </div>
              <Link href="/app/distribution" className="btn btn-secondary w-full">
                Open channel manager
              </Link>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">No channel configured.</p>
          )}
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="font-bold text-lg mb-3">Live activity</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Entity</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {data.activity.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.action}</td>
                <td>{row.entityType}</td>
                <td className="text-[var(--ink-muted)]">
                  {new Date(row.createdAt).toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
