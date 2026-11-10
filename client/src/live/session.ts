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
let group = false;

type PeerLink = { pc: RTCPeerConnection; remoteReady: boolean; iceQueue: RTCIceCandidateInit[]; audio: HTMLAudioElement };
const peers = new Map<string, PeerLink>();

export function bindRemoteAudio(fn: (stream: MediaStream | null) => void) {
  remoteHook = fn;
}

function resetMedia() {
  local?.getTracks().forEach(track => track.stop());
  local = null;
  pc?.close();
  pc = null;
  remoteHook?.(null);
  for (const link of peers.values()) {
    link.pc.close();
    link.audio.srcObject = null;
    link.audio.remove();
  }
  peers.clear();
  remoteReady = false;
  iceQueue = [];
  localIce = [];
  callId = '';
  incomingOffer = '';
  group = false;
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

export function showIncoming(call: { id: string; from_user_id: string; from_name: string; offer_sdp?: string | null; is_group?: boolean; title?: string | null }) {
  const snap = getSnapshot();
  if (snap.phase !== 'idle') return;
  if (call?.is_group) {
    group = true;
    callId = call.id;
    patch({ phase: 'incoming', callId: call.id, peerId: call.from_user_id, peerName: call.title || 'Group call', error: '' });
    return;
  }
  if (!call?.offer_sdp) return;
  group = false;
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

function linkFor(remoteUserId: string) {
  const existing = peers.get(remoteUserId);
  if (existing) return existing;
  const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  local?.getTracks().forEach(track => connection.addTrack(track, local!));
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', 'true');
  document.body.appendChild(audio);
  const link: PeerLink = { pc: connection, remoteReady: false, iceQueue: [], audio };
  connection.onicecandidate = event => {
    if (event.candidate && callId) {
      api.post(`/team-calls/${callId}/signal`, { kind: 'ice', to_user_id: remoteUserId, candidate: event.candidate.toJSON() }).catch(() => {});
    }
  };
  connection.ontrack = event => { audio.srcObject = event.streams[0]; };
  peers.set(remoteUserId, link);
  return link;
}

async function flushLink(link: PeerLink) {
  if (!link.remoteReady) return;
  const queued = link.iceQueue;
  link.iceQueue = [];
  for (const candidate of queued) {
    try { await link.pc.addIceCandidate(candidate); } catch { /* ignore a late candidate */ }
  }
}

async function offerTo(remoteUserId: string) {
  const link = linkFor(remoteUserId);
  const offer = await link.pc.createOffer();
  await link.pc.setLocalDescription(offer);
  await api.post(`/team-calls/${callId}/signal`, { kind: 'offer', to_user_id: remoteUserId, sdp: offer.sdp });
}

async function onGroupSignal(from: string, signal: { kind: string; sdp?: string; candidate?: RTCIceCandidateInit }) {
  if (!from || !local) return;
  if (signal.kind === 'offer' && signal.sdp) {
    const link = linkFor(from);
    await link.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
    link.remoteReady = true;
    const answer = await link.pc.createAnswer();
    await link.pc.setLocalDescription(answer);
    await api.post(`/team-calls/${callId}/signal`, { kind: 'answer', to_user_id: from, sdp: answer.sdp });
    await flushLink(link);
    patch({ phase: 'live' });
    return;
  }
  if (signal.kind === 'answer' && signal.sdp) {
    const link = peers.get(from);
    if (!link) return;
    await link.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    link.remoteReady = true;
    await flushLink(link);
    patch({ phase: 'live' });
    return;
  }
  if (signal.kind === 'ice' && signal.candidate) {
    const link = linkFor(from);
    if (link.remoteReady) {
      try { await link.pc.addIceCandidate(signal.candidate); } catch { /* ignore */ }
    } else link.iceQueue.push(signal.candidate);
  }
}

export async function startGroupCall(conversationId: string, title: string) {
  if (getSnapshot().phase !== 'idle') return;
  group = true;
  patch({ phase: 'outgoing', peerName: title || 'Group call', peerId: '', error: '', callId: '' });
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: true });
    const call = await api.post<{ id: string }>('/team-calls', { conversation_id: conversationId });
    callId = call.id;
    patch({ callId: call.id, phase: 'outgoing' });
  } catch (err: any) {
    idle(err?.message || 'Allow the microphone, then try the call again');
  }
}

async function acceptGroup() {
  patch({ phase: 'connecting' });
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: true });
    callId = getSnapshot().callId;
    const joined = await api.post<{ peers: { id: string; name: string }[] }>(`/team-calls/${callId}/join`, {});
    for (const peer of joined.peers || []) await offerTo(peer.id);
    const names = (joined.peers || []).map(peer => peer.name);
    patch({ phase: 'live', peerName: names.length ? names.join(', ') : getSnapshot().peerName });
  } catch (err: any) {
    idle(err?.message || 'Could not join. Allow the microphone and try again.');
  }
}

export async function acceptIncoming() {
  const snap = getSnapshot();
  if (snap.phase !== 'incoming') return;
  if (group) return acceptGroup();
  if (!incomingOffer) return;
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
  if (group || data.call?.is_group) {
    if (data.action === 'signal') {
      await onGroupSignal(data.from, data.signal);
      return;
    }
    if (data.action === 'peer-joined') {
      const names = getSnapshot().peerName;
      patch({ peerName: names && !names.includes(data.name) ? `${names}, ${data.name}` : (data.name || names), phase: 'live' });
      return;
    }
    if (data.action === 'peer-left') {
      const link = peers.get(data.userId);
      if (link) { link.pc.close(); link.audio.remove(); peers.delete(data.userId); }
      return;
    }
    if (data.action === 'peer-declined') {
      patch({ toast: { title: 'Group call', body: `${data.name} declined` } });
      return;
    }
  }
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
