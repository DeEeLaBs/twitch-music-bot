import { io, Socket } from 'socket.io-client';
import type { Track, YtmPairingState, YtmDiagnosticResult } from '../types.ts';
import { CircuitBreaker } from './circuitBreaker.ts';

export interface YtmSongInfo {
  title: string; author: string; album?: string; cover?: string; duration?: number;
  elapsedSeconds?: number; isPaused?: boolean; volumePercent?: number; url?: string; id?: string; requestedId?: string;
}
export interface PlaybackUpdate {
  songInfo: YtmSongInfo | null; isPlaying: boolean; progressSeconds: number;
  durationSeconds: number; isConnected: boolean; volume?: number; adPlaying?: boolean;
}
export type PlaybackUpdateCallback = (data: PlaybackUpdate) => void;
export type YtmLogCallback = (type: 'info' | 'warn' | 'error', message: string) => void;
export type TokenAcquiredCallback = (token: string) => void;
export type PairingStateCallback = (state: YtmPairingState) => void;
export type ConnectionStateCallback = (connected: boolean) => void;
interface PairingCodeResponse { code?: string; }
interface PairingTokenResponse { token?: string; }


// Targets YTMDesktop 2.x / Companion API v1. Never guesses other servers or APIs.
export class YtmCompanionClient {
  private companionUrl: string;
  private authToken: string;
  private isConnected = false;
  private simulationMode = false;
  private ioSocket: Socket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private generation = 0;
  private lastRealtime = 0;
  private nextRequestAt = 0;
  private lastCommandError = '';
  private pairingAbortController: AbortController | null = null;
  private pairingState: YtmPairingState = { status: 'idle' };
  private lastDiagnosticResult: YtmDiagnosticResult | null = null;
  private callbacks = new Set<PlaybackUpdateCallback>();
  private logs = new Set<YtmLogCallback>();
  private tokens = new Set<TokenAcquiredCallback>();
  private pairingCallbacks = new Set<PairingStateCallback>();
  private connectionCallbacks = new Set<ConnectionStateCallback>();
  private lastEmittedConnection = false;
  private state: PlaybackUpdate = { songInfo: null, isPlaying: false, progressSeconds: 0, durationSeconds: 0, isConnected: false, volume: 80 };
  private readonly appId = 'twitchsongrequestbot';
  private breaker = new CircuitBreaker(5, 20000);
  private commandTail: Promise<void> = Promise.resolve();
  private commandQueueDepth = 0;
  private lastCommandAt = 0;
  private volumeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingVolume: number | null = null;
  private volumeWaiters: Array<(ok: boolean) => void> = [];
  private consecutiveFailures = 0;
  private consecutiveEmptyStates = 0;

