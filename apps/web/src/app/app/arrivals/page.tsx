'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatINR, prettyStatus, statusTone } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Arrival = {
  id: string;
  confirmationNo: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  totalAmount: number;
  notes: string | null;
  guest: { fullName: string; mobile: string | null; isVip?: boolean } | null;
  rooms: Array<{ roomProduct: { name: string }; nightlyRate: number }>;
  stays: Array<{
    id: string;
    assignments: Array<{ room: { id: string; number: string } }>;
  }>;
};

type Room = {
  id: string;
  number: string;
  status: string;
  roomType: { name: string };
};

export default function ArrivalsPage() {
  const { token, property } = useAuth();
  const qc = useQueryClient();
  const [selectedStay, setSelectedStay] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');

  const arrivals = useQuery({
    queryKey: ['arrivals', property?.id, property?.businessDate],
    enabled: !!token && !!property,
    queryFn: () =>
      api<Arrival[]>(
        `/v1/arrivals?propertyId=${property!.id}&date=${property!.businessDate}`,
        { token },
      ),
  });

  const rooms = useQuery({
    queryKey: ['rooms', property?.id],
    enabled: !!token && !!property,
    queryFn: () =>
      api<Room[]>(`/v1/rooms?propertyId=${property!.id}`, { token }),
  });

  const checkIn = useMutation({
    mutationFn: async () => {
      if (!selectedStay || !roomId) throw new Error('Select room');
      return api(`/v1/stays/${selectedStay}/check-in`, {
        token,
        method: 'POST',
        body: { roomId, depositAmount: 2000 },
        idempotencyKey: `checkin-${selectedStay}-${roomId}`,
      });
    },
    onSuccess: async () => {
      setMessage('Check-in completed');
      setSelectedStay(null);
      setRoomId('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['arrivals'] }),
        qc.invalidateQueries({ queryKey: ['rooms'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const cleanRooms = (rooms.data || []).filter((r) =>
    ['vacant_clean', 'reserved'].includes(r.status),
  );

  return (
    <div className="space-y-4">
      <div className="animate-rise">
        <h1
          className="text-3xl font-bold tracking-[-0.04em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Arrivals
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Business date {property?.businessDate} · guided check-in
        </p>
      </div>

      {message ? (
        <div className="panel px-4 py-3 text-sm animate-rise-delay-1">{message}</div>
      ) : null}

      <div className="panel overflow-auto animate-rise-delay-1">
        <table className="data-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Stay</th>
              <th>Product</th>
              <th>Status</th>
              <th>Room</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(arrivals.data || []).map((row) => {
              const stayId = row.stays[0]?.id;
              const assigned = row.stays[0]?.assignments[0]?.room;
              return (
                <tr key={row.id}>
                  <td>
                    <div className="font-semibold">
                      {row.guest?.fullName}
                      {row.guest?.isVip ? (
                        <span className="status-pill warn ml-2">VIP</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {row.confirmationNo} · {row.guest?.mobile || '—'}
                    </div>
                  </td>
                  <td>
                    {row.arrivalDate} → {row.departureDate}
                    <div className="text-xs text-[var(--ink-muted)]">
                      {formatINR(row.totalAmount, property?.currency)}
                    </div>
                  </td>
                  <td>{row.rooms[0]?.roomProduct.name}</td>
                  <td>
                    <span className={`status-pill ${statusTone(row.status)}`}>
                      {prettyStatus(row.status)}
                    </span>
                  </td>
                  <td>{assigned?.number || 'Unassigned'}</td>
                  <td>
                    {row.status === 'confirmed' && stayId ? (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setSelectedStay(stayId);
                          setMessage('');
                        }}
                      >
                        Check in
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedStay ? (
        <div className="panel p-5 max-w-xl animate-rise-delay-2">
          <h2 className="font-bold text-lg">Guided check-in</h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1 mb-4">
            Assign a vacant-clean room, collect deposit, activate stay.
          </p>
          <div className="field mb-4">
            <label>Room</label>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Select room</option>
              {cleanRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number} · {r.roomType.name} · {prettyStatus(r.status)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-accent"
              disabled={!roomId || checkIn.isPending}
              onClick={() => checkIn.mutate()}
            >
              {checkIn.isPending ? 'Processing…' : 'Complete check-in'}
            </button>
            <button className="btn btn-secondary" onClick={() => setSelectedStay(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
