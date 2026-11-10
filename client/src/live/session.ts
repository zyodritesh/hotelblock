import { api } from '../api/client';
import { getSnapshot, patch } from './store';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

let pc: RTCPeerConnection | null = null;
let local: MediaStream | null = null;
let callId = '';
let incomingOffer = '';
let remoteReady = false;
let answerApplied = false;
let iceQueue: RTCIceCandidateInit[] = [];
let localIce: RTCIceCandidateInit[] = [];
let remoteHook: ((stream: MediaStream | null) => void) | null = null;
let group = false;
let watchTimer = 0;
const appliedIce = new Set<string>();
const seenSignalIds = new Set<string>();
const seenGroupKeys = new Set<string>();

type PeerLink = { pc: RTCPeerConnection; remoteReady: boolean; iceQueue: RTCIceCandidateInit[]; audio: HTMLAudioElement };
const peers = new Map<string, PeerLink>();

type SignalRow = { id: string; from_user_id: string; kind: string; payload: RTCIceCandidateInit | string };

export function bindRemoteAudio(fn: (stream: MediaStream | null) => void) {
  remoteHook = fn;
}

function nativeCallScreen(open: boolean) {
  const bridge = (window as unknown as { HotelBlockNative?: { callScreen?: (open: boolean) => void } }).HotelBlockNative;
  bridge?.callScreen?.(open);
}

function stopWatch() {
  if (watchTimer) window.clearInterval(watchTimer);
  watchTimer = 0;
}

function resetMedia() {
  stopWatch();
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
  answerApplied = false;
  iceQueue = [];
  localIce = [];
  appliedIce.clear();
  seenSignalIds.clear();
  seenGroupKeys.clear();
  callId = '';
  incomingOffer = '';
  group = false;
  nativeCallScreen(false);
}

function talkSeconds() {
  const started = getSnapshot().connectedAt;
  if (!started) return 0;
  return Math.max(0, Math.round((Date.now() - started) / 1000));
}

function idle(error = '') {
  const ending = callId || getSnapshot().callId;
  const duration = talkSeconds();
  resetMedia();
  patch({
    phase: 'idle',
    peerName: '',
    peerId: '',
    callId: '',
    connectedAt: 0,
    error,
    ...(error ? { toast: { title: 'Call', body: error } } : {}),
  });
  if (ending) api.post(`/team-calls/${ending}/end`, { duration_sec: duration }).catch(() => {});
}

function markLive() {
  const phase = getSnapshot().phase;
  if (phase !== 'connecting' && phase !== 'outgoing') return;
  patch({ phase: 'live', connectedAt: Date.now(), error: '' });
}

function noteConnection(connection: RTCPeerConnection, endOnFail: boolean) {
  const ice = connection.iceConnectionState;
  const state = connection.connectionState;
  if (ice === 'connected' || ice === 'completed' || state === 'connected') markLive();
  if (endOnFail && (ice === 'failed' || state === 'failed') && getSnapshot().phase !== 'idle') {
    idle('The call could not connect. Try again.');
  }
}

function playRemote(stream: MediaStream | null) {
  remoteHook?.(stream);
}

async function addIce(candidate: RTCIceCandidateInit) {
  const key = JSON.stringify(candidate);
  if (appliedIce.has(key)) return;
  if (!remoteReady || !pc) {
    if (!iceQueue.some(item => JSON.stringify(item) === key)) iceQueue.push(candidate);
    return;
  }
  appliedIce.add(key);
  try { await pc.addIceCandidate(candidate); } catch { /* a duplicate candidate is safe to skip */ }
}

async function flushIce() {
  const queued = iceQueue;
  iceQueue = [];
  for (const candidate of queued) await addIce(candidate);
}

function sendIce(candidate: RTCIceCandidateInit) {
  if (!callId) {
    localIce.push(candidate);
    return;
  }
  api.post(`/team-calls/${callId}/signal`, { kind: 'ice', candidate }).catch(() => {});
}

