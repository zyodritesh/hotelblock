'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { api, prettyStatus, statusTone } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type TapeData = {
  from: string;
  to: string;
  rooms: Array<{
    id: string;
    number: string;
    status: string;
    roomType: { name: string; code: string };
  }>;
  reservations: Array<{
    id: string;
    confirmationNo: string;
    status: string;
    arrivalDate: string;
    departureDate: string;
    guest: { fullName: string } | null;
    stays: Array<{
      assignments: Array<{ room: { id: string; number: string } }>;
    }>;
  }>;
};

function dateRange(from: string, days: number) {
  const start = parseISO(from);
  return Array.from({ length: days }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
}

export default function TapeChartPage() {
  const { token, property } = useAuth();
  const from = property?.businessDate || format(new Date(), 'yyyy-MM-dd');
  const to = format(addDays(parseISO(from), 10), 'yyyy-MM-dd');
  const days = useMemo(() => dateRange(from, 10), [from]);

  const { data, isLoading } = useQuery({
    queryKey: ['tape', property?.id, from, to],
    enabled: !!token && !!property,
    queryFn: () =>
      api<TapeData>(
        `/v1/tape-chart?propertyId=${property!.id}&from=${from}&to=${to}`,
        { token },
      ),
  });

  if (isLoading || !data) {
    return <div className="text-[var(--ink-muted)]">Loading tape chart…</div>;
  }

  const assignmentMap = new Map<string, typeof data.reservations>();
  for (const res of data.reservations) {
    const roomId = res.stays[0]?.assignments[0]?.room.id;
    if (!roomId) continue;
    const list = assignmentMap.get(roomId) || [];
    list.push(res);
    assignmentMap.set(roomId, list);
  }

  return (
    <div className="space-y-4">
      <div className="animate-rise">
        <h1
          className="text-3xl font-bold tracking-[-0.04em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Tape Chart
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Room-by-date occupancy · {from} → {to}
        </p>
      </div>

      <div className="panel overflow-auto animate-rise-delay-1">
        <table className="min-w-[920px] w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--panel-solid)] z-10 text-left p-3 text-xs uppercase tracking-wide text-[var(--ink-muted)] border-b border-[var(--line)]">
                Room
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className="p-3 text-xs uppercase tracking-wide text-[var(--ink-muted)] border-b border-[var(--line)] min-w-[88px]"
                >
                  {format(parseISO(d), 'dd MMM')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((room) => {
              const bookings = assignmentMap.get(room.id) || [];
              return (
                <tr key={room.id}>
                  <td className="sticky left-0 bg-[var(--panel-solid)] z-10 p-3 border-b border-[var(--line)]">
                    <div className="font-bold">{room.number}</div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {room.roomType.code}
                    </div>
                    <span className={`status-pill ${statusTone(room.status)} mt-1`}>
                      {prettyStatus(room.status)}
                    </span>
                  </td>
                  {days.map((day) => {
                    const hit = bookings.find(
                      (b) => b.arrivalDate <= day && b.departureDate > day,
                    );
                    return (
                      <td key={day} className="p-1.5 border-b border-[var(--line)]">
                        {hit ? (
                          <div
                            className="rounded-lg px-2 py-2 text-[0.72rem] font-semibold text-white"
                            style={{
                              background:
                                hit.status === 'checked_in'
                                  ? 'linear-gradient(135deg,#0d8a7a,#0b1f33)'
                                  : 'linear-gradient(135deg,#1d5c8c,#0b1f33)',
                            }}
                            title={hit.confirmationNo}
                          >
                            <div className="truncate">
                              {hit.guest?.fullName || hit.confirmationNo}
                            </div>
                          </div>
                        ) : (
                          <div className="h-10 rounded-lg bg-white/50 border border-dashed border-[var(--line)]" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel p-4">
        <h2 className="font-bold mb-2">Unassigned confirmed stays</h2>
        <div className="flex flex-wrap gap-2">
          {data.reservations
            .filter((r) => !r.stays[0]?.assignments?.length)
            .map((r) => (
              <span key={r.id} className="status-pill warn">
                {r.confirmationNo} · {r.guest?.fullName} · {r.arrivalDate}
              </span>
            ))}
          {!data.reservations.filter((r) => !r.stays[0]?.assignments?.length).length ? (
            <span className="text-sm text-[var(--ink-muted)]">None</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
