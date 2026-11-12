import { api } from '../api/client';
import { getSnapshot, patch } from './store';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
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

const PEER: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

const MIC: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

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
let epoch = 0;
let hangingUp = false;
let dropTimer = 0;
let initialAnswer = false;
let pulling = false;
let iceBatch: RTCIceCandidateInit[] = [];
let iceTimer = 0;
const appliedIce = new Set<string>();
const seenSignalIds = new Set<string>();
const seenGroupKeys = new Set<string>();

type PeerLink = { pc: RTCPeerConnection; remoteReady: boolean; iceQueue: RTCIceCandidateInit[]; audio: HTMLAudioElement };
const peers = new Map<string, PeerLink>();
const linkRestarts = new WeakMap<RTCPeerConnection, number>();
const restartedLinks = new WeakSet<RTCPeerConnection>();

type SignalRow = { id: string; from_user_id: string; kind: string; payload: RTCIceCandidateInit | string };

export function bindRemoteAudio(fn: (stream: MediaStream | null) => void) {
  remoteHook = fn;
}

function nativeCallScreen(open: boolean) {
  const bridge = (window as unknown as { HotelBlockNative?: { callScreen?: (open: boolean) => void } }).HotelBlockNative;
  bridge?.callScreen?.(open);
}

export function setSpeaker(on: boolean) {
  patch({ speaker: on });
}

function stopWatch() {
  if (watchTimer) window.clearInterval(watchTimer);
  watchTimer = 0;
}

function resetMedia() {
  epoch += 1;
  hangingUp = true;
  stopWatch();
  if (dropTimer) window.clearTimeout(dropTimer);
  dropTimer = 0;
  if (pc) clearLinkRestart(pc);
  if (iceTimer) window.clearTimeout(iceTimer);
  iceTimer = 0;
  iceBatch = [];
  initialAnswer = false;
  pulling = false;
  local?.getTracks().forEach(track => {
    track.enabled = false;
    track.stop();
  });
  local = null;
  const closing = pc;
  pc = null;
  closing?.close();
  remoteHook?.(null);
  for (const link of peers.values()) {
    clearLinkRestart(link.pc);
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
    muted: false,
    speaker: true,
    link: 'ok',
    error,
    ...(error ? { toast: { title: 'Call', body: error } } : {}),
  });
  if (ending) api.post(`/team-calls/${ending}/end`, { duration_sec: duration }).catch(() => {});
}

function markLive() {
  const phase = getSnapshot().phase;
  if (phase !== 'connecting' && phase !== 'outgoing') return;
  patch({ phase: 'live', connectedAt: getSnapshot().connectedAt || Date.now(), link: 'ok', error: '' });
}

function clearLinkRestart(connection: RTCPeerConnection) {
  const timer = linkRestarts.get(connection);
  if (timer) window.clearTimeout(timer);
  linkRestarts.delete(connection);
}

function noteConnection(connection: RTCPeerConnection, endOnFail: boolean, remoteUserId = '') {
  if (hangingUp) return;
  const ice = connection.iceConnectionState;
  const state = connection.connectionState;
  const up = ice === 'connected' || ice === 'completed' || state === 'connected';
  if (up) {
    if (dropTimer) window.clearTimeout(dropTimer);
    dropTimer = 0;
    clearLinkRestart(connection);
    restartedLinks.delete(connection);
    if (getSnapshot().link !== 'ok') patch({ link: 'ok' });
    markLive();
    return;
  }
  const down = ice === 'disconnected' || ice === 'failed' || state === 'disconnected' || state === 'failed';
  if (!down || getSnapshot().phase === 'idle' || getSnapshot().phase === 'incoming') return;
  patch({ link: 'weak' });
  if (!linkRestarts.has(connection) && !restartedLinks.has(connection)) {
    linkRestarts.set(connection, window.setTimeout(() => {
      linkRestarts.delete(connection);
      const stillIce = connection.iceConnectionState;
      const stillState = connection.connectionState;
      if (hangingUp || stillIce === 'connected' || stillIce === 'completed' || stillState === 'connected') return;
      restartedLinks.add(connection);
      if (remoteUserId) void restartGroupLink(remoteUserId, connection);
      else void restartLink(connection);
    }, ice === 'failed' || state === 'failed' ? 400 : 4000));
  }
  if (!endOnFail || dropTimer) return;
  dropTimer = window.setTimeout(() => {
    dropTimer = 0;
    if (hangingUp || getSnapshot().phase === 'idle') return;
    const still = connection.iceConnectionState;
    const stillState = connection.connectionState;
    if (still === 'connected' || still === 'completed' || stillState === 'connected') return;
    idle('The network dropped. Try the call again.');
  }, 20000);
}