function openPeer() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = event => {
    if (event.candidate) sendIce(event.candidate.toJSON());
  };
  pc.ontrack = event => {
    playRemote(event.streams[0] || new MediaStream([event.track]));
  };
  pc.oniceconnectionstatechange = () => { if (pc) noteConnection(pc, true); };
  pc.onconnectionstatechange = () => { if (pc) noteConnection(pc, true); };
}

async function takeAnswer(sdp: string) {
  if (!sdp || !pc || answerApplied) return;
  await pc.setRemoteDescription({ type: 'answer', sdp });
  answerApplied = true;
  remoteReady = true;
  await flushIce();
  if (getSnapshot().phase === 'outgoing') patch({ phase: 'connecting' });
}

async function pullSignals() {
  if (!callId) return;
  const rows = await api.get<SignalRow[]>(`/team-calls/${callId}/signals`);
  for (const row of rows) {
    if (seenSignalIds.has(row.id)) continue;
    seenSignalIds.add(row.id);
    if (group) {
      if (row.kind === 'ice') await onGroupSignal(row.from_user_id, { kind: 'ice', candidate: row.payload as RTCIceCandidateInit });
      else if (typeof row.payload === 'string') await onGroupSignal(row.from_user_id, { kind: row.kind, sdp: row.payload });
      continue;
    }
    if (row.kind === 'ice') await addIce(row.payload as RTCIceCandidateInit);
  }
}

async function tickCall() {
  if (!callId || getSnapshot().phase === 'idle') return;
  try {
    if (!group && !answerApplied && getSnapshot().phase === 'outgoing') {
      const row = await api.get<{ status: string; answer_sdp?: string | null }>(`/team-calls/${callId}`);
      if (['declined', 'ended', 'missed', 'cancelled'].includes(row.status)) {
        idle(row.status === 'declined' ? 'Call declined' : row.status === 'missed' ? 'No answer' : '');
        return;
      }
      if (row.status === 'accepted' && row.answer_sdp) await takeAnswer(row.answer_sdp);
    }
    if (group || remoteReady || getSnapshot().phase === 'connecting' || getSnapshot().phase === 'live') await pullSignals();
  } catch { /* the next tick retries */ }
}

function startWatch() {
  stopWatch();
  void tickCall();
  watchTimer = window.setInterval(() => { void tickCall(); }, 1000);
}

export async function startOutgoing(peer: { id: string; name: string }) {
  if (getSnapshot().phase !== 'idle') return;
  group = false;
  patch({ phase: 'outgoing', peerName: peer.name, peerId: peer.id, error: '', callId: '', connectedAt: 0 });
  nativeCallScreen(true);
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
    startWatch();
  } catch (err: any) {
    idle(err?.message || 'Allow the microphone, then try the call again');
  }
}

export function showIncoming(call: { id: string; from_user_id: string; from_name: string; offer_sdp?: string | null; is_group?: boolean; title?: string | null }) {
  const snap = getSnapshot();
  if (snap.phase !== 'idle') return;
  nativeCallScreen(true);
  if (call?.is_group) {
    group = true;
    callId = call.id;
    patch({ phase: 'incoming', callId: call.id, peerId: call.from_user_id, peerName: call.title || 'Group call', error: '', connectedAt: 0 });
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
    connectedAt: 0,
  });
}

