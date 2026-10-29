import fs from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { AppState, BadgeType, BotConfig, BotLog, ClientToServerMessage, QueueDelta, ServerToClientMessage, Track } from '../types.ts';
import { DEFAULT_OVERLAY_OPTIONS, type OverlayOptions } from '../overlayOptions.ts';
import { scheduleJsonWrite } from './atomicStore.ts';
import { ConfigService } from './configService.ts';
import { ChannelPointsService } from './channelPointsService.ts';
import { QueueManager } from './queueManager.ts';
import { TwitchBot } from './twitchBot.ts';
import { YouTubeResolver } from './youtubeResolver.ts';
import { YtmCompanionClient } from './ytmCompanion.ts';
import { logger } from './logger.ts';
import { pluginManager } from './pluginManager.ts';
import { botEvents } from './eventBus.ts';
import { SpotifyService } from './spotifyService.ts';
import { TwitchOAuthService } from './twitchOAuthService.ts';
import { SecureTokenStore } from './secureTokenStore.ts';
import { resolveForPlaybackProvider } from './playbackResolver.ts';
import { getStreamerAvatar } from './streamerAvatarService.ts';
import { StreamPlaylistService } from './streamPlaylistService.ts';

try { process.loadEnvFile?.(); } catch {}

export class BotService {
  public getStreamerAvatar() {
    return getStreamerAvatar(this.config.twitchChannel || '', this.config.twitchClientId || '', this.config.twitchBotOauthToken || '');
  }
  private config: BotConfig;
  private configService: ConfigService;
  private ytmCompanion: YtmCompanionClient;
  private queueManager: QueueManager;
  private spotifyService: SpotifyService;
  private twitchBot: TwitchBot;
  private streamPlaylistService: StreamPlaylistService;
  private twitchOAuth: TwitchOAuthService;
  private twitchRefreshTimer: NodeJS.Timeout | null = null;
  private logs: BotLog[] = [];
  private wsServer: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private channelPointsValidation: unknown = null;
  private rewardValidationTimer: NodeJS.Timeout | null = null;
  private lastQueueForWs: Track[] = [];
  private lastQueueSlices = new Map<keyof Pick<AppState, 'playback' | 'queue' | 'history' | 'voteSkip' | 'blacklist'>, string>();
  private activeOverlay: OverlayOptions;

