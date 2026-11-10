import React, { useEffect, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../live/store';
import { acceptIncoming, bindRemoteAudio, declineIncoming, hangUp } from '../live/session';

function useLive() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export default function CallOverlay() {
  const live = useLive();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    bindRemoteAudio(stream => {
      if (audioRef.current) audioRef.current.srcObject = stream;
    });
  }, []);

  useEffect(() => {
    if (live.phase !== 'live') { setSeconds(0); return; }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [live.phase]);

  useEffect(() => {
    if (live.phase !== 'incoming' && live.phase !== 'outgoing') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.04;
    oscillator.frequency.value = live.phase === 'incoming' ? 480 : 420;
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    const pulse = setInterval(() => { gain.gain.value = gain.gain.value > 0 ? 0 : 0.04; }, 700);
    return () => { clearInterval(pulse); oscillator.stop(); ctx.close().catch(() => {}); };
  }, [live.phase]);

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const open = live.phase !== 'idle';

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline />
      {open && (
        <div className="fixed inset-0 z-[70] bg-slate-950/95 text-white flex flex-col items-center justify-center p-6">
          <p className="text-sm uppercase tracking-wide text-slate-400">
            {live.phase === 'incoming' ? 'Incoming call' : live.phase === 'outgoing' ? 'Calling' : live.phase === 'connecting' ? 'Connecting' : 'On a call'}
          </p>
          <div className="mt-4 w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold">
            {live.peerName?.[0]?.toUpperCase() || '?'}
          </div>
          <h2 className="mt-4 text-2xl font-semibold">{live.peerName || 'Teammate'}</h2>
          <p className="mt-1 text-slate-400">{live.phase === 'live' ? clock : 'HotelBlock'}</p>
          <div className="mt-10 flex gap-4">
            {live.phase === 'incoming' && (
              <>
                <button type="button" className="w-16 h-16 rounded-full bg-red-600 text-2xl" onClick={() => declineIncoming()}>✕</button>
                <button type="button" className="w-16 h-16 rounded-full bg-green-500 text-2xl" onClick={() => acceptIncoming()}>☎</button>
              </>
            )}
            {live.phase !== 'incoming' && (
              <button type="button" className="px-6 py-3 rounded-full bg-red-600 font-semibold" onClick={() => hangUp()}>End call</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
