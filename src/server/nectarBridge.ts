import { nectarArtworkKey, nectarArtworkCandidate } from '../nectarArtwork.ts';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.ts';
import type { Track } from '../types.ts';

export interface NectarPlaybackState {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  url?: string;
  isPlaying: boolean;
  progressSeconds: number;
  durationSeconds: number;
  playerApp?: string;
  updatedAt: number;
}

export interface NectarCommandEvent {
  action: 'play' | 'pause' | 'play_pause' | 'next' | 'previous' | 'volume';
  volume?: number;
  timestamp: number;
}

/**
 * NectarBridge manages the communication between NectarLink / Smartphone media
 * and the Twitch Music Bot. Supports both Windows GSMTC auto-listener and REST/webhook.
 */
export class NectarBridge extends EventEmitter {
  private static instance: NectarBridge | null = null;
  private currentState: NectarPlaybackState | null = null;
  private isConnected = false;
  private pendingCommands: NectarCommandEvent[] = [];
  private lastHeartbeat = 0;
  private commandTimeout = 5000;
  private watcherProcess: ChildProcess | null = null;
  private stopped = true;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private commandFilePath = path.join(process.cwd(), 'data', '.nectar-commands');
  private stdoutBuffer = '';
  private artworkGeneration = 0;
  private artworkRequests = new Map<string, Promise<string>>();
  private artworkCache = new Map<string, string>();
  private activeProvider: 'spotify' | 'youtube_music' = 'spotify';
  private trackUrlResolver: ((title: string, artist: string, provider: 'spotify' | 'youtube_music') => Promise<string | null>) | null = null;
  private urlCache = new Map<string, string>();
  private firstSeenMap = new Map<string, number>();
  private artworkResolver: ((title: string, artist: string, album?: string) => Promise<string | null>) | null = null;

  private resolveArtwork(title: string, artist: string, album?: string): Promise<string> {
    const key = nectarArtworkKey(title, artist, album);
    const existing = this.artworkRequests.get(key);
    if (existing) return existing;
    const request = this.loadArtwork(title, artist, album).finally(() => this.artworkRequests.delete(key));
    this.artworkRequests.set(key, request);
    return request;
  }