async function restartLink(connection: RTCPeerConnection) {
  if (hangingUp || !callId || connection.signalingState === 'closed') return;
  answerApplied = false;
  try {
    const offer = await connection.createOffer({ iceRestart: true });
    await connection.setLocalDescription(offer);
    await api.post(`/team-calls/${callId}/signal`, { kind: 'offer', sdp: offer.sdp });
    await tune(connection);
  } catch {
    restartedLinks.delete(connection);
  }
}

async function restartGroupLink(remoteUserId: string, connection: RTCPeerConnection) {
  if (hangingUp || !callId || connection.signalingState === 'closed') return;
  try {
    const offer = await connection.createOffer({ iceRestart: true });
    await connection.setLocalDescription(offer);
    await api.post(`/team-calls/${callId}/signal`, { kind: 'offer', to_user_id: remoteUserId, sdp: offer.sdp });
    await tune(connection);
  } catch {
    restartedLinks.delete(connection);
  }
}

function postSignal(body: Record<string, unknown>, again = true) {
  if (!callId) return;
  api.post(`/team-calls/${callId}/signal`, body).catch(() => {
    if (again && callId) window.setTimeout(() => postSignal(body, false), 1500);
  });
}

async function tune(connection: RTCPeerConnection) {
  const sender = connection.getSenders().find(item => item.track?.kind === 'audio');
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = 24000;
    await sender.setParameters(params);
  } catch { /* a phone that ignores the cap still connects */ }
}

function openMic() {
  return navigator.mediaDevices.getUserMedia({ audio: MIC, video: false });
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
  iceBatch.push(candidate);
  if (iceTimer) return;
  iceTimer = window.setTimeout(() => { void flushIcePosts(); }, 300);
}

async function flushIcePosts() {
  iceTimer = 0;
  const batch = iceBatch.splice(0);
  const failed: RTCIceCandidateInit[] = [];
  for (const candidate of batch) {
    try { await api.post(`/team-calls/${callId}/signal`, { kind: 'ice', candidate }); }
    catch { failed.push(candidate); }
  }
  if (failed.length && callId) {
    iceBatch = failed.concat(iceBatch);
    if (!iceTimer) iceTimer = window.setTimeout(() => { void flushIcePosts(); }, 1500);
  }
}

function openPeer() {
  pc = new RTCPeerConnection(PEER);
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
  await tune(pc);
  if (getSnapshot().phase === 'outgoing') patch({ phase: 'connecting' });
}

async function takeRemoteOffer(sdp: string) {
  if (!sdp || !pc || hangingUp) return;
  if (pc.signalingState === 'have-local-offer') {
    await pc.setLocalDescription({ type: 'rollback' });
  }
  if (pc.signalingState !== 'stable') return;
  await pc.setRemoteDescription({ type: 'offer', sdp });
  remoteReady = true;
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  answerApplied = true;
  await api.post(`/team-calls/${callId}/signal`, { kind: 'answer', sdp: answer.sdp });
  await flushIce();
  await tune(pc);
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
    else if (row.kind === 'answer' && typeof row.payload === 'string') await takeAnswer(row.payload);
    else if (row.kind === 'offer' && typeof row.payload === 'string') await takeRemoteOffer(row.payload);
  }
}

function applyMute() {
  const off = getSnapshot().muted;
  local?.getAudioTracks().forEach(track => { track.enabled = !off; });
}

export function toggleMute() {
  const phase = getSnapshot().phase;
  if (phase === 'idle' || phase === 'incoming') return;
  patch({ muted: !getSnapshot().muted });
  applyMute();
}