  constructor() {
    this.configService = new ConfigService();
    this.config = this.configService.get();
    const overlayConfigFile = path.join(process.cwd(), 'data', 'overlay-config.json');
    let initialOverlay: OverlayOptions = DEFAULT_OVERLAY_OPTIONS;
    try {
      if (fs.existsSync(overlayConfigFile)) {
        const parsed = JSON.parse(fs.readFileSync(overlayConfigFile, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          initialOverlay = { ...DEFAULT_OVERLAY_OPTIONS, ...parsed, positions: { ...DEFAULT_OVERLAY_OPTIONS.positions, ...parsed.positions } };
        }
      }
    } catch {}
    this.activeOverlay = initialOverlay;
    botEvents.on('playlist:track_added', data => this.broadcast({ type: 'playlist:track_added', data }));
    botEvents.on('config:changed', ({changedKeys}) => logger.log('info','CONFIG','Konfiguration geändert',{changedKeys}));
    botEvents.on('search:resolved', payload => logger.log('debug','SEARCH','Song-Suche aufgelöst',payload));
    botEvents.on('search:failed', payload => logger.log('warn','SEARCH','Song-Suche fehlgeschlagen',payload));
    botEvents.on('twitch:connection', payload => logger.log('info','TWITCH',payload.connected ? 'Twitch verbunden' : 'Twitch getrennt'));
    botEvents.on('twitch:auth_failed', async () => {
      logger.log('warn', 'TWITCH', 'Twitch-Login fehlgeschlagen. Versuche automatische Token-Erneuerung...');
      try {
        await this.twitchOAuth.forceRefresh();
        logger.log('info', 'TWITCH', 'Twitch-Token erfolgreich erneuert. Reconnect wird ausgeführt.');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.log('error', 'TWITCH', 'Automatische Token-Erneuerung fehlgeschlagen', { error: errorMsg });
        this.twitchOAuth.setAuthError(errorMsg);
        this.broadcastPatch({ config: this.publicConfig() });
      }
    });
    YouTubeResolver.configure({persistSearchCache:this.config.persistSearchCache});

    this.ytmCompanion = new YtmCompanionClient(this.config.ytmdaCompanionUrl, this.config.ytmdaAuthToken);
    this.spotifyService = new SpotifyService(this.config.spotifyClientId || '', this.config.spotifyPreferredDeviceId || '');
    this.queueManager = new QueueManager(this.config, this.ytmCompanion, this.spotifyService);
    this.streamPlaylistService = new StreamPlaylistService();
    this.twitchBot = new TwitchBot(this.config, this.queueManager, this.ytmCompanion, this.streamPlaylistService);
    this.lastQueueForWs = this.queueManager.getQueue().map(track => ({ ...track, requester: { ...track.requester } }));

    this.configService.onChange((config, changedKeys) => {
      this.config = config;
      YouTubeResolver.configure({persistSearchCache:config.persistSearchCache});
      this.ytmCompanion.updateConfig(config.ytmdaCompanionUrl, config.ytmdaAuthToken, config.simulationMode);
      this.spotifyService.updateConfig(config.spotifyClientId || '', config.spotifyPreferredDeviceId || '');
      this.queueManager.updateConfig(config);
      this.twitchBot.updateConfig(config);
      if (changedKeys.some(key => ['channelPointsEnabled','channelPointsRewardId','twitchChannel','twitchBotOauthToken','twitchClientId'].includes(String(key)))) {
        void this.refreshChannelPointsValidation();
      }
      this.broadcastPatch({ config: this.publicConfig() });
    });
    this.twitchOAuth = new TwitchOAuthService(() => this.configService.get(), (token, clientId, login) => {
      this.configService.update({ twitchBotOauthToken: token, twitchClientId: clientId, twitchBotUsername: login });
    });
    this.initListeners();
  }

  private initListeners() {
    // Twitch Log listener
    this.twitchBot.onLog((log) => {
      // addLog already pushes the new entry to connected clients.
      // Broadcasting the full state here as well can make the UI receive
      // the same chat entry twice in quick succession.
      this.addLog({...log, category:'TWITCH'}, 'TWITCH');
    });

    this.twitchBot.onConnectionChange(() => {
      this.broadcastPatch({ config: this.publicConfig() });
    });

    // YTM Companion Log listener
    this.ytmCompanion.onLog((type, message) => {
      // Log events are broadcast by addLog; no second full-state broadcast needed.
      this.addLog({
        id: `ytm-log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: Date.now(),
        type,
        message,
        category: 'YTM'
      }, 'YTM');
    });

    // Keep the dashboard header in sync with the real YTM connection state.
    // Pairing success alone is not enough: the chip should react to actual connect/disconnect events.
    this.ytmCompanion.onConnectionChange(() => {
      this.broadcastPatch({ config: this.publicConfig() });
    });

    // YTM Pairing State listener
    this.ytmCompanion.onPairingStateChange(() => {
      this.broadcastPatch({ pairing: this.ytmCompanion.getPairingState(), lastDiagnosis: this.ytmCompanion.getLastDiagnosticResult() || undefined });
    });

    // YTM Token Acquired listener
    this.ytmCompanion.onTokenAcquired((token) => {
      this.configService.setYtmToken(token);
      this.addLog({
        id: `token-log-${Date.now()}`,
        timestamp: Date.now(),
        type: 'info',
        category: 'YTM',
        message: this.config.language === 'en' ? 'YouTube Music Desktop App authorization token saved successfully!' : 'YouTube Music Desktop App Autorisierungs-Token erfolgreich gespeichert!'
      }, 'YTM');
    });

    // Spotify connection updates
    this.spotifyService.subscribe(() => {
      this.broadcastPatch({ config: this.publicConfig() });
    });

    // Queue & Playback updates. Only send slices that actually changed.
    this.queueManager.setOnStateChange(() => this.broadcastQueueDiff());

    // Add initial log
    this.addLog({
      id: 'init-log',
      timestamp: Date.now(),
      type: 'info',
      category: 'BOT',
      message: this.config.language === 'en' ? 'Twitch YTM Song Request Bot service initialized.' : 'Twitch YTM Song Request Bot Service initialisiert.'
    });
  }

  private async refreshChannelPointsValidation() {
    try { this.channelPointsValidation = await ChannelPointsService.validateSelectedReward(this.config); }
    catch (error) { this.channelPointsValidation = { ok:false, reason:error instanceof Error ? error.message : String(error) }; }
  }

  public async start(wss?: WebSocketServer) {
    try {
      await this.twitchOAuth.refreshIfNeeded();
    } catch (error) {
      logger.log('warn', 'TWITCH', 'Twitch-Token konnte nicht vor dem Start erneuert werden.', { error: String(error) });
    }
    if (!this.twitchRefreshTimer) {
      this.twitchRefreshTimer = setInterval(() => {
        void this.twitchOAuth.refreshIfNeeded().catch(error => logger.log('warn', 'TWITCH', 'Twitch-Token konnte nicht erneuert werden.', { error: String(error) }));
      }, 60_000);
      this.twitchRefreshTimer.unref();
    }
    if (wss) {
      this.wsServer = wss;
      this.wsServer.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);
        // Send initial full state immediately
        ws.send(JSON.stringify({ type: 'state', data: this.getFullState() }));

        ws.on('close', () => {
          this.clients.delete(ws);
        });

        ws.on('message', (raw: WebSocket.Data) => {
          try {
            const parsed = JSON.parse(raw.toString()) as ClientToServerMessage;
            if (parsed.type === 'get_state') {
              ws.send(JSON.stringify({ type: 'state', data: this.getFullState() }));
            }
          } catch {
            // Ignore
          }
        });
      });
    }

    this.ytmCompanion.setSimulationMode(this.config.simulationMode);
    this.syncActiveProvider();
    this.twitchBot.start();
    void this.refreshChannelPointsValidation(); this.rewardValidationTimer=setInterval(()=>void this.refreshChannelPointsValidation(),5*60*1000);
  }

  private syncActiveProvider() {
    // Current Playback is provider-independent. Keep both observers alive so
    // manually started tracks and persisted requests are detected immediately.
    this.ytmCompanion.start();
    this.spotifyService.start();
  }

  private addLog(log: BotLog, category: BotLog['category'] = log.category || 'BOT') {
    log.category = category;
    this.logs.unshift(log);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    logger.log(log.type === 'error' ? 'error' : log.type === 'warn' ? 'warn' : 'info', category || 'BOT', log.message, { user: log.user, badge: log.badge });
    this.broadcast({ type: 'log', data: log });
  }

  public broadcastState() {
    this.broadcast({ type: 'state', data: this.getFullState() });
  }

  private broadcast(payload: ServerToClientMessage) {
    const raw = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  private publicConfig(): BotConfig {
    return {
      ...this.config,
      twitchBotOauthToken: '',
      twitchClientSecret: '',
      ytmdaAuthToken: '',
      twitchTokenConfigured: Boolean(this.config.twitchBotOauthToken),
      twitchClientSecretConfigured: Boolean(this.config.twitchClientSecret),
      twitchAuthError: this.twitchBot.getAuthError() || (this.twitchOAuth.status().state === 'error' ? this.twitchOAuth.status().error : undefined),
      ytmTokenConfigured: Boolean(this.config.ytmdaAuthToken),
      spotifyConnected: this.spotifyService.isConnected(),
      spotifyPremium: this.spotifyService.getStatus().premium,
      companionConnected: this.ytmCompanion.getIsConnected(),
      twitchConnected: this.twitchBot.getIsConnected(),
      simulationMode: this.ytmCompanion.getIsSimulation(),
      playerPlugins: this.queueManager.playerRegistry.listDescriptors(this.config)
    };
  }

  private broadcastPatch(data: Partial<AppState>) {
    if (!Object.keys(data).length) return;
    this.broadcast({ type: 'patch', data });
  }

  private stateSliceSignature(key: keyof Pick<AppState, 'playback' | 'queue' | 'history' | 'voteSkip' | 'blacklist'>, value: unknown): string {
    // Playback is a small object and can change every second. The other slices can be
    // represented by stable IDs instead of serializing complete track objects on every tick.
    if (key === 'playback') return JSON.stringify(value);
    if (key === 'queue' || key === 'history') return (value as Track[]).map(track => track.id).join('\u001f');
    if (key === 'voteSkip') {
      const vote = value as AppState['voteSkip'];
      return `${vote.currentTrackId || ''}|${vote.requiredVotes}|${vote.votes.join('\u001f')}`;
    }
    return (value as AppState['blacklist']).map(rule => `${rule.id}:${rule.type}:${rule.term}`).join('\u001f');
  }

  private broadcastQueueDiff() {
    const current = {
      playback: this.queueManager.getPlaybackState(),
      queue: this.queueManager.getQueue(),
      history: this.queueManager.getHistory(),
      voteSkip: this.queueManager.getVoteSkipState(),
      blacklist: this.queueManager.getBlacklist()
    };
    const patch: Partial<AppState> = {};
    for (const key of Object.keys(current) as Array<keyof typeof current>) {
      const signature = this.stateSliceSignature(key, current[key]);
      if (this.lastQueueSlices.get(key) !== signature) {
        this.lastQueueSlices.set(key, signature);
        if (key === 'queue') {
          const before = this.lastQueueForWs;
          const after = current.queue;
          const beforeIds = before.map(track => track.id);
          const afterIds = after.map(track => track.id);
          const beforeSet = new Set(beforeIds);
          const afterSet = new Set(afterIds);
          let delta: QueueDelta = {op:'replace',queue:after};
          if (after.length === before.length + 1 && beforeIds.every(id => afterSet.has(id))) {
            const index = after.findIndex(track => !beforeSet.has(track.id));
            if (index >= 0) delta = {op:'add',track:after[index],index};
          } else if (after.length + 1 === before.length && afterIds.every(id => beforeSet.has(id))) {
            const removed = before.find(track => !afterSet.has(track.id));
            if (removed) delta = {op:'remove',trackId:removed.id};
          } else if (after.length === before.length && beforeIds.every(id => afterSet.has(id)) && afterIds.some((id, index) => id !== beforeIds[index])) {
            const targetIndex = new Map(afterIds.map((id, index) => [id, index]));
            for (let from = 0; from < before.length; from++) {
              const track = before[from];
              const to = targetIndex.get(track.id);
              if (to === undefined || from === to) continue;
              const simulated = [...beforeIds];
              simulated.splice(from, 1);
              simulated.splice(to, 0, track.id);
              if (simulated.every((id, index) => id === afterIds[index])) { delta = {op:'move',trackId:track.id,newIndex:to}; break; }
            }
          }
          this.lastQueueForWs = after.map(track => ({...track,requester:{...track.requester}}));
          this.broadcast({type:'queue_delta',data:delta});
        } else (patch as Record<string, unknown>)[key] = current[key];
      }
    }
    this.broadcastPatch(patch);
  }

  public getFullState(): AppState {
    return {
      config: this.publicConfig(),
      playback: this.queueManager.getPlaybackState(),
      queue: this.queueManager.getQueue(),
      history: this.queueManager.getHistory(),
      voteSkip: this.queueManager.getVoteSkipState(),
      blacklist: this.queueManager.getBlacklist(),
      logs: this.logs.slice(0, 100),
      pairing: this.ytmCompanion.getPairingState(),
      activeOverlay: this.activeOverlay,
      lastDiagnosis: this.ytmCompanion.getLastDiagnosticResult() || undefined
    };
  }

  public getActiveOverlay(): OverlayOptions {
    return this.activeOverlay;
  }

  public setActiveOverlay(options: Partial<OverlayOptions>): OverlayOptions {
    const merged: OverlayOptions = {
      ...this.activeOverlay,
      ...options,
      positions: {
        ...this.activeOverlay.positions,
        ...(options.positions || {})
      }
    };
    this.activeOverlay = merged;
    const overlayConfigFile = path.join(process.cwd(), 'data', 'overlay-config.json');
    scheduleJsonWrite(overlayConfigFile, merged);
    this.broadcast({ type: 'overlay_update', data: merged });
    this.broadcastPatch({ activeOverlay: merged });
    return merged;
  }

  public async startPairing() {
    return this.ytmCompanion.startPairing();
  }

  public cancelPairing() {
    this.ytmCompanion.cancelPairing();
    this.broadcastState();
  }

  public resetYtmPairingAndToken() {
    this.ytmCompanion.resetPairingAndToken();
    this.config = this.configService.update({ ytmdaAuthToken: '' }).config;
    this.broadcastState();
  }

  public async testYtmConnection() {
    return this.ytmCompanion.testConnectionDetailed();
  }

  public async getTwitchChannelPointRewards() {
    return ChannelPointsService.listRewards(this.config);
  }
  public async createChannelPointReward(title?: string, cost?: number) {
    const result=await ChannelPointsService.createSongRequestReward(this.config,title || (this.config.language==='en'?'Request a song':'Song wünschen'),Number(cost)||1000);
    const reward=result.reward; if(reward?.id) this.configService.update({channelPointsEnabled:true,channelPointsRewardId:reward.id}); return result;
  }
  public async validateChannelPointReward(){ return ChannelPointsService.validateSelectedReward(this.config); }
  public setRequesterBlocked(username:string,blocked:boolean){ const set=new Set((this.config.blockedRequesters||[]).map(x=>x.toLowerCase())); const key=username.toLowerCase(); blocked?set.add(key):set.delete(key); this.configService.update({blockedRequesters:[...set]}); return [...set]; }

  public getDiagnostics() {
    const playback = this.queueManager.getPlaybackState();
    return {
      timestamp: Date.now(),
      twitch: {
        connected: this.twitchBot.getIsConnected(),
        channel: this.config.twitchChannel || '',
        username: this.config.twitchBotUsername || '',
        credentialsConfigured: Boolean(this.config.twitchChannel && this.config.twitchBotUsername && this.config.twitchBotOauthToken),
        channelPointsEnabled: Boolean(this.config.channelPointsEnabled),
        rewardSelected: Boolean(this.config.channelPointsRewardId),
        reconnect: this.twitchBot.getReconnectDiagnostics()
      },
      spotify: this.spotifyService.getStatus(),
      youtubeMusic: {
        connected: this.ytmCompanion.getIsConnected(),
        simulationMode: this.ytmCompanion.getIsSimulation(),
        companionUrl: this.config.ytmdaCompanionUrl,
        tokenConfigured: Boolean(this.config.ytmdaAuthToken),
        lastError: this.ytmCompanion.getLastCommandError() || '',
        circuitBreaker: this.ytmCompanion.getCircuitDiagnostics(),
        commandScheduler: this.ytmCompanion.getCommandSchedulerDiagnostics()
      },
      queue: {
        length: this.queueManager.getQueue().length,
        currentSong: playback.currentSong?.title || '',
        status: playback.status || (playback.isPlaying ? 'playing' : 'paused')
      },
      resolver: YouTubeResolver.getDiagnostics(),
      security: this.configService.getSecurityDiagnostics(),
      channelPoints: this.channelPointsValidation,
      plugins: pluginManager.diagnostics(),
      persistence: { dataDir: 'data', configBackup: true, logRotation: '5MB' }
    };
  }

  public getSpotifyService() { return this.spotifyService; }
  public startTwitchOAuth(clientId: string, clientSecret?: string) { return this.twitchOAuth.start(clientId, clientSecret); }
  public getTwitchOAuthStatus() { return this.twitchOAuth.status(); }
  public pollTwitchOAuth() { return this.twitchOAuth.poll(); }
  public resumeTwitchOAuth(clientSecret?: string) { return this.twitchOAuth.resume(clientSecret); }
  public setSpotifyPreferredDevice(deviceId: string) {
    this.spotifyService.setPreferredDevice(deviceId);
    this.configService.update({ spotifyPreferredDeviceId: deviceId });
  }

  public updateConfig(newConfig: Partial<BotConfig> & { ytmAuthToken?: string; ytmCompanionUrl?: string }) {
    // Empty secret fields mean unchanged; explicit reset has its own endpoint.
    newConfig = { ...newConfig };
    for (const key of ['twitchBotOauthToken', 'twitchClientSecret', 'ytmdaAuthToken', 'ytmAuthToken'] as const) {
      if (typeof newConfig[key] === 'string' && !newConfig[key]!.trim()) delete newConfig[key];
    }
    if (newConfig.twitchBotOauthToken) {
      const secrets = new SecureTokenStore();
      secrets.set('twitchRefreshToken', '');
      secrets.set('twitchTokenExpiresAt', '');
    }
    const rawAuth = newConfig.ytmdaAuthToken ?? newConfig.ytmAuthToken;
    const rawUrl = newConfig.ytmdaCompanionUrl ?? newConfig.ytmCompanionUrl;
    
    // Clear logs if language changes
    const languageChanged = newConfig.language && newConfig.language !== this.config.language;
    if (languageChanged) {
        this.logs = [];
        this.addLog({
          id: `lang-switch-${Date.now()}`,
          timestamp: Date.now(),
          type: 'info',
          message: newConfig.language === 'en' ? 'Language switched to English. Chat logs cleared.' : 'Sprache auf Deutsch geändert. Chat-Logs geleert.'
        });
    }
    
    const patch: Partial<BotConfig> = { ...newConfig };
    if (rawAuth !== undefined) patch.ytmdaAuthToken = rawAuth.trim();
    if (rawUrl !== undefined && rawUrl.trim()) patch.ytmdaCompanionUrl = rawUrl.trim();

    return this.configService.update(patch).config;
  }

  public async requestSongManually(queryOrUrl: string, username: string = 'Streamer', badge: BadgeType = 'broadcaster') {
    const provider = this.config.playbackProvider;
    const resolved = await resolveForPlaybackProvider(queryOrUrl, this.config, this.spotifyService);
    if (provider !== this.config.playbackProvider) throw new Error('Der Player wurde während der Suche gewechselt. Bitte Song erneut anfragen.');
    const result = this.queueManager.addSong(resolved, {
      username: username.toLowerCase(),
      displayName: username,
      badge,
      color: '#FF6B6B'
    });

    if (result.success && result.track) {
      this.addLog({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        type: 'song',
        category: 'QUEUE',
        message: `Added #${result.position}: "${result.track.title}" by ${result.track.artist} (req by @${username})`,
        user: username,
        badge
      });
    }
    return result;
  }

  public getQueueManager(): QueueManager {
    return this.queueManager;
  }

  public getYtmCompanion(): YtmCompanionClient {
    return this.ytmCompanion;
  }

  public getTwitchBot(): TwitchBot {
    return this.twitchBot;
  }

  public getStreamPlaylistService(): StreamPlaylistService {
    return this.streamPlaylistService;
  }

  public shutdown() {
    this.configService.save();
    this.spotifyService.stop();
    if (this.twitchRefreshTimer) clearInterval(this.twitchRefreshTimer);
    if(this.rewardValidationTimer) clearInterval(this.rewardValidationTimer);
    this.twitchBot.disconnect();
    this.ytmCompanion.disconnect();
    for (const client of this.clients) {
      try { client.close(1001, 'Server shutdown'); } catch { /* best effort */ }
    }
    this.clients.clear();
  }
}

// Global singleton instance for server routes
export const botService = new BotService();