  private async loadArtwork(title: string, artist: string, album?: string): Promise<string> {
    const cleanTitle = title.replace(/\.(mp3|flac|wav|m4a|aac)$/i, '').trim();
    const cleanArtist = artist.split(/[\xB7\u00B7\u2022]/)[0].trim();
    const cacheKey = nectarArtworkKey(title, artist, album);
    if (this.artworkCache.has(cacheKey)) {
      return this.artworkCache.get(cacheKey) || '';
    }

    // Local cache file timestamps cannot establish which song owns an image.
    // 2. Delegate to registered artworkResolver (Spotify / YouTube Music)
    if (this.artworkResolver) {
      try {
        const resolved = await this.artworkResolver(cleanTitle, cleanArtist, album);
        if (resolved) {
          return resolved;
        }
      } catch (err) {
        logger.log('warn', 'BOT', `[NectarBridge] ArtworkResolver error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Robust multi-query online fallback (iTunes & Deezer)
    const noParensTitle = cleanTitle.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    const mainArtist = cleanArtist.replace(/[,&/].*$/, '').replace(/\s+feat\..*$/i, '').trim();

    const searchQueries: string[] = Array.from(new Set([
      [cleanTitle, album].filter(Boolean).join(' '),
      [cleanArtist, cleanTitle].filter(Boolean).join(' '),
      [mainArtist, noParensTitle].filter(Boolean).join(' '),
      [cleanArtist, album].filter(Boolean).join(' '),
      noParensTitle || cleanTitle
    ])).filter(Boolean);

    for (const q of searchQueries) {
      // Try iTunes
      try {
        const itunesUrl = 'https://itunes.apple.com/search?term=' + encodeURIComponent(q) + '&entity=song&limit=10';
        const res = await fetch(itunesUrl, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const data = await res.json() as { results?: Array<{ artworkUrl100?: string; trackName?: string; artistName?: string; collectionName?: string }> };
          const match = nectarArtworkCandidate(title, cleanArtist, album, (data.results || []).filter(item => item.artworkUrl100).map(item => ({ title: item.trackName, artist: item.artistName, album: item.collectionName, artwork: item.artworkUrl100! })));
          if (match) {
            const art = match.artwork.replace('100x100bb', '600x600bb');
            return art;
          }
        }
      } catch {}

      // Try Deezer
      try {
        const deezerUrl = 'https://api.deezer.com/search?q=' + encodeURIComponent(q) + '&limit=10';
        const res = await fetch(deezerUrl, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const data = await res.json() as { data?: Array<{ title?: string; artist?: { name?: string }; album?: { title?: string; cover_big?: string; cover_xl?: string } }> };
          const match = nectarArtworkCandidate(title, cleanArtist, album, (data.data || []).filter(item => item.album?.cover_xl || item.album?.cover_big).map(item => ({ title: item.title, artist: item.artist?.name, album: item.album?.title, artwork: item.album?.cover_xl || item.album?.cover_big })));
          if (match?.artwork) {
            return match.artwork;
          }
        }
      } catch {}
    }

    return '';
  }

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  public static getInstance(): NectarBridge {
    if (!NectarBridge.instance) {
      NectarBridge.instance = new NectarBridge();
    }
    return NectarBridge.instance;
  }

  public setActiveProvider(provider: 'spotify' | 'youtube_music'): void {
    if (this.activeProvider === provider) return;
    this.activeProvider = provider;
    if (this.currentState && this.currentState.title) {
      const cleanTitle = this.currentState.title.replace(/\.(mp3|flac|wav|m4a|aac)$/i, '').trim();
      const cacheKey = `${provider}:${cleanTitle} - ${this.currentState.artist}`.toLowerCase();
      const cached = this.urlCache.get(cacheKey);
      this.currentState = {
        ...this.currentState,
        url: cached || this.buildFallbackUrl(cleanTitle, this.currentState.artist, provider),
        updatedAt: Date.now()
      };
      this.emit('state', this.currentState);
      if (!cached && this.trackUrlResolver) {
        void this.resolveTrackUrl(cleanTitle, this.currentState.artist, provider);
      }
    }
  }

  public getActiveProvider(): 'spotify' | 'youtube_music' {
    return this.activeProvider;
  }

  public setTrackUrlResolver(resolver: (title: string, artist: string, provider: 'spotify' | 'youtube_music') => Promise<string | null>): void {
    this.trackUrlResolver = resolver;
    if (this.currentState && this.currentState.title) {
      const cleanTitle = this.currentState.title.replace(/\.(mp3|flac|wav|m4a|aac)$/i, '').trim();
      void this.resolveTrackUrl(cleanTitle, this.currentState.artist, this.activeProvider);
    }
  }

  public setCommandDirectory(dirPath: string): void {
    this.commandFilePath = dirPath;
  }

  public setArtworkResolver(resolver: (title: string, artist: string, album?: string) => Promise<string | null>): void {
    this.artworkResolver = resolver;
    if (this.currentState && this.currentState.title && !this.currentState.albumArtUrl) {
      const generation = this.artworkGeneration;
      void this.resolveArtwork(this.currentState.title, this.currentState.artist, this.currentState.album).then(art => {
        if (art && this.currentState && generation === this.artworkGeneration && !this.currentState.albumArtUrl) {
          this.currentState = { ...this.currentState, albumArtUrl: art, updatedAt: Date.now() };
          this.emit('state', this.currentState);
        }
      });
    }
  }

  public buildFallbackUrl(title: string, artist: string, provider: 'spotify' | 'youtube_music' = this.activeProvider): string {
    const query = [artist, title].filter(Boolean).join(' ').trim();
    if (!query) return 'https://github.com/thtbee/nectarlink';
    if (provider === 'spotify') {
      return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    }
    return `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
  }

  private async resolveTrackUrl(title: string, artist: string, provider: 'spotify' | 'youtube_music'): Promise<string> {
    const cleanTitle = title.replace(/\.(mp3|flac|wav|m4a|aac)$/i, '').trim();
    const cacheKey = `${provider}:${cleanTitle} - ${artist}`.toLowerCase();
    if (this.urlCache.has(cacheKey)) {
      return this.urlCache.get(cacheKey) || '';
    }
    if (!this.trackUrlResolver) {
      const fallback = this.buildFallbackUrl(cleanTitle, artist, provider);
      this.urlCache.set(cacheKey, fallback);
      return fallback;
    }
    try {
      const found = await this.trackUrlResolver(cleanTitle, artist, provider);
      const finalUrl = found || this.buildFallbackUrl(cleanTitle, artist, provider);
      this.urlCache.set(cacheKey, finalUrl);
      if (this.currentState && this.currentState.title === title && this.activeProvider === provider) {
        this.currentState = {
          ...this.currentState,
          url: finalUrl,
          updatedAt: Date.now()
        };
        this.emit('state', this.currentState);
      }
      return finalUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.log('warn', 'BOT', `[NectarBridge] Track URL resolution error: ${msg}`);
      const fallback = this.buildFallbackUrl(cleanTitle, artist, provider);
      this.urlCache.set(cacheKey, fallback);
      return fallback;
    }
  }

  /**
   * Starts the Windows GSMTC watcher process if on Windows.
   */
  public start(): void {
    this.stopped = false;
    if (process.platform !== 'win32') {
      logger.log('info', 'BOT', '[NectarBridge] Non-Windows platform; GSMTC watcher skipped, REST webhook ready.');
      return;
    }
    if (this.watcherProcess) {
      return;
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'nectar-watcher.ps1');
    if (!fs.existsSync(scriptPath)) {
      logger.log('warn', 'BOT', `[NectarBridge] Watcher script not found at ${scriptPath}`);
      return;
    }

    try {
      const dataDir = path.dirname(this.commandFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.watcherProcess = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-CommandFile',
          this.commandFilePath,
          '-PollIntervalMs',
          '1000'
        ],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );

      this.stdoutBuffer = '';

      this.watcherProcess.stdout?.on('data', (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString('utf8');
        const lines = this.stdoutBuffer.split(/\r?\n/);
        this.stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('{')) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.type === 'ready') {
              logger.log('info', 'BOT', '[NectarBridge] Windows GSMTC watcher ready');
            } else if (data.type === 'state') {
              this.updateState({
                title: data.title,
                artist: data.artist,
                album: data.album,
                albumArtUrl: data.albumArtUrl,
                isPlaying: Boolean(data.isPlaying),
                progressSeconds: Number(data.progressSeconds) || 0,
                durationSeconds: Number(data.durationSeconds) || 0,
                playerApp: data.playerApp || 'NectarLink Smartphone'
              });
            } else if (data.type === 'disconnected') {
              this.updateState({ title: '', artist: '', album: '', albumArtUrl: '', url: '', isPlaying: false, progressSeconds: 0, durationSeconds: 0 });
              this.isConnected = false;
            }
          } catch {
            // Ignore partial/unparseable output
          }
        }
      });

