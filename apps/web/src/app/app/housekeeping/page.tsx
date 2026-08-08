'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, prettyStatus, statusTone } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Board = {
  rooms: Array<{
    id: string;
    number: string;
    floor: string | null;
    status: string;
    roomType: { name: string };
  }>;
  tasks: Array<{
    id: string;
    status: string;
    priority: string;
    taskType: string;
    room: { number: string };
  }>;
  summary: Record<string, number>;
};

export default function HousekeepingPage() {
  const { token, property } = useAuth();
  const qc = useQueryClient();

  const board = useQuery({
    queryKey: ['hk', property?.id],
    enabled: !!token && !!property,
    queryFn: () =>
      api<Board>(`/v1/housekeeping/board?propertyId=${property!.id}`, { token }),
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/v1/housekeeping/tasks/${id}`, {
        token,
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hk'] }),
  });

  if (!board.data) {
    return <div className="text-[var(--ink-muted)]">Loading housekeeping board…</div>;
  }

  const nextStatus: Record<string, string> = {
    unassigned: 'assigned',
    assigned: 'in_progress',
    in_progress: 'completed',
    completed: 'inspection_pending',
    inspection_pending: 'passed',
    failed: 'rework',
    rework: 'in_progress',
  };

  return (
    <div className="space-y-4">
      <div className="animate-rise">
        <h1
          className="text-3xl font-bold tracking-[-0.04em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Housekeeping Board
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Room status, task assignment and inspection gate
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-rise-delay-1">
        {Object.entries(board.data.summary).map(([status, count]) => (
          <div key={status} className="panel kpi">
            <div className="label">{prettyStatus(status)}</div>
            <div className="value">{count}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2 animate-rise-delay-2">
        <div className="panel p-4">
          <h2 className="font-bold text-lg mb-3">Rooms by floor</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {board.data.rooms.map((room) => (
              <div
                key={room.id}
                className="rounded-xl border border-[var(--line)] bg-white/70 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold">{room.number}</div>
                  <span className={`status-pill ${statusTone(room.status)}`}>
                    {prettyStatus(room.status)}
                  </span>
                </div>
                <div className="text-xs text-[var(--ink-muted)] mt-1">
                  Floor {room.floor || '—'} · {room.roomType.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="font-bold text-lg mb-3">Open tasks</h2>
          <div className="space-y-2">
            {board.data.tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-[var(--line)] bg-white/70 p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold">
                    Room {task.room.number} · {prettyStatus(task.taskType)}
                  </div>
                  <div className="text-xs text-[var(--ink-muted)] mt-1">
                    Priority {task.priority}
                  </div>
                  <span className={`status-pill ${statusTone(task.status)} mt-2`}>
                    {prettyStatus(task.status)}
                  </span>
                </div>
                {nextStatus[task.status] ? (
                  <button
                    className="btn btn-secondary"
                    disabled={advance.isPending}
                    onClick={() =>
                      advance.mutate({
                        id: task.id,
                        status: nextStatus[task.status],
                      })
                    }
                  >
                    → {prettyStatus(nextStatus[task.status])}
                  </button>
                ) : null}
              </div>
            ))}
            {!board.data.tasks.length ? (
              <p className="text-sm text-[var(--ink-muted)]">No open tasks.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