function linkFor(remoteUserId: string) {
  const existing = peers.get(remoteUserId);
  if (existing) return existing;
  const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
  connection.ontrack = event => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    audio.srcObject = stream;
    audio.play().catch(() => {});
  };
  connection.oniceconnectionstatechange = () => noteConnection(connection, false);
  connection.onconnectionstatechange = () => noteConnection(connection, false);
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
  const key = `${from}|${signal.kind}|${signal.sdp || JSON.stringify(signal.candidate || {})}`;
  if (seenGroupKeys.has(key)) return;
  seenGroupKeys.add(key);
  if (signal.kind === 'offer' && signal.sdp) {
    const link = linkFor(from);
    await link.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
    link.remoteReady = true;
    const answer = await link.pc.createAnswer();
    await link.pc.setLocalDescription(answer);
    await api.post(`/team-calls/${callId}/signal`, { kind: 'answer', to_user_id: from, sdp: answer.sdp });
    await flushLink(link);
    if (getSnapshot().phase === 'outgoing') patch({ phase: 'connecting' });
    return;
  }
  if (signal.kind === 'answer' && signal.sdp) {
    const link = peers.get(from);
    if (!link) return;
    await link.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    link.remoteReady = true;
    await flushLink(link);
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
  patch({ phase: 'outgoing', peerName: title || 'Group call', peerId: '', error: '', callId: '', connectedAt: 0 });
  nativeCallScreen(true);
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: true });
    const call = await api.post<{ id: string }>('/team-calls', { conversation_id: conversationId });
    callId = call.id;
    patch({ callId: call.id });
    startWatch();
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
    patch({ phase: 'connecting', peerName: names.length ? names.join(', ') : getSnapshot().peerName });
    startWatch();
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
  nativeCallScreen(true);
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
    await flushIce();
    await pullSignals();
    startWatch();
  } catch (err: any) {
    idle(err?.message || 'Could not answer. Allow the microphone and try again.');
  }
}

export async function acceptFromNative(id: string) {
  if (!id) return;
  const snap = getSnapshot();
  if (snap.callId === id && (snap.phase === 'connecting' || snap.phase === 'live')) return;
  if (snap.phase === 'incoming' && snap.callId === id) {
    await acceptIncoming();
    return;
  }
  if (snap.phase !== 'idle') return;
  const call = await api.get<{ id: string; from_user_id: string; from_name: string; offer_sdp?: string | null; is_group?: boolean; title?: string | null; status: string }>(`/team-calls/${id}`);
  if (!call || !['ringing', 'accepted'].includes(call.status)) return;
  showIncoming(call);
  await acceptIncoming();
}

declare global {
  interface Window {
    __hbAcceptCall?: (id: string) => void;
    __hbDeclineCall?: (id: string) => void;
  }
}

window.__hbAcceptCall = (id: string) => { void acceptFromNative(id); };
window.__hbDeclineCall = (id: string) => {
  const snap = getSnapshot();
  if (snap.phase === 'incoming' && (!id || snap.callId === id)) void declineIncoming();
};

export async function declineIncoming() {
  const id = getSnapshot().callId;
  resetMedia();
  patch({ phase: 'idle', peerName: '', peerId: '', callId: '', connectedAt: 0, error: '' });
  if (id) await api.post(`/team-calls/${id}/decline`, {}).catch(() => {});
}

export async function hangUp() {
  const id = callId || getSnapshot().callId;
  const duration = talkSeconds();
  resetMedia();
  patch({ phase: 'idle', peerName: '', peerId: '', callId: '', connectedAt: 0, error: '' });
  if (id) await api.post(`/team-calls/${id}/end`, { duration_sec: duration }).catch(() => {});
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
      const phase = getSnapshot().phase === 'outgoing' ? 'connecting' : getSnapshot().phase;
      patch({ peerName: names && !names.includes(data.name) ? `${names}, ${data.name}` : (data.name || names), phase });
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
  if (data.action === 'signal' && data.signal?.kind === 'answer') {
    await takeAnswer(data.signal.sdp);
    await pullSignals();
    return;
  }
  if (data.action === 'signal' && data.signal?.kind === 'ice') {
    await addIce(data.signal.candidate as RTCIceCandidateInit);
    return;
  }
  if (['declined', 'ended', 'missed', 'cancelled'].includes(data.action)) {
    const error = data.action === 'declined' ? 'Call declined' : data.action === 'missed' ? 'No answer' : '';
    const ending = callId;
    const duration = talkSeconds();
    resetMedia();
    patch({
      phase: 'idle',
      peerName: '',
      peerId: '',
      callId: '',
      connectedAt: 0,
      error,
      ...(error ? { toast: { title: 'Call', body: error } } : {}),
    });
    if (ending && data.action === 'ended') api.post(`/team-calls/${ending}/end`, { duration_sec: duration }).catch(() => {});
  }
}
