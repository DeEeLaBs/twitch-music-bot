import fs from 'node:fs';
import path from 'node:path';
import type { BotConfig, ServerToClientMessage } from '../types.ts';
import { scheduleJsonWrite } from './atomicStore.ts';
import { botEvents } from './eventBus.ts';
import { EventSubClient } from './eventSubClient.ts';
import { applyAlert, emptyStats, normalizeStats, noteRequester, noteViewers, setGoal, type StreamStats } from '../streamStats.ts';
import type { StreamAlert } from '../streamAlerts.ts';

interface AlertHost {
  getConfig: () => BotConfig;
  getQueue: () => Array<{ id: string; requester?: { username?: string } }>;
  send: (message: ServerToClientMessage) => void;
}

let stats = emptyStats();
let started = false;
let generation = 0;
let send: AlertHost['send'] = () => {};
let client: EventSubClient | null = null;
let authCache: { token: string; clientId: string; broadcasterId: string; scopes: string[] } | null = null;
const seenTracks = new Set<string>();
const statsFile = path.join(process.cwd(), 'data', 'stream-stats.json');

export function getStreamStats(): StreamStats {
  return stats;
}

export function setStreamGoal(kind: 'follower' | 'sub', target: number): StreamStats {
  stats = setGoal(stats, kind, target);
  publish();
  return stats;
}

export function setStreamTimer(seconds: number): StreamStats {
  const duration = Math.max(0, Math.min(24 * 60 * 60, Math.round(seconds) || 0));
  stats = { ...stats, timerEndsAt: duration ? Date.now() + duration * 1000 : 0 };
  publish();
  return stats;
}

export function startStreamAlerts(host: AlertHost) {
  send = host.send;
  if (started) {
    void connect(host.getConfig);
    return;
  }
  started = true;
  try { stats = normalizeStats(JSON.parse(fs.readFileSync(statsFile, 'utf8'))); } catch { stats = emptyStats(); }
  for (const track of host.getQueue()) seenTracks.add(track.id);
  botEvents.on('queue:changed', () => {
    let changed = false;
    for (const track of host.getQueue()) {
      if (seenTracks.has(track.id)) continue;
      seenTracks.add(track.id);
      const name = track.requester?.username || '';
      if (!name) continue;
      stats = noteRequester(stats, name);
      changed = true;
    }
    if (changed) publish();
  });
  void connect(host.getConfig);
  botEvents.on('config:changed', keys => {
    if (keys.changedKeys.some(key => ['twitchChannel', 'twitchBotOauthToken', 'twitchClientId'].includes(key))) void connect(host.getConfig);
  });
  const viewers = setInterval(() => void pollViewers(), 60_000);
  viewers.unref();
}

function accept(alert: StreamAlert) {
  stats = applyAlert(stats, alert);
  publish();
  send({ type: 'alert', data: alert });
}

function publish() {
  scheduleJsonWrite(statsFile, stats, 200);
  send({ type: 'stats', data: stats });
}

async function connect(getConfig: () => BotConfig) {
  const mine = ++generation;
  client?.stop();
  const auth = await resolveAuth(getConfig());
  if (mine !== generation) return;
  authCache = auth;
  if (!auth) {
    console.info('[EventSub] Waiting for a broadcaster Twitch login with the alert scopes.');
    return;
  }
  client = new EventSubClient(accept, message => console.info(`[EventSub] ${message}`));
  client.start(auth);
}

async function resolveAuth(config: BotConfig) {
  const token = config.twitchBotOauthToken || '';
  const clientId = config.twitchClientId || '';
  const channel = config.twitchChannel || '';
  if (!token || !clientId || !channel) return null;
  try {
    const headers = { Authorization: `Bearer ${token}`, 'Client-Id': clientId };
    const validate = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!validate.ok) return null;
    const identity = await validate.json() as { user_id?: string; scopes?: string[] };
    const users = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!users.ok) return null;
    const body = await users.json() as { data?: Array<{ id?: string }> };
    const broadcasterId = body.data?.[0]?.id || '';
    if (!broadcasterId || (identity.user_id && identity.user_id !== broadcasterId)) return null;
    return { token, clientId, broadcasterId, scopes: identity.scopes || [] };
  } catch {
    return null;
  }
}

async function pollViewers() {
  if (!authCache) return;
  try {
    const response = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(authCache.broadcasterId)}`, {
      headers: { Authorization: `Bearer ${authCache.token}`, 'Client-Id': authCache.clientId },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return;
    const body = await response.json() as { data?: Array<{ viewer_count?: number }> };
    const viewers = body.data?.[0]?.viewer_count ?? 0;
    if (viewers === stats.viewers) return;
    stats = noteViewers(stats, viewers);
    publish();
  } catch { /* the next poll retries */ }
}
