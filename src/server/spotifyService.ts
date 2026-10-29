import crypto from 'node:crypto';
import { SecureTokenStore } from './secureTokenStore.ts';

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent?: number | null;
}

export interface SpotifyPlaybackSnapshot {
  connected: boolean;
  isPlaying: boolean;
  progressSeconds: number;
  durationSeconds: number;
  volume: number;
  trackUri?: string;
  trackId?: string;
  title?: string;
  artist?: string;
  albumArtUrl?: string;
  deviceId?: string;
  deviceName?: string;
}

type Listener = (snapshot: SpotifyPlaybackSnapshot) => void;
interface PendingAuth { verifier: string; expiresAt: number }

const REDIRECT_URI = 'http://127.0.0.1:3000/auth/spotify/callback';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'playlist-modify-public',
  'playlist-modify-private'
];

export class SpotifyService {
  private clientId = '';
  private preferredDeviceId = '';
  private lastActiveDeviceId = '';
  private accessToken = '';
  private accessTokenExpiresAt = 0;
  private refreshToken = '';
  private readonly secrets = new SecureTokenStore();
  private readonly authRequests = new Map<string, PendingAuth>();
  private readonly listeners = new Set<Listener>();
  private pollTimer: NodeJS.Timeout | null = null;
  private burstTimer: NodeJS.Timeout | null = null;
  private burstGeneration = 0;
  private lastSnapshot: SpotifyPlaybackSnapshot = { connected:false, isPlaying:false, progressSeconds:0, durationSeconds:0, volume:80 };
  private lastError = '';
  private profile: { id?: string; display_name?: string; product?: string } | null = null;

  constructor(clientId = '', preferredDeviceId = '') {
    this.clientId = clientId.trim();
    this.preferredDeviceId = preferredDeviceId.trim();
    this.refreshToken = this.secrets.get('spotifyRefreshToken');
  }

  updateConfig(clientId?: string, preferredDeviceId?: string) {
    if (typeof clientId === 'string') this.clientId = clientId.trim();
    if (typeof preferredDeviceId === 'string') this.preferredDeviceId = preferredDeviceId.trim();
  }

  start() {
    if (this.pollTimer || this.isBurstActive()) return;
    void this.poll();
  }