async function tickCall() {
  const id = callId;
  const gen = epoch;
  if (!id || pulling || getSnapshot().phase === 'idle') return;
  pulling = true;
  try {
    const row = await api.get<{ status: string; answer_sdp?: string | null }>(`/team-calls/${id}`);
    if (gen !== epoch || callId !== id || getSnapshot().phase === 'idle') return;
    if (['declined', 'ended', 'missed', 'cancelled'].includes(row.status)) {
      const endedByOther = row.status === 'ended' || row.status === 'cancelled';
      const error = row.status === 'declined' ? 'Call declined' : row.status === 'missed' ? 'No answer' : '';
      const duration = talkSeconds();
      resetMedia();
      patch({ phase: 'idle', peerName: '', peerId: '', callId: '', connectedAt: 0, muted: false, speaker: true, link: 'ok', error, ...(error ? { toast: { title: 'Call', body: error } } : {}) });
      if (endedByOther) api.post(`/team-calls/${id}/end`, { duration_sec: duration }).catch(() => {});
      return;
    }
    if (!group && !initialAnswer && row.status === 'accepted' && row.answer_sdp) {
      initialAnswer = true;
      await takeAnswer(row.answer_sdp);
    }
    if (gen !== epoch || !callId) return;
    if (group || remoteReady || getSnapshot().phase === 'connecting' || getSnapshot().phase === 'live') await pullSignals();
  } catch { /* the next tick retries */ }
  finally { pulling = false; }
}

function startWatch() {
  stopWatch();
  void tickCall();
  watchTimer = window.setInterval(() => { void tickCall(); }, 1000);
}

export async function startOutgoing(peer: { id: string; name: string }) {
  if (getSnapshot().phase !== 'idle') return;
  group = false;
  hangingUp = false;
  patch({ phase: 'outgoing', peerName: peer.name, peerId: peer.id, error: '', callId: '', connectedAt: 0, muted: false });
  nativeCallScreen(true);
  try {
    local = await openMic();
    applyMute();
    openPeer();
    local.getTracks().forEach(track => pc!.addTrack(track, local!));
    await tune(pc!);
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
  hangingUp = false;
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
  const connection = new RTCPeerConnection(PEER);
  local?.getTracks().forEach(track => connection.addTrack(track, local!));
  void tune(connection);
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', 'true');
  document.body.appendChild(audio);
  const link: PeerLink = { pc: connection, remoteReady: false, iceQueue: [], audio };
  connection.onicecandidate = event => {
    if (event.candidate && callId) postSignal({ kind: 'ice', to_user_id: remoteUserId, candidate: event.candidate.toJSON() });
  };
  connection.ontrack = event => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    audio.srcObject = stream;
    audio.play().catch(() => {});
  };
  connection.oniceconnectionstatechange = () => noteConnection(connection, false, remoteUserId);
  connection.onconnectionstatechange = () => noteConnection(connection, false, remoteUserId);
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
    if (link.pc.signalingState === 'have-local-offer') await link.pc.setLocalDescription({ type: 'rollback' });
    if (link.pc.signalingState !== 'stable') return;
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
  hangingUp = false;
  patch({ phase: 'outgoing', peerName: title || 'Group call', peerId: '', error: '', callId: '', connectedAt: 0, muted: false });
  nativeCallScreen(true);
  try {
    local = await openMic();
    applyMute();
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
    local = await openMic();
    applyMute();
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
    local = await openMic();
    applyMute();
    callId = snap.callId;
    openPeer();
    local.getTracks().forEach(track => pc!.addTrack(track, local!));
    await tune(pc!);
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
  patch({ phase: 'idle', peerName: '', peerId: '', callId: '', connectedAt: 0, muted: false, speaker: true, link: 'ok', error: '' });
  resetMedia();
  if (id) await api.post(`/team-calls/${id}/decline`, {}).catch(() => {});
}

export async function hangUp() {
  const id = callId || getSnapshot().callId;
  const duration = talkSeconds();
  patch({ phase: 'idle', peerName: '', peerId: '', callId: '', connectedAt: 0, muted: false, speaker: true, link: 'ok', error: '' });
  resetMedia();
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
      if (link) { link.pc.close(); link.audio.srcObject = null; link.audio.remove(); peers.delete(data.userId); }
      if (peers.size === 0 && getSnapshot().phase !== 'incoming' && getSnapshot().phase !== 'idle') hangUp();
      return;
    }
    if (data.action === 'peer-declined') {
      patch({ toast: { title: 'Group call', body: `${data.name} declined` } });
      return;
    }
  }
  if (!group && data.action === 'signal' && data.signal?.kind === 'offer') {
    await takeRemoteOffer(data.signal.sdp);
    return;
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
    const active = callId || getSnapshot().callId;
    if (!active || active !== id) return;
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
      muted: false,
      speaker: true,
      link: 'ok',
      error,
      ...(error ? { toast: { title: 'Call', body: error } } : {}),
    });
    if (ending && data.action === 'ended') api.post(`/team-calls/${ending}/end`, { duration_sec: duration }).catch(() => {});
  }
}
