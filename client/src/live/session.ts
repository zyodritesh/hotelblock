import { api } from '../api/client';
import { getSnapshot, patch } from './store';

let pc: RTCPeerConnection | null = null;
let local: MediaStream | null = null;
let callId = '';
let incomingOffer = '';
let remoteReady = false;
let iceQueue: RTCIceCandidateInit[] = [];
let localIce: RTCIceCandidateInit[] = [];
let remoteHook: ((stream: MediaStream | null) => void) | null = null;

export function bindRemoteAudio(fn: (stream: MediaStream | null) => void) {
  remoteHook = fn;
}

function resetMedia() {
  local?.getTracks().forEach(track => track.stop());
  local = null;
  pc?.close();
  pc = null;
  remoteHook?.(null);
  remoteReady = false;
  iceQueue = [];
  localIce = [];
  callId = '';
  incomingOffer = '';
}

function idle(error = '') {
  resetMedia();
  patch({
    phase: 'idle',
    peerName: '',
    peerId: '',
    callId: '',
    error,
    ...(error ? { toast: { title: 'Call', body: error } } : {}),
  });
}

async function flushIce() {
  if (!pc || !remoteReady) return;
  const queued = iceQueue;
  iceQueue = [];
  for (const candidate of queued) {
    try { await pc.addIceCandidate(candidate); } catch { /* ignore a late candidate */ }
  }
}

function sendIce(candidate: RTCIceCandidateInit) {
  if (!callId) {
    localIce.push(candidate);
    return;
  }
  api.post(`/team-calls/${callId}/signal`, { kind: 'ice', candidate }).catch(() => {});
}

function openPeer() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.onicecandidate = event => {
    if (event.candidate) sendIce(event.candidate.toJSON());
  };
  pc.ontrack = event => {
    remoteHook?.(event.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (pc?.connectionState === 'connected') patch({ phase: 'live' });
  };
}

async function pullSignals() {
  if (!callId) return;
  const rows = await api.get<{ kind: string; payload: RTCIceCandidateInit }[]>(`/team-calls/${callId}/signals`);
  for (const row of rows) {
    if (row.kind === 'ice') iceQueue.push(row.payload);
  }
  await flushIce();
}

export async function startOutgoing(peer: { id: string; name: string }) {
  if (getSnapshot().phase !== 'idle') return;
  patch({ phase: 'outgoing', peerName: peer.name, peerId: peer.id, error: '', callId: '' });
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: true });
    openPeer();
    local.getTracks().forEach(track => pc!.addTrack(track, local!));
    const offer = await pc!.createOffer();
    await pc!.setLocalDescription(offer);
    const call = await api.post<{ id: string }>('/team-calls', { to_user_id: peer.id, offer: offer.sdp });
    callId = call.id;
    patch({ callId: call.id });
    for (const candidate of localIce) sendIce(candidate);
    localIce = [];
  } catch (err: any) {
    idle(err?.message || 'Allow the microphone, then try the call again');
  }
}

export function showIncoming(call: { id: string; from_user_id: string; from_name: string; offer_sdp: string }) {
  const snap = getSnapshot();
  if (snap.phase !== 'idle' || !call?.offer_sdp) return;
  incomingOffer = call.offer_sdp;
  callId = call.id;
  patch({
    phase: 'incoming',
    callId: call.id,
    peerId: call.from_user_id,
    peerName: call.from_name,
    error: '',
  });
}

export async function acceptIncoming() {
  const snap = getSnapshot();
  if (snap.phase !== 'incoming' || !incomingOffer) return;
  patch({ phase: 'connecting' });
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: true });
    callId = snap.callId;
    openPeer();
    local.getTracks().forEach(track => pc!.addTrack(track, local!));
    await pc!.setRemoteDescription({ type: 'offer', sdp: incomingOffer });
    remoteReady = true;
    const answer = await pc!.createAnswer();
    await pc!.setLocalDescription(answer);
    await api.post(`/team-calls/${callId}/answer`, { answer: answer.sdp });
    for (const candidate of localIce) sendIce(candidate);
    localIce = [];
    await pullSignals();
    patch({ phase: 'live' });
  } catch (err: any) {
    idle(err?.message || 'Could not answer. Allow the microphone and try again.');
  }
}

export async function declineIncoming() {
  const id = getSnapshot().callId;
  if (id) await api.post(`/team-calls/${id}/decline`, {}).catch(() => {});
  idle();
}

export async function hangUp() {
  const id = callId || getSnapshot().callId;
  if (id) await api.post(`/team-calls/${id}/end`, {}).catch(() => {});
  idle();
}

export async function onCallEvent(data: any) {
  if (!data) return;
  if (data.action === 'ring') {
    showIncoming(data.call);
    return;
  }
  const id = data.callId as string;
  if (!id || (callId && id !== callId && getSnapshot().callId !== id)) return;
  if (data.action === 'signal' && data.signal?.kind === 'answer' && pc) {
    await pc.setRemoteDescription({ type: 'answer', sdp: data.signal.sdp });
    remoteReady = true;
    await pullSignals();
    patch({ phase: 'live' });
    return;
  }
  if (data.action === 'signal' && data.signal?.kind === 'ice') {
    const candidate = data.signal.candidate as RTCIceCandidateInit;
    if (remoteReady && pc) {
      try { await pc.addIceCandidate(candidate); } catch { /* ignore */ }
    } else iceQueue.push(candidate);
    return;
  }
  if (['declined', 'ended', 'missed', 'cancelled'].includes(data.action)) {
    const error = data.action === 'declined' ? 'Call declined' : data.action === 'missed' ? 'No answer' : '';
    idle(error);
  }
}
