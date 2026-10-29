import WebSocket from 'ws';
import type { BadgeType, BotConfig, BotLog, Requester, Track } from '../types.ts';
import { QueueManager } from './queueManager.ts';
import { YouTubeResolver, ResolverError } from './youtubeResolver.ts';
import { resolveForPlaybackProvider } from './playbackResolver.ts';
import { YtmCompanionClient } from './ytmCompanion.ts';
import { isAuthenticationFailure, parsePrivmsg } from './twitchIrc.ts';
import { ChannelPointsService } from './channelPointsService.ts';
import { botEvents } from './eventBus.ts';
import { chatLanguage, localizeCompanionError, twitchMessage } from './twitchMessages.ts';
import { commandDefaultAllows, parseCommand } from './commandRegistry.ts';
import { StreamPlaylistService } from './streamPlaylistService.ts';

export type LogCallback = (log: BotLog) => void;

export class TwitchBot {
  private redemptionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private config: BotConfig;
  private queueManager: QueueManager;
  private ytmCompanion: YtmCompanionClient;
  private streamPlaylistService: StreamPlaylistService;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private authFailed = false;
  private authError = '';
  private lastReconnectDelayMs = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastNowPlayingTime: number = 0;
  private logCallbacks: Set<LogCallback> = new Set();
  private connectionCallbacks: Set<(connected: boolean) => void> = new Set();
  private commandTimes = new Map<string, number>();
  private globalRequestTime = 0;

  private t(key: string, args: Record<string, string | number> = {}): string { return twitchMessage(chatLanguage(this.config), key, args); }

  private localizeRuntimeError(error: string): string { return localizeCompanionError(chatLanguage(this.config), error); }

  constructor(
    config: BotConfig,
    queueManager: QueueManager,
    ytmCompanion: YtmCompanionClient,
    streamPlaylistService?: StreamPlaylistService
  ) {
    this.config = config;
    this.queueManager = queueManager;
    this.ytmCompanion = ytmCompanion;
    this.streamPlaylistService = streamPlaylistService || new StreamPlaylistService();
    for (const track of this.queueManager.getRedemptionTracks?.() || []) this.scheduleRedemption(track);
  }

  private scheduleRedemption(track: Track) {
    if (!track.redemptionId || !track.rewardId || !Number.isFinite(track.requestedAt) || this.redemptionTimers.has(track.id)) return;
    const timer = setTimeout(async () => {
      this.redemptionTimers.delete(track.id);
      try {
        const success = await ChannelPointsService.updateRedemptionStatus(this.config, track.rewardId!, track.redemptionId!, 'FULFILLED');
        if (success) this.queueManager.finishRedemption(track.id);
        else this.log('warn', `Channel points fulfillment failed for request ${track.id}`);
      } catch (error) { this.log('warn', `Channel points fulfillment failed: ${String(error)}`); }
    }, Math.max(0, 60001 - (Date.now() - track.requestedAt)));
    timer.unref();
    this.redemptionTimers.set(track.id, timer);
  }

  public onLog(cb: LogCallback): () => void { this.logCallbacks.add(cb); return () => this.logCallbacks.delete(cb); }
  public onConnectionChange(cb: (connected: boolean) => void): () => void { this.connectionCallbacks.add(cb); return () => this.connectionCallbacks.delete(cb); }
  private setConnectionState(connected: boolean) {
    if (this.isConnected === connected) return;
    this.isConnected = connected;
    botEvents.emit('twitch:connection', { connected });
    for (const cb of this.connectionCallbacks) cb(connected);
  }