  constructor(url = 'http://127.0.0.1:9863', token = '') {
    this.companionUrl = this.normalizeUrl(url);
    this.authToken = token.trim().replace(/^Bearer\s+/i, '');
  }
  private normalizeUrl(value: string) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Begleitserver: Basis-URL ohne Pfad oder Zugangsdaten verwenden.');
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    return url.origin;
  }
  public onLog(cb: YtmLogCallback) { this.logs.add(cb); return () => this.logs.delete(cb); }
  public onTokenAcquired(cb: TokenAcquiredCallback) { this.tokens.add(cb); return () => this.tokens.delete(cb); }
  public onPairingStateChange(cb: PairingStateCallback) { this.pairingCallbacks.add(cb); return () => this.pairingCallbacks.delete(cb); }
  public onConnectionChange(cb: ConnectionStateCallback) { this.connectionCallbacks.add(cb); return () => this.connectionCallbacks.delete(cb); }
  public subscribe(cb: PlaybackUpdateCallback) { this.callbacks.add(cb); return () => this.callbacks.delete(cb); }
  private log(type: 'info' | 'warn' | 'error', text: string) { for (const cb of this.logs) cb(type, text); }
  private emit() {
    this.state.isConnected = this.isConnected;
    if (this.lastEmittedConnection !== this.isConnected) {
      this.lastEmittedConnection = this.isConnected;
      for (const cb of this.connectionCallbacks) cb(this.isConnected);
    }
    for (const cb of this.callbacks) cb({ ...this.state });
  }
  private setPairingState(state: YtmPairingState) { this.pairingState = { ...state, updatedAt: Date.now() }; for (const cb of this.pairingCallbacks) cb(this.pairingState); }
  public getPairingState() { return this.pairingState; }
  public getIsConnected() { return this.isConnected; }
  public getIsSimulation() { return this.simulationMode; }
  public getStartConfirmationTimeout() { return 45000; }
  public getLastCommandError() { return this.lastCommandError; }
  public getLastDiagnosticResult() { return this.lastDiagnosticResult; }
  public getCircuitDiagnostics() { return this.breaker.diagnostics(); }
  public getCommandSchedulerDiagnostics() { return { queueDepth: this.commandQueueDepth, lastCommandAt: this.lastCommandAt, volumePending: this.pendingVolume !== null }; }
  public getAuthHeaders(): Record<string, string> { return this.authToken ? { Authorization: this.authToken, Accept: 'application/json' } : { Accept: 'application/json' }; }

  public updateConfig(url: string, token: string, simulationMode = false) {
    const nextUrl = this.normalizeUrl(url);
    const nextToken = token.trim().replace(/^Bearer\s+/i, '');
    if (nextUrl === this.companionUrl && nextToken === this.authToken && simulationMode === this.simulationMode) return;
    this.cancelPairing(); this.disconnect();
    this.companionUrl = nextUrl; this.authToken = nextToken; this.simulationMode = simulationMode;
    this.state = { songInfo: null, isPlaying: false, progressSeconds: 0, durationSeconds: 0, isConnected: false, volume: this.state.volume };
    this.emit(); this.start();
  }
  public setSimulationMode(enabled: boolean) { this.updateConfig(this.companionUrl, this.authToken, enabled); }
  public start() {
    if (this.timer) return;
    if (!this.simulationMode) void this.fetchSongInfo();
    this.timer = setInterval(() => {
      if (this.simulationMode) {
        if (this.state.isPlaying && this.state.songInfo) {
          this.state.progressSeconds = Math.min(this.state.durationSeconds, this.state.progressSeconds + 1);
          if (this.state.progressSeconds >= this.state.durationSeconds) this.state.isPlaying = false;
          this.emit();
        }
      } else if (Date.now() - this.lastRealtime > 2500) void this.fetchSongInfo();
    }, 1000);
  }
  public disconnect() {
    if (this.volumeTimer) { clearTimeout(this.volumeTimer); this.volumeTimer = null; }
    this.pendingVolume = null;
    const volumeWaiters = this.volumeWaiters.splice(0); for (const done of volumeWaiters) done(false);
    this.generation++; this.isConnected = false; this.nextRequestAt = 0;
    this.ioSocket?.removeAllListeners(); this.ioSocket?.disconnect(); this.ioSocket = null;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.emit();
  }
  private connectRealtime() {
    if (this.ioSocket || this.simulationMode) return;
    const generation = this.generation;
    this.ioSocket = io(`${this.companionUrl}/api/v1/realtime`, { transports: ['websocket'], auth: { token: this.authToken }, reconnectionDelay: 2000, reconnectionDelayMax: 10000 });
    this.ioSocket.on('state-update', data => { if (generation !== this.generation) return; this.lastRealtime = Date.now(); this.parseState(data); });
    this.ioSocket.on('disconnect', () => { this.lastRealtime = 0; });
    this.ioSocket.on('connect_error', () => { this.lastRealtime = 0; });
  }
  private parseState(data: any): boolean {
    if (!data?.player || !Object.prototype.hasOwnProperty.call(data, 'video')) return false;
    const p = data.player, v = data.video;
    this.isConnected = true;
    this.consecutiveFailures = 0;
    let cover = '';
    if (v) {
      if (typeof v.cover === 'string' && v.cover.trim()) cover = v.cover.trim();
      else if (typeof v.thumbnailUrl === 'string' && v.thumbnailUrl.trim()) cover = v.thumbnailUrl.trim();
      else if (typeof v.imageSrc === 'string' && v.imageSrc.trim()) cover = v.imageSrc.trim();
      else if (Array.isArray(v.thumbnails) && v.thumbnails.length > 0) {
        cover = v.thumbnails.at(-1)?.url || '';
      }
      if (!cover && v.id && /^[a-zA-Z0-9_-]{11}$/.test(v.id)) {
        cover = `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`;
      }
    }
    const duration = Math.max(0, Number(v?.durationSeconds) || Number(v?.duration) || Number(p?.durationSeconds) || Number(p?.duration) || 0);
    const isPlaying = p.trackState === 1 || (p.isPaused === false && (p.hasSong !== false || Boolean(v)));
    const emptyState = !v && p.hasSong === false && !p.adPlaying;
    if (emptyState && this.state.songInfo && ++this.consecutiveEmptyStates < 3) {
      this.state = { ...this.state, isConnected: true, isPlaying: false, adPlaying: false };
      this.lastCommandError = ''; this.emit(); return true;
    }
    this.consecutiveEmptyStates = emptyState ? this.consecutiveEmptyStates : 0;
    this.state = {
      isConnected: true, isPlaying, adPlaying: Boolean(p.adPlaying),
      progressSeconds: Math.max(0, Math.round(Number(p.videoProgress) || 0)), durationSeconds: duration,
      volume: Number.isFinite(p.volume) ? Math.max(0, Math.min(100, p.volume)) : this.state.volume,
      songInfo: v ? {
        title: v.title || '',
        author: v.author || '',
        id: v.id || '',
        requestedId: v.requestedId || '',
        album: v.album || '',
        cover,
        duration,
        volumePercent: p.volume
      } : null
    };
    this.lastCommandError = ''; this.emit(); return true;
  }
  private failure(status?: number) {
    const permanent = status === 401 || status === 403;
    this.consecutiveFailures++;
    this.lastCommandError = status === 401 || status === 403 ? 'Autorisierung abgelehnt (HTTP ' + status + '). Bitte neu koppeln.' : status === 429 ? 'Begleitserver: Zu viele Anfragen. Bitte kurz warten.' : status ? 'Begleitserver meldet HTTP ' + status + '.' : 'Begleitserver nicht erreichbar oder Zeitüberschreitung.';
    if (!permanent && this.isConnected && this.consecutiveFailures < 3) return;
    this.isConnected = false; this.state.isPlaying = false;
    if (status === 401 || status === 403) { this.ioSocket?.disconnect(); this.ioSocket = null; }
    this.emit();
  }
  public async fetchSongInfo(): Promise<YtmSongInfo | null> {
    if (this.simulationMode) return this.state.songInfo;
    if (this.polling || Date.now() < this.nextRequestAt || !this.breaker.canRun()) return null;
    this.polling = true; const generation = this.generation;
    this.nextRequestAt = Date.now() + 1000;
    try {
      const res = await fetch(`${this.companionUrl}/api/v1/state`, { headers: this.getAuthHeaders(), signal: AbortSignal.timeout(4000) });
      if (generation !== this.generation) return null;
      if (!res.ok) { this.breaker.failure(); if (res.status === 429) this.nextRequestAt = Date.now() + Math.max(10, Number(res.headers.get('retry-after')) || 10) * 1000; this.failure(res.status); return null; }
      const data = await res.json();
      if (generation !== this.generation) return null;
      if (!this.parseState(data)) { this.breaker.failure(); this.failure(); return null; }
      this.breaker.success(); this.connectRealtime(); return this.state.songInfo;
    } catch { this.breaker.failure(); if (generation === this.generation) this.failure(); return null; }
    finally { this.polling = false; }
  }
  private async executeCommand(command: string, data?: unknown): Promise<boolean> {
    this.lastCommandError = '';
    if (this.simulationMode) return true;
    if (!this.authToken) { this.failure(401); return false; }
    if (!this.breaker.canRun()) { this.lastCommandError='Begleitserver nach mehreren Fehlern kurz pausiert.'; return false; }
    if (Date.now() < this.commandRetryAt) { this.lastCommandError = 'Begleitserver: Bitte nach der Wartezeit erneut versuchen.'; return false; }
    const generation = this.generation;
    try {
      const res = await fetch(`${this.companionUrl}/api/v1/command`, { method: 'POST', headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ command, ...(data !== undefined ? { data } : {}) }), signal: AbortSignal.timeout(5000) });
      if (generation !== this.generation) return false;
      if (!res.ok) { this.breaker.failure(); if (res.status === 429) this.commandRetryAt = Date.now() + Math.max(10, Number(res.headers.get('retry-after')) || 10) * 1000; this.failure(res.status); return false; }
      const json = await res.json().catch(() => null);
      if (json && json.success === false) {
        this.lastCommandError = json.error === 'no_active_ytm_webContents'
          ? 'YouTube Music wird noch geladen. Bitte nach dem Aufbau des Webplayers erneut versuchen.'
          : json.error || 'Befehl fehlgeschlagen.';
        return false;
      }
      this.breaker.success();
      return true;
    } catch { this.breaker.failure(); if (generation === this.generation) this.failure(); return false; }
  }
  private command(command: string, data?: unknown): Promise<boolean> {
    this.commandQueueDepth++;
    return new Promise<boolean>((resolve) => {
      const run = async () => {
        const wait = Math.max(0, 140 - (Date.now() - this.lastCommandAt));
        if (wait) await new Promise(r => setTimeout(r, wait));
        this.lastCommandAt = Date.now();
        try { resolve(await this.executeCommand(command, data)); }
        finally { this.commandQueueDepth = Math.max(0, this.commandQueueDepth - 1); }
      };
      this.commandTail = this.commandTail.then(run, run).then(() => undefined, () => undefined);
    });
  }
  private commandRetryAt = 0;
  public async playTrack(track: Track, autoplayRadio = true) {
    if (!track.videoId || !/^[a-zA-Z0-9_-]{11}$/.test(track.videoId)) { this.lastCommandError = 'Ungültige Video-ID.'; return false; }
    if (this.getIsSimulation()) { this.state = { ...this.state, songInfo: { title: track.title, author: track.artist, id: track.videoId, cover: track.albumArtUrl }, durationSeconds: track.duration, progressSeconds: 0, isPlaying: true }; this.emit(); return true; }
    const ok = await this.command('changeVideo', { videoId: track.videoId, autoplayRadio });
    if (ok) {
      this.nextRequestAt = 0;
      void this.fetchSongInfo();
      setTimeout(() => { this.nextRequestAt = 0; void this.fetchSongInfo(); }, 500);
      setTimeout(() => { this.nextRequestAt = 0; void this.fetchSongInfo(); }, 1500);
      setTimeout(() => { this.nextRequestAt = 0; void this.fetchSongInfo(); }, 3000);
    }
    return ok;
  }
  public async playPause() {
    const ok = await this.command('playPause');
    if (ok) {
      if (this.getIsSimulation()) {
        this.state.isPlaying = !this.state.isPlaying;
        this.emit();
      } else {
        this.nextRequestAt = 0;
        void this.fetchSongInfo();
      }
    }
    return ok;
  }
  public async play() {
    const ok = await this.command('play');
    if (ok) {
      if (this.getIsSimulation()) {
        this.state.isPlaying = true;
        this.emit();
      } else {
        this.nextRequestAt = 0;
        void this.fetchSongInfo();
      }
    }
    return ok;
  }
  public async pause() {
    const ok = await this.command('pause');
    if (ok) {
      if (this.getIsSimulation()) {
        this.state.isPlaying = false;
        this.emit();
      } else {
        this.nextRequestAt = 0;
        void this.fetchSongInfo();
      }
    }
    return ok;
  }
  public async skipTrack() {
    const ok = await this.command('next');
    if (ok) {
      if (this.getIsSimulation()) {
        this.state.songInfo = null;
        this.state.isPlaying = false;
        this.emit();
      } else {
        this.nextRequestAt = 0;
        void this.fetchSongInfo();
        setTimeout(() => { this.nextRequestAt = 0; void this.fetchSongInfo(); }, 500);
        setTimeout(() => { this.nextRequestAt = 0; void this.fetchSongInfo(); }, 1200);
      }
    }
    return ok;
  }
  public async previousTrack() {
    const ok = await this.command('previous');
    if (ok) {
      if (this.getIsSimulation()) {
        this.state.progressSeconds = 0;
        this.emit();
      } else {
        this.nextRequestAt = 0;
        void this.fetchSongInfo();
        setTimeout(() => { this.nextRequestAt = 0; void this.fetchSongInfo(); }, 500);
      }
    }
    return ok;
  }
  public async setVolume(volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) { this.lastCommandError = 'Lautstärke muss zwischen 0 und 100 liegen.'; return false; }
    const rounded = Math.round(volume);
    this.state.volume = rounded;
    this.emit();
    if (this.getIsSimulation()) return true;
    this.pendingVolume = rounded;
    if (this.volumeTimer) clearTimeout(this.volumeTimer);
    return new Promise<boolean>((resolve) => {
      this.volumeWaiters.push(resolve);
      this.volumeTimer = setTimeout(async () => {
        this.volumeTimer = null;
        const value = this.pendingVolume ?? rounded;
        this.pendingVolume = null;
        const waiters = this.volumeWaiters.splice(0);
        const ok = await this.command('setVolume', value);
        if (ok) {
          this.state.volume = value;
          this.emit();
        }
        for (const done of waiters) done(ok);
      }, 100);
    });
  }

  private getAlternativeUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname === '127.0.0.1') { u.hostname = 'localhost'; return u.origin; }
      if (u.hostname === 'localhost') { u.hostname = '127.0.0.1'; return u.origin; }
      return null;
    } catch { return null; }
  }

  private friendlyErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error || '');
    if (raw === 'fetch failed' || (error as any)?.cause?.code === 'ECONNREFUSED' || raw.includes('ECONNREFUSED')) {
      return 'YouTube Music Desktop ist nicht erreichbar. Bitte stelle sicher, dass YTMDesktop 2.x gestartet ist und unter Einstellungen -> Integrationen der Begleitserver (Port 9863) aktiv ist.';
    }
    return raw || 'Kopplung fehlgeschlagen.';
  }

  public async startPairing(): Promise<{ success: boolean; code?: string; message: string }> {
    if (this.pairingAbortController) return { success: false, message: 'Eine Kopplung läuft bereits. Bitte bestätigen oder abbrechen.' };
    const controller = new AbortController(); this.pairingAbortController = controller;
    this.setPairingState({ status: 'requesting_code', message: 'Kopplungscode wird angefordert…' });
    try {
      let res: Response;
      const requestPayload = JSON.stringify({ appId: this.appId, appName: 'Twitch Song Request Bot', appVersion: '1.1.0' });
      try {
        res = await fetch(`${this.companionUrl}/api/v1/auth/requestcode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestPayload, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
      } catch (firstErr) {
        const alt = this.getAlternativeUrl(this.companionUrl);
        if (alt && !controller.signal.aborted) {
          res = await fetch(`${alt}/api/v1/auth/requestcode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestPayload, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
          this.companionUrl = alt;
        } else {
          throw firstErr;
        }
      }
      if (!res.ok) throw new Error(res.status === 403 ? 'Bitte in YTMDesktop die Begleitserver-Autorisierung aktivieren und erneut koppeln.' : `Kopplungsanfrage fehlgeschlagen: HTTP ${res.status}.`);
      const data = await res.json() as PairingCodeResponse;
      if (controller.signal.aborted) return { success: false, message: 'Kopplung abgebrochen.' };
      if (typeof data.code !== 'string' || !data.code) throw new Error('Kein gültiger Kopplungscode empfangen.');
      this.setPairingState({ status: 'waiting_for_user', code: data.code, message: 'Code vergleichen und in YouTube Music Desktop innerhalb von 30 Sekunden bestätigen.' });
      void this.exchangeToken(data.code, controller);
      return { success: true, code: data.code, message: 'Bitte in YouTube Music Desktop bestätigen.' };
    } catch (error) {
      const message = this.friendlyErrorMessage(error);
      if (!controller.signal.aborted) this.setPairingState({ status: 'error', error: message, message });
      if (this.pairingAbortController === controller) this.pairingAbortController = null;
      return { success: false, message };
    }
  }
  private async exchangeToken(code: string, controller: AbortController) {
    try {
      const res = await fetch(`${this.companionUrl}/api/v1/auth/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: this.appId, code }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) });
      if (!res.ok) throw new Error(`Autorisierung nicht bestätigt: HTTP ${res.status}. Bitte erneut koppeln.`);
      const data = await res.json() as PairingTokenResponse;
      if (controller.signal.aborted) return;
      if (typeof data.token !== 'string' || !data.token.trim()) throw new Error('Kein gültiger Token empfangen.');
      this.disconnect(); this.authToken = data.token.trim();
      // Persist the replacement token even if the following network verification fails.
      for (const cb of this.tokens) cb(this.authToken);
      const report = await this.testConnectionDetailed();
      if (controller.signal.aborted) return;
      if (report.authStatus !== 'valid') throw new Error(report.details);
      this.setPairingState({ status: 'success', message: 'Gekoppelt: Token gespeichert und am Begleitserver erfolgreich geprüft.' });
      this.log('info', 'YouTube Music: Kopplung erfolgreich geprüft.');
    } catch (error) {
      if (!controller.signal.aborted) { const message = this.friendlyErrorMessage(error); this.setPairingState({ status: 'error', error: message, message }); this.log('warn', message); }
    } finally { if (this.pairingAbortController === controller) this.pairingAbortController = null; this.start(); }
  }
  public cancelPairing() { this.pairingAbortController?.abort(); this.pairingAbortController = null; this.setPairingState({ status: 'idle' }); }
  public resetPairingAndToken() { this.cancelPairing(); this.disconnect(); this.authToken = ''; this.lastDiagnosticResult = null; for (const cb of this.tokens) cb(''); this.emit(); this.start(); }
  public async testConnectionDetailed(): Promise<YtmDiagnosticResult> {
    const generation = this.generation;
    let report: YtmDiagnosticResult;
    try {
      let res: Response;
      try {
        res = await fetch(`${this.companionUrl}/api/v1/state`, { headers: this.getAuthHeaders(), signal: AbortSignal.timeout(5000) });
      } catch (firstErr) {
        const alt = this.getAlternativeUrl(this.companionUrl);
        if (alt) {
          res = await fetch(`${alt}/api/v1/state`, { headers: this.getAuthHeaders(), signal: AbortSignal.timeout(5000) });
          this.companionUrl = alt;
        } else {
          throw firstErr;
        }
      }
      if (generation !== this.generation) throw new Error('Konfiguration wurde geändert. Diagnose erneut starten.');
      const valid = res.ok && this.parseState(await res.json().catch(() => null));
      if (!valid) this.failure(res.status);
      report = {
        reachable: true,
        resolvedUrl: this.companionUrl,
        httpStatus: res.status,
        authStatus: valid ? 'valid' : (res.status === 401 || res.status === 403) ? (this.authToken ? 'invalid_token' : 'needs_pairing') : 'none',
        details: valid
          ? 'Verbindung und Autorisierung erfolgreich geprüft.'
          : (res.status === 401 || res.status === 403)
          ? 'Der Begleitserver lehnt die Autorisierung ab. Neu koppeln; weitere Bot-Instanzen und parallele Kopplungen beenden.'
          : `Begleitserver antwortet mit HTTP ${res.status}, aber nicht mit einem gültigen Playerzustand. YTMDesktop 2.x erforderlich.`,
        tokenLength: this.authToken.length
      };
      if (valid) this.connectRealtime();
    } catch {
      if (generation === this.generation) this.failure();
      report = {
        reachable: false,
        resolvedUrl: this.companionUrl,
        authStatus: 'none',
        details: 'YouTube Music Desktop ist nicht erreichbar. Bitte stelle sicher, dass YTMDesktop 2.x gestartet ist und unter Einstellungen -> Integrationen der Begleitserver (Port 9863) aktiv ist.'
      };
    }
    if (generation === this.generation) this.lastDiagnosticResult = report;
    return report;
  }
}