      this.watcherProcess.stderr?.on('data', (_errChunk: Buffer) => {
        // Silently capture stderr to avoid unhandled streams
      });

      this.watcherProcess.on('error', (err) => {
        logger.log('warn', 'BOT', `[NectarBridge] Watcher process error: ${err.message}`);
        this.cleanupWatcher();
        this.scheduleRestart();
      });

      this.watcherProcess.on('exit', (code) => {
        this.cleanupWatcher();
        if (!this.stopped) {
          logger.log('info', 'BOT', `[NectarBridge] Watcher exited (code ${code}), restarting in 5s...`);
          this.scheduleRestart();
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.log('warn', 'BOT', `[NectarBridge] Failed to spawn watcher: ${msg}`);
      this.scheduleRestart();
    }
  }

  private cleanupWatcher(): void {
    if (this.watcherProcess) {
      this.watcherProcess.stdout?.removeAllListeners();
      this.watcherProcess.stderr?.removeAllListeners();
      this.watcherProcess.removeAllListeners();
      this.watcherProcess = null;
    }
  }

  private scheduleRestart(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) {
        this.start();
      }
    }, 5000);
  }

  /**
   * Stops the watcher process.
   */
  public stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.watcherProcess) {
      try {
        this.watcherProcess.kill();
      } catch {
        // Ignore kill error
      }
      this.cleanupWatcher();
    }
  }

  /**
   * Updates playback state received from NectarLink / phone.
   */
  public updateState(payload: Partial<NectarPlaybackState>): NectarPlaybackState {
    const isPlaying = typeof payload.isPlaying === 'boolean' ? payload.isPlaying : (this.currentState?.isPlaying ?? false);
    const title = String(payload.title ?? this.currentState?.title ?? '').trim();
    const rawArtist = String(payload.artist ?? this.currentState?.artist ?? '').trim();
    const artist = rawArtist.split(/[\xB7\u00B7\u2022]/)[0].trim();
    const sameIdentity = this.currentState?.title === title && this.currentState?.artist === artist;
    const album = payload.album ?? (sameIdentity ? this.currentState?.album : undefined);
    const isSameTrack = sameIdentity && this.currentState?.album === album;
    if (!isSameTrack) this.artworkGeneration++;
    const generation = this.artworkGeneration;

    let albumArtUrl = (payload.albumArtUrl && payload.albumArtUrl.trim()) || (isSameTrack ? (this.currentState?.albumArtUrl || '') : '');
    const cleanTitle = title.replace(/\.(mp3|flac|wav|m4a|aac)$/i, '').trim();
    const artCacheKey = nectarArtworkKey(title, artist, album);
    if (!albumArtUrl && this.artworkCache.has(artCacheKey)) {
      albumArtUrl = this.artworkCache.get(artCacheKey) || '';
    }
    if (albumArtUrl) {
      this.artworkCache.set(artCacheKey, albumArtUrl);
    }

    const progressSeconds = typeof payload.progressSeconds === 'number' && Number.isFinite(payload.progressSeconds)
      ? Math.max(0, payload.progressSeconds)
      : (this.currentState?.progressSeconds ?? 0);
    const durationSeconds = typeof payload.durationSeconds === 'number' && Number.isFinite(payload.durationSeconds)
      ? Math.max(0, payload.durationSeconds)
      : (this.currentState?.durationSeconds ?? 0);
    const playerApp = payload.playerApp ?? this.currentState?.playerApp ?? 'NectarLink Phone';

    const urlCacheKey = `${this.activeProvider}:${cleanTitle} - ${artist}`.toLowerCase();
    let url = payload.url || (isSameTrack ? this.currentState?.url : undefined);
    if (!url && this.urlCache.has(urlCacheKey)) {
      url = this.urlCache.get(urlCacheKey);
    }
    if (!url && (cleanTitle || artist)) {
      url = this.buildFallbackUrl(cleanTitle, artist, this.activeProvider);
    }

    // Deduplicate rapid identical snapshots (e.g. stdout + REST webhook firing within milliseconds)
    const isRedundant = isSameTrack &&
      this.currentState !== null &&
      this.currentState.isPlaying === isPlaying &&
      this.currentState.albumArtUrl === albumArtUrl &&
      this.currentState.url === url &&
      this.currentState.durationSeconds === durationSeconds &&
      Math.abs(this.currentState.progressSeconds - progressSeconds) < 1;

    if (isRedundant) {
      this.lastHeartbeat = Date.now();
      return this.currentState;
    }

    this.currentState = {
      title,
      artist,
      album,
      albumArtUrl,
      url,
      isPlaying,
      progressSeconds,
      durationSeconds,
      playerApp,
      updatedAt: Date.now()
    };

    this.isConnected = true;
    this.lastHeartbeat = Date.now();
    this.emit('state', this.currentState);

    // If artwork is still missing, resolve in background and re-emit state
    if (!albumArtUrl && title) {
      void this.resolveArtwork(title, artist, album).then((resolvedArt) => {
        if (resolvedArt && this.currentState && generation === this.artworkGeneration && !this.currentState.albumArtUrl) {
          this.currentState = {
            ...this.currentState,
            albumArtUrl: resolvedArt,
            updatedAt: Date.now()
          };
          this.emit('state', this.currentState);
        }
      });
    }

    // If URL is fallback and resolver is available, resolve in background
    if (cleanTitle && this.trackUrlResolver && (!this.urlCache.has(urlCacheKey) || this.urlCache.get(urlCacheKey) === this.buildFallbackUrl(cleanTitle, artist, this.activeProvider))) {
      void this.resolveTrackUrl(cleanTitle, artist, this.activeProvider);
    }

    return this.currentState;
  }

  public getState(): NectarPlaybackState | null {
    if (!this.currentState) return null;
    if (Date.now() - this.lastHeartbeat > 45000) {
      this.isConnected = false;
    }
    return this.currentState;
  }

  public getIsConnected(): boolean {
    return this.isConnected && (Date.now() - this.lastHeartbeat <= 45000);
  }

  public getIsPlaying(): boolean {
    const state = this.getState();
    return Boolean(this.getIsConnected() && state?.isPlaying && state.title);
  }

  /**
   * Queue and dispatch a command to be executed on the phone via GSMTC / NectarLink.
   */
  public sendCommand(action: NectarCommandEvent['action'], volume?: number): Promise<boolean> {
    if (!['play', 'pause', 'play_pause', 'next', 'previous'].includes(action) || !this.getIsConnected()) return Promise.resolve(false);
    const cmd: NectarCommandEvent = {
      action,
      volume,
      timestamp: Date.now()
    };
    // One file per command prevents consecutive clicks overwriting each other.
    try {
      fs.mkdirSync(this.commandFilePath, { recursive: true });
      const filename = `${Date.now()}-${process.hrtime.bigint()}-${randomUUID()}.json`;
      const pending = path.join(this.commandFilePath, filename + '.tmp');
      fs.writeFileSync(pending, JSON.stringify(cmd), 'utf8');
      fs.renameSync(pending, path.join(this.commandFilePath, filename));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.log('warn', 'BOT', `[NectarBridge] Could not write command file: ${msg}`);
      return Promise.resolve(false);
    }
    this.pendingCommands.push(cmd);
    if (this.pendingCommands.length > 20) this.pendingCommands.shift();
    this.emit('command', cmd);

    // Immediately update optimistic state
    if (action === 'pause' && this.currentState) {
      this.currentState = { ...this.currentState, isPlaying: false, updatedAt: Date.now() };
      this.emit('state', this.currentState);
    } else if (action === 'play' && this.currentState) {
      this.currentState = { ...this.currentState, isPlaying: true, updatedAt: Date.now() };
      this.emit('state', this.currentState);
    }

    return Promise.resolve(true);
  }

  public popPendingCommands(): NectarCommandEvent[] {
    const now = Date.now();
    this.pendingCommands = this.pendingCommands.filter(c => now - c.timestamp <= this.commandTimeout);
    const result = [...this.pendingCommands];
    this.pendingCommands = [];
    return result;
  }

  /**
   * Converts the active Nectar phone state into a standard Track model for the bot.
   */
  public toTrack(): Track | null {
    const state = this.getState();
    if (!state || !state.title) return null;
    const trackId = `nectar-${state.title}-${state.artist}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!this.firstSeenMap.has(trackId)) {
      this.firstSeenMap.set(trackId, state.updatedAt || Date.now());
      if (this.firstSeenMap.size > 50) {
        const oldestKey = this.firstSeenMap.keys().next().value;
        if (oldestKey) this.firstSeenMap.delete(oldestKey);
      }
    }
    const requestedAt = this.firstSeenMap.get(trackId) || state.updatedAt;
    return {
      id: trackId,
      title: state.title,
      artist: state.artist || 'Smartphone',
      album: state.album,
      albumArtUrl: state.albumArtUrl || '',
      duration: state.durationSeconds,
      url: state.url || this.buildFallbackUrl(state.title, state.artist, this.activeProvider),
      requester: {
        username: 'nectar',
        displayName: state.playerApp || 'NectarLink Phone',
        badge: 'broadcaster'
      },
      requestedAt,
      requestSource: 'text',
      playbackProvider: this.activeProvider
    };
  }
}

export const nectarBridge = NectarBridge.getInstance();