  private log(type: BotLog['type'], message: string, user?: string, badge?: BadgeType) {
    const entry: BotLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      type,
      message,
      user,
      badge
    };
    for (const cb of this.logCallbacks) {
      cb(entry);
    }
  }

  public updateConfig(newConfig: Partial<BotConfig>) {
    const previous = this.config;
    const next = { ...previous, ...newConfig };
    const credsChanged =
      next.twitchChannel !== previous.twitchChannel ||
      next.twitchBotUsername !== previous.twitchBotUsername ||
      next.twitchBotOauthToken !== previous.twitchBotOauthToken;

    this.config = next;

    if (credsChanged) {
      this.authFailed = false;
      this.authError = '';
      this.reconnectAttempt = 0;
      this.disconnect(false);
      this.connect();
    }
  }

  public getAuthError(): string {
    return this.authFailed ? this.authError : '';
  }

  public getReconnectDiagnostics() {
    return {
      attempt: this.reconnectAttempt,
      authFailed: this.authFailed,
      nextDelayMs: this.lastReconnectDelayMs
    };
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public start() {
    this.connect();
  }

  private connect() {
    const channel = this.config.twitchChannel.trim().toLowerCase().replace(/^#/, '');
    const token = this.config.twitchBotOauthToken.trim();
    const botUser = this.config.twitchBotUsername.trim().toLowerCase().replace(/^#/, '');

    // If placeholder credentials, don't attempt live IRC connection, log notice
    if (!channel || !token || token.includes('your_oauth') || token.includes('MY_') || !botUser || botUser.includes('your_bot')) {
      this.log('info', this.config.language === 'en' ? 'Twitch credentials not configured yet. Live IRC idle (Interactive chat simulator active).' : 'Twitch-Zugangsdaten nicht konfiguriert. Live IRC inaktiv (Chat-Simulator aktiv).');
      return;
    }

    try {
      this.log('info', `Connecting to Twitch IRC for #${channel}...`);
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

      this.ws.on('open', () => {
        const formattedToken = token.startsWith('oauth:') ? token : `oauth:${token}`;
        this.ws?.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
        this.ws?.send(`PASS ${formattedToken}`);
        this.ws?.send(`NICK ${botUser}`);
        this.ws?.send(`JOIN #${channel}`);

        // Twitch IRC keep-alive ping every 4 minutes
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('PING :tmi.twitch.tv');
          }
        }, 240000);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        const raw = data.toString();
        this.handleRawIrc(raw);
      });

      this.ws.on('error', (err) => {
        this.log('error', `Twitch IRC Socket-Fehler: ${err.message}`);
        this.setConnectionState(false);
      });

      this.ws.on('close', () => {
        const wasConnected = this.isConnected;
        this.setConnectionState(false);
        if (wasConnected) {
          this.log('warn', this.config.language === 'en' ? 'Disconnected from Twitch. Reconnecting in 10s...' : 'Verbindung zu Twitch getrennt. Reconnect in 10s...');
        }
        this.scheduleReconnect();
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log('error', `Fehler bei Twitch-Initialisierung: ${message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.authFailed) return;
    const channel = this.config.twitchChannel.trim();
    const token = this.config.twitchBotOauthToken.trim();
    const botUser = this.config.twitchBotUsername.trim();
    if (!channel || !token || !botUser) return;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempt), 60000);
    this.lastReconnectDelayMs = delay;
    this.reconnectAttempt += 1;
    this.log('warn', this.config.language === 'en'
      ? `Twitch reconnect in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempt}).`
      : `Twitch-Reconnect in ${Math.round(delay / 1000)}s (Versuch ${this.reconnectAttempt}).`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  public sendMessage(text: string) {
    const channel = this.config.twitchChannel.trim().toLowerCase().replace(/^#/, '');
    // IRC messages must stay on one protocol line. Keep enough headroom below Twitch's
    // 512-byte IRC frame limit for tags/prefix/channel and avoid echoing control chars.
    const safeText = [...text.replace(/[\r\n\0]+/g, ' ').trim()].slice(0, 400).join('');
    if (!safeText) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && channel) {
      this.ws.send(`PRIVMSG #${channel} :${safeText}`);
    }
    this.log('bot', safeText, this.config.twitchBotUsername || 'Bot', 'broadcaster');
  }

  private handleRawIrc(raw: string) {
    const channel = this.config.twitchChannel.trim().toLowerCase().replace(/^#/, '');
    const botUser = this.config.twitchBotUsername.trim().toLowerCase();
    const lines = raw.split('\r\n');

    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('PING')) {
        this.ws?.send('PONG :tmi.twitch.tv');
        continue;
      }

      // Check login authentication response
      if (isAuthenticationFailure(line)) {
        this.setConnectionState(false);
        this.authFailed = true;
        this.authError = this.config.language === 'en'
          ? 'Twitch login failed: OAuth token expired or invalid. Please re-authorize in Settings.'
          : 'Twitch-Login fehlgeschlagen: Der OAuth-Token ist abgelaufen oder ungültig. Bitte in den Einstellungen neu autorisieren.';
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.log('error', this.authError);
        this.ws?.close();
        botEvents.emit('twitch:auth_failed', { reason: 'Login authentication failed' });
        return;
      }

      if (line.includes('001') || line.includes(`JOIN #${channel}`)) {
        if (!this.isConnected) {
          this.setConnectionState(true);
          this.authFailed = false;
          this.authError = '';
          this.reconnectAttempt = 0;
          this.lastReconnectDelayMs = 0;
          this.log('info', `Mit Twitch-Kanal #${channel} als @${botUser} verbunden! 🚀`);
        }
      }

      if (line.includes('PRIVMSG')) {
        void this.parsePrivMsg(line).catch(error => this.log('warn', `Twitch reward processing failed: ${String(error)}`));
      }
    }
  }

  private async parsePrivMsg(line: string) {
    const parsed = parsePrivmsg(line);
    if (!parsed) return;

    const { sender, message: messageBody, tags } = parsed;
    const badgesRaw = tags['badges'] || '';
    const badge = this.resolveBadge(badgesRaw, sender);
    const requester: Requester = {
      username: sender,
      displayName: tags['display-name'] || sender,
      badge,
      color: tags['color'] || '#9146FF'
    };

    const customRewardId = tags['custom-reward-id'];
    const isReward = Boolean(
      this.config.channelPointsEnabled &&
      this.config.channelPointsRewardId &&
      customRewardId === this.config.channelPointsRewardId
    );
    if (customRewardId && !isReward) return;
    // IRC's id is the chat message ID, not the channel-points redemption ID.
    let redemptionId = '';
    if (isReward) {
      const timestamp = Number(tags['tmi-sent-ts']) || Date.now();
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          redemptionId = await ChannelPointsService.findRedemptionId(this.config, customRewardId, tags['user-id'] || '', messageBody, timestamp);
          if (redemptionId) break;
          if (attempt < 2) await new Promise(resolve=>setTimeout(resolve, 400));
        }
        if (!redemptionId) this.log('warn', 'No unique channel-points redemption found; automatic refund unavailable.');
      } catch (error) { this.log('warn', `Channel points redemption lookup failed: ${String(error)}`); }
    }
    await this.processCommandOrChat(requester, messageBody, isReward, isReward ? { rewardId: customRewardId, redemptionId } : undefined);
  }

  private resolveBadge(badgesStr: string, username: string): BadgeType {
    const channel = this.config.twitchChannel.toLowerCase().replace(/^#/, '');
    if (username.toLowerCase() === channel) return 'broadcaster';
    if (badgesStr.includes('broadcaster')) return 'broadcaster';
    if (badgesStr.includes('moderator')) return 'moderator';
    if (badgesStr.includes('vip')) return 'vip';
    if (badgesStr.includes('subscriber')) return 'subscriber';
    return 'viewer';
  }

  private canUse(command: string, badge: BadgeType): boolean {
    const parsed = parseCommand(`!${command}`);
    if (!parsed) return false;
    const allowed = this.config.commandPermissions?.[parsed.definition.name];
    if (Array.isArray(allowed)) {
      return allowed.includes(badge);
    }
    return commandDefaultAllows(parsed.definition, badge);
  }
  private passCooldown(command: string, requester: Requester): boolean {
    if (requester.badge === 'broadcaster' || requester.badge === 'moderator') {
      return true;
    }
    const seconds = this.config.commandCooldowns?.[command] ?? (command === 'sr' ? (this.config.requestCooldownSeconds ?? 10) : 0);
    if (seconds <= 0) {
      return true;
    }
    const key = `${command}:${requester.username.toLowerCase()}`;
    const now = Date.now();
    const previous = this.commandTimes.get(key) || 0;
    if (now - previous < seconds * 1000) {
      return false;
    }
    this.commandTimes.set(key, now);
    if (this.commandTimes.size > 1000) {
      for (const [k, t] of this.commandTimes) {
        if (now - t > 3600000) {
          this.commandTimes.delete(k);
        }
      }
    }
    return true;
  }

  /**
   * Process incoming command or chat message
   */
  public async processCommandOrChat(requester: Requester, message: string, isChannelPoints: boolean = false, redemptionInfo?: { rewardId?: string; redemptionId?: string }) {
    const cleanMsg = message.trim();
    this.log('chat', cleanMsg, requester.displayName, requester.badge);

    // If channel points redemption, treat directly as song request
    if (isChannelPoints) { await this.handleSongRequest(requester, cleanMsg, redemptionInfo); return; }
    const parsedCommand = parseCommand(cleanMsg);
    const command = parsedCommand?.definition.name || null;
    const publicPlaylistQuery = command === 'streamplaylist' && /^(link|list|show)$/i.test(parsedCommand?.args || '');
    if (command && !publicPlaylistQuery && !this.canUse(command, requester.badge)) {
      if (command === 'skip') this.sendMessage(this.t('skipModOnly', { user: requester.displayName }));
      return;
    }
    if (command && !this.passCooldown(command, requester)) return;

    if (command === 'wrongsong') {
      let result: ReturnType<QueueManager['withdrawLatestRequest']>;
      try { result = this.queueManager.withdrawLatestRequest(requester.username); }
      catch { this.sendMessage(this.t('wrongSongFailed', { user: requester.displayName })); return; }
      if (!result.track) { this.sendMessage(this.t(result.reason === 'expired' ? 'wrongSongExpired' : 'wrongSongMissing', { user: requester.displayName })); return; }
      const track = result.track;
      const timer = this.redemptionTimers.get(track.id);
      if (timer) clearTimeout(timer);
      this.redemptionTimers.delete(track.id);
      let refunded = false;
      if (track.redemptionId && track.rewardId) {
        try { refunded = await ChannelPointsService.updateRedemptionStatus(this.config, track.rewardId, track.redemptionId, 'CANCELED'); } catch { /* report refund failure separately */ }
      }
      this.sendMessage(this.t('wrongSongRemoved', { user: requester.displayName, title: track.title }));
      if (track.redemptionId || track.rewardId) this.sendMessage(this.t(refunded ? 'wrongSongRefunded' : 'wrongSongRefundFailed', { user: requester.displayName }));
      return;
    }
    // Check commands
    if (command === 'sr') {
      await this.handleSongRequest(requester, parsedCommand?.args || '');
      return;
    }

    // Now Playing command: !song / !np / !current
    if (command === 'song') {
      this.handleNowPlaying();
      return;
    }

    // Queue command: !queue
    if (command === 'queue') {
      this.handleQueueCommand();
      return;
    }

    // Help command: !help
    if (command === 'help') {
      this.sendMessage(this.t('help'));
      return;
    }

    // Volume command: !vol
    if (command === 'vol') {
      if (!this.canUse('vol', requester.badge)) return;
      const match = parsedCommand?.args.match(/^(\d+)$/);
      if (!match) {
        this.sendMessage(this.t('volUsage', { user: requester.displayName }));
        return;
      }
      const vol = parseInt(match[1], 10);
      if (vol >= 0 && vol <= 100) {
        if (!await this.queueManager.setVolume(vol)) { this.sendMessage(this.localizeRuntimeError(this.queueManager.getPlaybackState().error) || this.t('playerCommandFailed')); return; }
        this.log('chat', `Volume set to ${vol}% by @${requester.displayName}`, requester.displayName, requester.badge);
        this.sendMessage(this.t('volSet', { vol, user: requester.displayName }));
      } else {
        this.sendMessage(this.t('volBounds', { user: requester.displayName }));
      }
      return;
    }

    // Vote-skip command: !voteskip
    if (command === 'voteskip') {
      await this.handleVoteSkip(requester);
      return;
    }

    // Moderator Commands
    if (command === 'skip') {
      if (!this.canUse('skip', requester.badge)) {
        this.sendMessage(this.t('skipModOnly', { user: requester.displayName }));
        return;
      }
      const res = await this.queueManager.skipCurrent(requester.username);
      if (!res.success) { this.sendMessage(this.localizeRuntimeError(this.queueManager.getPlaybackState().error) || this.t('skipFailed')); return; }
      this.log('mod', `Current song skipped by @${requester.displayName}`, requester.displayName, requester.badge);
      if (res.nextTrack) {
        this.sendMessage(this.t('skippedNext', { user: requester.displayName, title: res.nextTrack.title, artist: res.nextTrack.artist }));
      } else {
        this.sendMessage(this.t(this.config.playbackProvider === 'spotify' ? 'skippedEmptySpotify' : 'skippedEmpty', { user: requester.displayName }));
      }
      return;
    }

    if (command === 'veto') {
      if (!this.canUse('veto', requester.badge)) return;
      const target = parsedCommand?.args || '';
      if (!target) { this.sendMessage(this.t('vetoUsage', { user: requester.displayName })); return; }
      const removed = this.queueManager.vetoTrack(/^\d+$/.test(target) ? Number(target) - 1 : target);
      if (removed) {
        this.log('mod', `Vetoed song "${removed.title}" by @${requester.displayName}`, requester.displayName, requester.badge);
        this.sendMessage(this.t('vetoed', { title: removed.title }));
      } else {
        this.sendMessage(this.t('vetoNotFound', { user: requester.displayName }));
      }
      return;
    }

    if (command === 'clearqueue') {
      if (!this.canUse('clearqueue', requester.badge)) return;
      const cleared = this.queueManager.clearQueue();
      this.log('mod', `Queue cleared by @${requester.displayName} (${cleared} songs)`, requester.displayName, requester.badge);
      this.sendMessage(this.t('queueCleared', { count: cleared }));
      return;
    }

    if (command === 'pause') {
      if (!this.canUse('pause', requester.badge)) return;
      if (!await this.queueManager.pause()) { this.sendMessage(this.localizeRuntimeError(this.queueManager.getPlaybackState().error) || this.t('playerCommandFailed')); return; }
      this.sendMessage(this.t('paused', { user: requester.displayName }));
      return;
    }

    if (command === 'resume') {
      if (!this.canUse('resume', requester.badge)) return;
      if (!await this.queueManager.play()) { this.sendMessage(this.localizeRuntimeError(this.queueManager.getPlaybackState().error) || this.t('playerCommandFailed')); return; }
      this.sendMessage(this.t('resumed', { user: requester.displayName }));
      return;
    }

    if (command === 'blacklist' && /^add\s+/i.test(parsedCommand?.args || '')) {
      if (!this.canUse('blacklist', requester.badge)) return;
      const term = (parsedCommand?.args || '').replace(/^add\s+/i, '').trim();
      if (term) {
        this.queueManager.addBlacklistRule(term, requester.username);
        this.sendMessage(this.t('blacklistAdded', { term }));
      }
      return;
    }

    if (command === 'blacklist' && /^remove\s+/i.test(parsedCommand?.args || '')) {
      if (!this.canUse('blacklist', requester.badge)) return;
      const term = (parsedCommand?.args || '').replace(/^remove\s+/i, '').trim();
      if (term) {
        const ok = this.queueManager.removeBlacklistRule(term);
        if (ok) {
          this.sendMessage(this.t('blacklistRemoved', { term }));
        } else {
          this.sendMessage(this.t('blacklistNotFound', { term }));
        }
      }
      return;
    }
    if (command === 'blacklist') this.sendMessage(this.t('blacklistUsage', { user: requester.displayName }));

    if (command === 'streamplaylist') {
      const args = (parsedCommand?.args || '').trim().toLowerCase();
      if (args === 'link') {
        const configured = this.config.streamPlaylistUrl?.trim() || this.config.spotifyFallbackPlaylist?.trim();
        const url = configured?.replace(/^spotify:playlist:/, 'https://open.spotify.com/playlist/');
        this.sendMessage(url ? this.t('playlistLink', { url }) : this.t('playlistLinkMissing'));
        return;
      }
      if (args === 'list' || args === 'show') {
        const items = this.streamPlaylistService.getItems();
        if (items.length === 0) {
          this.sendMessage(this.t('playlistEmpty'));
          return;
        }
        const recent = items.slice(-5).map(i => `"${i.title}"`).join(', ');
        this.sendMessage(this.t('playlistList', { count: items.length, items: recent }));
        return;
      }

      if (!this.canUse('streamplaylist', requester.badge)) return;
      const state = this.queueManager.getPlaybackState();
      const current = state.currentSong;
      if (!current) {
        this.sendMessage(this.t('playlistNoSong', { user: requester.displayName }));
        return;
      }

      const spotifyService = this.queueManager.spotifyService;
      const configuredPlaylist = this.config.streamPlaylistUrl?.trim() || this.config.spotifyFallbackPlaylist;
      const playlistId = configuredPlaylist && (configuredPlaylist.startsWith("spotify:") || configuredPlaylist.includes("open.spotify.com/")) ? configuredPlaylist : undefined;

      const result = await this.streamPlaylistService.addTrack(
        current,
        requester.displayName,
        spotifyService,
        playlistId
      );

      if (result.alreadyExists) {
        this.sendMessage(this.t('playlistAlreadyExists', { user: requester.displayName, title: current.title }));
        return;
      }

      if (!result.success) {
        this.sendMessage(this.t('playlistFailed'));
        return;
      }

      if (result.entry) botEvents.emit('playlist:track_added', result.entry);
      this.log('mod', `Song "${current.title}" to stream playlist added by @${requester.displayName}`, requester.displayName, requester.badge);
      this.sendMessage(this.t('playlistAdded', { user: requester.displayName, title: current.title, artist: current.artist }));
      return;
    }
  }

  private resolvingUsers = new Set<string>();
  private requestTimes = new Map<string, number>();
  private async handleSongRequest(requester: Requester, query: string, redemptionInfo?: { rewardId?: string; redemptionId?: string }) {
    const refundIfRedemption = async (reasonMsg: string) => {
      if (redemptionInfo?.rewardId && redemptionInfo?.redemptionId) {
        const refunded = await ChannelPointsService.updateRedemptionStatus(
          this.config,
          redemptionInfo.rewardId,
          redemptionInfo.redemptionId,
          'CANCELED'
        );
        if (refunded) {
          this.sendMessage(this.t('srRefunded', { user: requester.displayName, error: reasonMsg }));
          this.log('mod', `Channel points refunded for @${requester.displayName} (redemption ${redemptionInfo.redemptionId}): ${reasonMsg}`);
          return true;
        }
      }
      return false;
    };

    if (!query || query.trim().length === 0) {
      const usageMsg = this.t('srUsage', { user: requester.displayName });
      if (!await refundIfRedemption(usageMsg)) {
        this.sendMessage(usageMsg);
      }
      return;
    }

    const user = requester.username.toLowerCase();
    const now = Date.now();
    const perUser = (this.config.requestCooldownSeconds ?? 10) * 1000;
    const global = (this.config.globalRequestCooldownSeconds ?? 2) * 1000;
    const isPrivileged = requester.badge === 'broadcaster' || requester.badge === 'moderator';

    const onCooldown =
      this.resolvingUsers.has(user) ||
      this.resolvingUsers.size >= 4 ||
      now - (this.requestTimes.get(user) || 0) < perUser ||
      (global > 0 && now - this.globalRequestTime < global && !isPrivileged);

    if (onCooldown) {
      const cdMsg = this.t('requestCooldown', { user: requester.displayName });
      if (!await refundIfRedemption(cdMsg)) {
        this.sendMessage(cdMsg);
      }
      return;
    }

    if (query.length > 500) {
      const tooLongMsg = this.t('srTooLong', { user: requester.displayName });
      if (!await refundIfRedemption(tooLongMsg)) {
        this.sendMessage(tooLongMsg);
      }
      return;
    }

    this.globalRequestTime = now;
    this.resolvingUsers.add(user);
    this.requestTimes.set(user, now);

    for (const [name, time] of this.requestTimes) {
      if (now - time > 60000) {
        this.requestTimes.delete(name);
      }
    }
    try {
      this.log('info', `Resolving song request: "${query}" for @${requester.displayName}`);
      
      const provider = this.config.playbackProvider;
      const resolved = await resolveForPlaybackProvider(query, this.config, this.queueManager.spotifyService);
      if (provider !== this.config.playbackProvider) throw new ResolverError('NO_RESULTS', 'Der Player wurde während der Suche gewechselt. Bitte Song erneut anfragen.');

      const addResult = this.queueManager.addSong(resolved, requester);
      if (!addResult.success) {
        const errorReason = addResult.error || 'Song abgelehnt';
        if (!await refundIfRedemption(errorReason)) {
          this.sendMessage(this.t('srError', { user: requester.displayName, error: errorReason }));
        }
        this.log('warn', `Song rejected for @${requester.displayName}: ${errorReason}`);
        return;
      }

      // Keep redemptions cancellable during the withdrawal window.
      if (redemptionInfo?.rewardId && addResult.track) {
        const track = addResult.track;
        track.rewardId = redemptionInfo.rewardId; track.redemptionId = redemptionInfo.redemptionId;
        this.queueManager.persistRedemptionMetadata();
        this.scheduleRedemption(track);
      }

      const pos = addResult.position || 1;
      const track = addResult.track!;
      this.log('song', `Added #${pos}: "${track.title}" by ${track.artist} (req by @${requester.displayName})`);

      // Minimal emoji verbosity as specified in requirements
      const messageKey = track.requestSource === 'spotify'
        ? (this.config.playbackProvider === 'spotify' ? 'srSpotifyAddedDirect' : 'srSpotifyAdded')
        : 'srAdded';
      this.sendMessage(this.t(messageKey, { user: requester.displayName, pos, title: track.title }));
    } catch (error: unknown) {
      const detail = error instanceof ResolverError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);
      const isSpotifyTrackOnly = error instanceof ResolverError && error.code === 'SPOTIFY_UNSUPPORTED';
      const isSpotifyNotFound = this.config.playbackProvider !== 'spotify' && YouTubeResolver.isSpotifyRequest(query);
      const failReason = isSpotifyTrackOnly
        ? this.t('srSpotifyTrackOnly', { user: requester.displayName })
        : (isSpotifyNotFound ? this.t('srSpotifyNotFound', { user: requester.displayName }) : this.t('srNotFound', { user: requester.displayName, query }));

      if (!await refundIfRedemption(failReason)) {
        this.sendMessage(failReason);
      }
      this.log('error', `Song resolution failed for "${query}": ${detail}`);
    } finally { this.resolvingUsers.delete(user); }
  }

  private handleNowPlaying() {
    const cooldown = (this.config.nowPlayingCooldownSeconds || 15) * 1000;
    const now = Date.now();

    if (now - this.lastNowPlayingTime < cooldown) {
      // On cooldown - ignore or whisper
      return;
    }

    this.lastNowPlayingTime = now;
    const playback = this.queueManager.getPlaybackState();

    if (playback.currentSong) {
      const song = playback.currentSong;
      const reqInfo = song.requester.username.toLowerCase() !== 'radio'
        ? this.t('npReqBy', { user: song.requester.displayName })
        : '';
      this.sendMessage(this.t('npPlaying', { title: song.title, artist: song.artist, reqInfo, url: song.url }));
    } else {
      this.sendMessage(this.t(this.config.playbackProvider === 'spotify' ? 'npNothingSpotify' : 'npNothing'));
    }
  }

  private handleQueueCommand() {
    const queue = this.queueManager.getQueue();
    if (queue.length === 0) {
      this.sendMessage(this.t('qEmpty'));
      return;
    }

    const next3 = queue.slice(0, 3).map((t, idx) => `${idx + 1}. ${t.title} (@${t.requester.displayName})`).join(' | ');
    const more = queue.length > 3 ? this.t('qMore', { count: queue.length - 3 }) : '';
    this.sendMessage(this.t('qList', { count: queue.length, next3, more }));
  }

  private async handleVoteSkip(requester: Requester) {
    const isPrivileged = requester.badge === 'broadcaster' || requester.badge === 'moderator' || requester.badge === 'vip';
    const result = await this.queueManager.castVoteSkip(requester.username, isPrivileged);
    if (!result.success) {
      const playbackError = this.queueManager.getPlaybackState().error || (this.config.playbackProvider === 'youtube_music' ? this.ytmCompanion.getLastCommandError() : '');
      this.sendMessage(this.localizeRuntimeError(playbackError) || this.t('vsNoSong', { user: requester.displayName }));
      return;
    }

    if (result.alreadyVoted) {
      this.sendMessage(this.t('vsAlready', { user: requester.displayName, current: result.currentVotes, required: result.requiredVotes }));
      return;
    }

    if (result.didSkip) {
      if (isPrivileged) {
        const roleName = requester.badge === 'broadcaster' ? (this.config.language === 'en' ? 'Broadcaster' : 'Streamer') : (requester.badge === 'moderator' ? 'Mod' : 'VIP');
        this.sendMessage(this.t('vsVipPassed', { user: requester.displayName, role: roleName }));
        this.log('mod', `Instant skip (${roleName}) triggered by @${requester.displayName}`);
      } else {
        this.sendMessage(this.t('vsPassed', { current: result.currentVotes, required: result.requiredVotes }));
        this.log('mod', `Vote skip passed (${result.currentVotes}/${result.requiredVotes}) triggered by @${requester.displayName}`);
      }
    } else {
      this.sendMessage(this.t('vsVoted', { user: requester.displayName, current: result.currentVotes, required: result.requiredVotes }));
    }
  }

  public simulateMessage(username: string, message: string, badge: BadgeType = 'viewer') {
    const requester: Requester = {
      username: username.toLowerCase(),
      displayName: username,
      badge,
      color: badge === 'broadcaster' ? '#FF0000' : badge === 'moderator' ? '#00FF00' : '#9146FF'
    };
    this.processCommandOrChat(requester, message, false);
  }

  public disconnect(resetBackoff = true) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState(false);
    if (resetBackoff) {
      this.reconnectAttempt = 0;
      this.lastReconnectDelayMs = 0;
      this.authFailed = false;
    }
  }
}