  stop() {
    this.clearBurst();
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private isBurstActive(): boolean {
    return this.burstTimer !== null;
  }

  private clearBurst() {
    this.burstGeneration++;
    if (this.burstTimer) {
      clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
  }

  triggerPollBurst(expectedTrackChangeFromUri?: string, expectedPlayingState?: boolean) {
    this.clearBurst();
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const currentGeneration = this.burstGeneration;
    const oldUri = expectedTrackChangeFromUri ?? this.lastSnapshot?.trackUri;
    const oldProgress = this.lastSnapshot?.progressSeconds ?? 0;

    // Read immediately after an action, then retry while Spotify still reports the old state.
    const delays = [200, 300, 450, 650, 1000];
    let step = 0;

    const executeStep = async () => {
      if (this.burstGeneration !== currentGeneration) return;

      const snapshot = await this.poll();

      if (this.burstGeneration !== currentGeneration) return;

      if (snapshot) {
        const newUri = snapshot.trackUri;
        const newProgress = snapshot.progressSeconds;

        const trackChanged = oldUri ? (Boolean(newUri) && newUri !== oldUri) : Boolean(newUri);
        const trackRestarted = Boolean(oldUri && newUri === oldUri && oldProgress > 5 && newProgress < 2);
        const playbackStopped = !snapshot.isPlaying && !newUri;
        const stateMatched = expectedPlayingState !== undefined ? snapshot.isPlaying === expectedPlayingState : false;

        if (trackChanged || trackRestarted || playbackStopped || stateMatched || step >= delays.length) {
          this.clearBurst();
          this.scheduleNextPoll(snapshot.isPlaying ? 2000 : 4000);
          return;
        }
      } else if (step >= delays.length) {
        this.clearBurst();
        this.scheduleNextPoll(4000);
        return;
      }

      const nextDelay = delays[step++];
      this.burstTimer = setTimeout(() => {
        void executeStep();
      }, nextDelay);
    };

    this.burstTimer = setTimeout(() => {
      void executeStep();
    }, 0);
  }

  private scheduleNextPoll(delayMs: number) {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.poll(), delayMs);
  }

  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(snapshot: SpotifyPlaybackSnapshot) { this.lastSnapshot = snapshot; for (const listener of this.listeners) listener({ ...snapshot }); }

  getStatus() {
    return {
      configured: Boolean(this.clientId),
      connected: Boolean(this.refreshToken),
      premium: this.profile?.product === 'premium',
      accountName: this.profile?.display_name || '',
      accountId: this.profile?.id || '',
      preferredDeviceId: this.preferredDeviceId,
      playback: { ...this.lastSnapshot },
      lastError: this.lastError,
      redirectUri: REDIRECT_URI,
      scopes: [...SCOPES]
    };
  }

  isConnected() { return Boolean(this.refreshToken); }
  isReadyForPlayback() { return this.isConnected() && this.profile?.product === 'premium'; }
  getLastError() { return this.lastError; }
  getSnapshot() { return { ...this.lastSnapshot }; }

  async createAuthorizationUrl(): Promise<string> {
    if (!this.clientId) throw new Error('Spotify Client ID fehlt. Bitte zuerst in den Einstellungen speichern.');
    const verifier = crypto.randomBytes(64).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(24).toString('base64url');
    this.authRequests.set(state, { verifier, expiresAt: Date.now() + 10 * 60_000 });
    for (const [key, pending] of this.authRequests) if (pending.expiresAt < Date.now()) this.authRequests.delete(key);
    const params = new URLSearchParams({
      response_type: 'code', client_id: this.clientId, scope: SCOPES.join(' '), redirect_uri: REDIRECT_URI,
      state, code_challenge_method: 'S256', code_challenge: challenge, show_dialog: 'true'
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string) {
    const pending = this.authRequests.get(state);
    this.authRequests.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new Error('Spotify-Anmeldung ist abgelaufen oder ungültig. Bitte erneut verbinden.');
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: pending.verifier
    });
    const response = await fetch('https://accounts.spotify.com/api/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body, signal:AbortSignal.timeout(12_000) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof payload.access_token !== 'string') throw new Error(`Spotify Token-Austausch fehlgeschlagen (HTTP ${response.status}).`);
    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000 - 60_000;
    if (typeof payload.refresh_token === 'string' && payload.refresh_token) { this.refreshToken = payload.refresh_token; this.secrets.set('spotifyRefreshToken', payload.refresh_token); }
    await this.refreshProfile();
    this.lastError = '';
    return this.getStatus();
  }

  disconnect() {
    this.refreshToken = '';
    this.secrets.set('spotifyRefreshToken', '');
    this.accessToken = '';
    this.accessTokenExpiresAt = 0;
    this.profile = null;
    this.lastSnapshot = { connected:false, isPlaying:false, progressSeconds:0, durationSeconds:0, volume:80 };
    this.lastError = '';
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;
    const refreshToken = this.refreshToken;
    if (!refreshToken) throw new Error('Spotify ist nicht verbunden.');
    if (!this.clientId) throw new Error('Spotify Client ID fehlt.');
    const body = new URLSearchParams({ client_id:this.clientId, grant_type:'refresh_token', refresh_token:refreshToken });
    const response = await fetch('https://accounts.spotify.com/api/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body, signal:AbortSignal.timeout(12_000) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof payload.access_token !== 'string') throw new Error(`Spotify Token konnte nicht erneuert werden (HTTP ${response.status}).`);
    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000 - 60_000;
    if (typeof payload.refresh_token === 'string' && payload.refresh_token) { this.refreshToken = payload.refresh_token; this.secrets.set('spotifyRefreshToken', payload.refresh_token); }
    return this.accessToken;
  }

  async getAccessToken() { return this.token(); }

  private async api(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const access = await this.token();
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${access}`);
    const response = await fetch(`https://api.spotify.com/v1${path}`, { ...init, headers, signal:init.signal || AbortSignal.timeout(12_000) });
    if (response.status === 401 && retry) {
      this.accessToken = ''; this.accessTokenExpiresAt = 0;
      return this.api(path, init, false);
    }
    if (response.status === 429) {
      const wait = response.headers.get('retry-after') || '?';
      throw new Error(`Spotify Rate Limit aktiv. Erneut in ${wait}s versuchen.`);
    }
    return response;
  }

  private async refreshProfile() {
    const response = await this.api('/me');
    if (!response.ok) throw new Error(`Spotify Profil konnte nicht geladen werden (HTTP ${response.status}).`);
    this.profile = await response.json() as typeof this.profile;
    if (this.profile?.product !== 'premium') this.lastError = 'Spotify Premium ist für Playback erforderlich.';
  }

  async devices(): Promise<SpotifyDevice[]> {
    const response = await this.api('/me/player/devices');
    if (!response.ok) throw new Error(`Spotify Geräte konnten nicht geladen werden (HTTP ${response.status}).`);
    const payload = await response.json() as { devices?: SpotifyDevice[] };
    return Array.isArray(payload.devices) ? payload.devices.filter(device => Boolean(device.id)) : [];
  }

  setPreferredDevice(deviceId: string) { this.preferredDeviceId = deviceId.trim(); }

  private async targetDeviceId(): Promise<string | undefined> {
    const devices = await this.devices().catch(() => []);
    const active = devices.find(device => device.is_active);
    if (active?.id) {
      this.lastActiveDeviceId = active.id;
      return active.id;
    }
    const lastId = this.lastActiveDeviceId || this.lastSnapshot?.deviceId;
    if (lastId && devices.some(device => device.id === lastId)) {
      return lastId;
    }
    if (this.preferredDeviceId && devices.some(device => device.id === this.preferredDeviceId)) {
      return this.preferredDeviceId;
    }
    return devices[0]?.id || this.preferredDeviceId || undefined;
  }

  async transferPlayback(deviceId: string, play = false) {
    const response = await this.api('/me/player', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({device_ids:[deviceId], play}) });
    if (!response.ok && response.status !== 204) throw new Error(`Spotify Gerätewechsel fehlgeschlagen (HTTP ${response.status}).`);
    this.preferredDeviceId = deviceId;
    return true;
  }

  async playPlaylist(uri: string): Promise<boolean> {
    if (!/^spotify:playlist:[A-Za-z0-9]{22}$/.test(uri)) throw new Error('Ungültige Spotify-Playlist.');
    return this.playUri(uri);
  }

  async playUri(uri: string): Promise<boolean> {
    if (!this.isReadyForPlayback()) { await this.refreshProfile(); if (!this.isReadyForPlayback()) throw new Error('Spotify Premium ist nicht aktiv.'); }
    const deviceId = await this.targetDeviceId();
    if (!deviceId) throw new Error('Kein Spotify-Connect-Gerät verfügbar. Öffne Spotify oder den SDK-Player.');
    if (uri.startsWith('spotify:playlist:')) {
      const shuffle = await this.api(`/me/player/shuffle?state=true&device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
      if (!shuffle.ok) throw new Error(`Spotify-Playlist: Shuffle fehlgeschlagen (HTTP ${shuffle.status}).`);
    }
    const body = uri.startsWith('spotify:playlist:') ? { context_uri: uri, position_ms: 0 } : { uris: [uri], position_ms: 0 };
    const response = await this.api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (!response.ok && response.status !== 204) throw new Error(`Spotify Wiedergabe fehlgeschlagen (HTTP ${response.status}).`);
    this.preferredDeviceId = deviceId;
    if (typeof this.triggerPollBurst === 'function') {
      this.triggerPollBurst();
    }
    return true;
  }

  async play(): Promise<boolean> {
    const d = await this.targetDeviceId();
    const r = await this.api(`/me/player/play${d ? `?device_id=${encodeURIComponent(d)}` : ''}`, { method: 'PUT' });
    if (!r.ok && r.status !== 204) throw new Error(`Spotify Play fehlgeschlagen (HTTP ${r.status}).`);
    if (typeof this.triggerPollBurst === 'function') this.triggerPollBurst(undefined, true);
    return true;
  }

  async pause(): Promise<boolean> {
    const d = await this.targetDeviceId();
    const r = await this.api(`/me/player/pause${d ? `?device_id=${encodeURIComponent(d)}` : ''}`, { method: 'PUT' });
    if (!r.ok && r.status !== 204) throw new Error(`Spotify Pause fehlgeschlagen (HTTP ${r.status}).`);
    if (typeof this.triggerPollBurst === 'function') this.triggerPollBurst(undefined, false);
    return true;
  }

  async next(): Promise<boolean> {
    const d = await this.targetDeviceId();
    const r = await this.api(`/me/player/next${d ? `?device_id=${encodeURIComponent(d)}` : ''}`, { method: 'POST' });
    if (!r.ok && r.status !== 204) throw new Error(`Spotify Skip fehlgeschlagen (HTTP ${r.status}).`);
    if (typeof this.triggerPollBurst === 'function') this.triggerPollBurst(this.lastSnapshot?.trackUri);
    return true;
  }

  async previous(): Promise<boolean> {
    const d = await this.targetDeviceId();
    const r = await this.api(`/me/player/previous${d ? `?device_id=${encodeURIComponent(d)}` : ''}`, { method: 'POST' });
    if (!r.ok && r.status !== 204) throw new Error(`Spotify Zurück fehlgeschlagen (HTTP ${r.status}).`);
    if (typeof this.triggerPollBurst === 'function') this.triggerPollBurst(this.lastSnapshot?.trackUri);
    return true;
  }

  async setVolume(volume: number): Promise<boolean> {
    const d = await this.targetDeviceId();
    const v = Math.max(0, Math.min(100, Math.round(volume)));
    const r = await this.api(`/me/player/volume?volume_percent=${v}${d ? `&device_id=${encodeURIComponent(d)}` : ''}`, { method: 'PUT' });
    if (!r.ok && r.status !== 204) throw new Error(`Spotify Lautstärke fehlgeschlagen (HTTP ${r.status}).`);
    this.lastSnapshot = { ...this.lastSnapshot, volume: v };
    this.scheduleNextPoll(200);
    return true;
  }

  async searchTrack(query: string): Promise<any> {
      const trimmed = query.trim();
      const uriMatch = /^spotify:track:([A-Za-z0-9]{22})$/i.exec(trimmed);
      let trackId = uriMatch?.[1];
      if (!trackId) {
        try {
          const url = new URL(trimmed);
          if (url.hostname.toLowerCase() === 'open.spotify.com') {
            trackId = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:\/|$)/i)?.[1];
          }
        } catch { /* Plain text search. */ }
      }
      const response = trackId
        ? await this.api(`/tracks/${encodeURIComponent(trackId)}`)
        : await this.api(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
      if (!response.ok) throw new Error(`Spotify Suche fehlgeschlagen (HTTP ${response.status}).`);
      const data = await response.json() as any;
      const track = trackId ? data : data.tracks?.items?.[0];
    if (!track) throw new Error('Kein Spotify-Treffer für die Suchanfrage gefunden.');
    
    return {
      videoId: `spotify-${track.id}`,
      title: track.name,
      artist: track.artists.map((a: any) => a.name).join(', '),
      duration: Math.round(track.duration_ms / 1000),
      thumbnailUrl: track.album?.images?.[0]?.url || '',
      url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
      requestSource: 'spotify',
      spotifyUri: track.uri
    };
  }

  async addToPlaylist(playlistIdOrUri: string, trackUri: string): Promise<{ success: boolean; error?: string }> {
    try {
      const match = playlistIdOrUri.match(/([a-zA-Z0-9]{22})/);
      const playlistId = match ? match[1] : playlistIdOrUri;
      if (!playlistId) return { success: false, error: 'Ungültige Playlist-ID' };

      const response = await this.api(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [trackUri] })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as any;
        const msg = data?.error?.message || `HTTP ${response.status}`;
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  async waitForUri(uri: string, timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.poll();
      if (this.lastSnapshot.trackUri === uri && this.lastSnapshot.connected) return true;
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    return false;
  }

  private isPolling = false;
  async poll(): Promise<SpotifyPlaybackSnapshot | null> {
    if (!this.isConnected() || !this.clientId) {
      if (!this.isBurstActive()) this.scheduleNextPoll(5000);
      return null;
    }
    if (this.isPolling) return null;
    this.isPolling = true;
    let nextDelay = 3000;
    try {
      if (!this.profile) await this.refreshProfile();
      const response = await this.api('/me/player');
      if (response.status === 204) {
        const emptySnapshot: SpotifyPlaybackSnapshot = {
          connected: true,
          isPlaying: false,
          progressSeconds: 0,
          durationSeconds: 0,
          volume: this.lastSnapshot.volume,
          deviceId: this.preferredDeviceId || undefined
        };
        this.emit(emptySnapshot);
        nextDelay = 5000;
        return emptySnapshot;
      }
      if (!response.ok) throw new Error(`Spotify Playback-Status fehlgeschlagen (HTTP ${response.status}).`);
      const data = await response.json() as any;
      const item = data?.item;
      const isPlaying = Boolean(data?.is_playing);
      const snapshot: SpotifyPlaybackSnapshot = {
        connected:true,
        isPlaying,
        progressSeconds:Math.max(0, Number(data?.progress_ms || 0) / 1000),
        durationSeconds:Math.max(0, Number(item?.duration_ms || 0) / 1000),
        volume:Number.isFinite(data?.device?.volume_percent) ? data.device.volume_percent : this.lastSnapshot.volume,
        trackUri:typeof item?.uri === 'string' ? item.uri : undefined,
        trackId:typeof item?.id === 'string' ? item.id : undefined,
        title:typeof item?.name === 'string' ? item.name : undefined,
        artist:Array.isArray(item?.artists) ? item.artists.map((artist:any)=>artist?.name).filter(Boolean).join(', ') : undefined,
        albumArtUrl:Array.isArray(item?.album?.images) ? item.album.images[0]?.url : undefined,
        deviceId:typeof data?.device?.id === 'string' ? data.device.id : undefined,
        deviceName:typeof data?.device?.name === 'string' ? data.device.name : undefined
      };
      if (typeof data?.device?.id === 'string' && data.device.id) {
        this.lastActiveDeviceId = data.device.id;
      }
      this.lastError = '';
      this.emit(snapshot);
      const remaining = snapshot.durationSeconds - snapshot.progressSeconds;
      nextDelay = isPlaying ? (remaining > 0 && remaining < 4 ? 500 : 2000) : 4000;
      return snapshot;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emit({ ...this.lastSnapshot, connected:false });
      nextDelay = 8000;
      return null;
    } finally {
      this.isPolling = false;
      if (!this.isBurstActive()) {
        this.scheduleNextPoll(nextDelay);
      }
    }
  }
}

export { REDIRECT_URI as SPOTIFY_REDIRECT_URI, SCOPES as SPOTIFY_SCOPES };
