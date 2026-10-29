import fs from 'node:fs';
import path from 'node:path';
import type { BadgeType, BotConfig } from '../types.ts';
import { writeJson } from './atomicStore.ts';
import { SecureTokenStore } from './secureTokenStore.ts';
import { logger } from './logger.ts';
import { botEvents } from './eventBus.ts';

const CONFIG_VERSION = 5;
type ConfigListener = (config: BotConfig, changedKeys: Array<keyof BotConfig>) => void;
const ALL_BADGES: BadgeType[] = ['viewer','subscriber','vip','moderator','broadcaster'];
const MOD_BADGES: BadgeType[] = ['moderator','broadcaster'];

function defaultConfig(): BotConfig { return {
  channelPointsEnabled: false,
  twitchChannel: process.env.TWITCH_CHANNEL || '',
  twitchBotUsername: process.env.TWITCH_BOT_USERNAME || '',
  twitchBotOauthToken: '',
  twitchClientId: process.env.TWITCH_CLIENT_ID || '',
  twitchClientSecret: '',
  ytmdaCompanionUrl: process.env.YTMDA_COMPANION_URL || 'http://localhost:9863',
  ytmdaAuthToken: '',
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  playbackProvider: 'youtube_music',
  spotifyFallbackToYtm: true,
  spotifyPreferredDeviceId: '',
  overlayPort: 3000,
  maxSongDurationSeconds: 420,
  minSongDurationSeconds: 20,
  maxActivePerViewer: 2,
  maxQueueSize: 100,
  preventRecentDuplicates: 10,
  voteSkipThreshold: 3,
  autoPlayRadio: true,
  streamPlaylistUrl: '',
  nowPlayingCooldownSeconds: 15,
  requestCooldownSeconds: 10,
  globalRequestCooldownSeconds: 2,
  commandCooldowns: { help:10, song:15, queue:10, voteskip:3, sr:10, vol:0, skip:0, veto:0, clearqueue:0, pause:0, resume:0, blacklist:0, streamplaylist:5, wrongsong:0 },
  commandPermissions: { help:ALL_BADGES, sr:ALL_BADGES, song:ALL_BADGES, queue:ALL_BADGES, voteskip:ALL_BADGES, vol:MOD_BADGES, skip:MOD_BADGES, veto:MOD_BADGES, clearqueue:MOD_BADGES, pause:MOD_BADGES, resume:MOD_BADGES, blacklist:MOD_BADGES, streamplaylist:MOD_BADGES, wrongsong:ALL_BADGES },
  blockedRequesters: [],
  logLevel: 'info',
  tabOrder: ['player', 'webPlayer', 'commands', 'chat', 'overlay', 'obsDock', 'blacklist', 'diagnostics', 'settings'],
  persistSearchCache: true,
  companionConnected: false,
  twitchConnected: false,
  simulationMode: false,
  language: 'en'
}; }

interface PersistedConfig extends Partial<BotConfig> { configVersion?: number }

export class ConfigService {
  private config: BotConfig;
  private readonly file: string;
  private readonly listeners = new Set<ConfigListener>();
  private readonly secrets: SecureTokenStore;

  constructor(
    file = path.join(process.cwd(), 'data', 'bot-config.json'),
    secrets?: SecureTokenStore
  ) {
    this.file = file;
    this.secrets = secrets || new SecureTokenStore(
      path.join(path.dirname(file), 'secrets.json'),
      path.join(path.dirname(file), '.secret-key')
    );
    this.config = this.load();
    logger.setLevel(this.config.logLevel || 'info');
  }

  private migrate(raw: PersistedConfig): PersistedConfig {
    const migrated = { ...raw };
    if (typeof migrated.channelPointsEnabled !== 'boolean') migrated.channelPointsEnabled = Boolean(migrated.channelPointsRewardId);
    if (!migrated.maxQueueSize) migrated.maxQueueSize = 100;
    if (migrated.minSongDurationSeconds === undefined) migrated.minSongDurationSeconds = 20;
    if (migrated.preventRecentDuplicates === undefined) migrated.preventRecentDuplicates = 10;
    if (migrated.requestCooldownSeconds === undefined) migrated.requestCooldownSeconds = 10;
    if (migrated.globalRequestCooldownSeconds === undefined) migrated.globalRequestCooldownSeconds = 2;
    if ((migrated as any).spotifyPlaybackEnabled === true && !migrated.playbackProvider) migrated.playbackProvider = 'spotify';
    if (!migrated.playbackProvider) migrated.playbackProvider = 'youtube_music';
    delete (migrated as any).spotifyPlaybackEnabled;
    if (migrated.spotifyFallbackToYtm === undefined) migrated.spotifyFallbackToYtm = true;
    if (migrated.spotifyClientId === undefined) migrated.spotifyClientId = '';
    if (migrated.spotifyPreferredDeviceId === undefined) migrated.spotifyPreferredDeviceId = '';
    migrated.configVersion = CONFIG_VERSION;
    return migrated;
  }

  private validate(config: BotConfig): BotConfig {
    const out = { ...config };
    const clamp=(n:number,min:number,max:number,fallback:number)=>Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fallback;
    out.overlayPort=3000;
    out.maxSongDurationSeconds=clamp(out.maxSongDurationSeconds,10,7200,420);
    out.minSongDurationSeconds=clamp(out.minSongDurationSeconds ?? 20,0,600,20);
    if ((out.minSongDurationSeconds||0) > out.maxSongDurationSeconds) out.minSongDurationSeconds=Math.min(20,out.maxSongDurationSeconds);
    out.maxActivePerViewer=clamp(out.maxActivePerViewer,1,20,2);
    out.maxQueueSize=clamp(out.maxQueueSize || 100,1,500,100);
    out.preventRecentDuplicates=clamp(out.preventRecentDuplicates || 0,0,100,10);
    out.voteSkipThreshold=clamp(out.voteSkipThreshold,1,100,3);
    out.nowPlayingCooldownSeconds=clamp(out.nowPlayingCooldownSeconds,1,300,15);
    out.requestCooldownSeconds=clamp(out.requestCooldownSeconds ?? 10,0,300,10);
    out.globalRequestCooldownSeconds=clamp(out.globalRequestCooldownSeconds ?? 2,0,60,2);
    out.blockedRequesters=Array.isArray(out.blockedRequesters)?[...new Set(out.blockedRequesters.map(x=>String(x).toLowerCase()).filter(Boolean))].slice(0,500):[];
    const validBadges = new Set<BadgeType>(['viewer','subscriber','vip','moderator','broadcaster']);
    const defaultPermissions = defaultConfig().commandPermissions || {};
    const rawPermissions = out.commandPermissions && typeof out.commandPermissions === 'object' && !Array.isArray(out.commandPermissions) ? out.commandPermissions : {};
    out.commandPermissions = { ...defaultPermissions };
    for (const [command, roles] of Object.entries(rawPermissions)) {
      if (!/^[a-z0-9_-]{1,32}$/i.test(command) || !Array.isArray(roles)) continue;
      const clean = [...new Set(roles.filter((role): role is BadgeType => validBadges.has(role as BadgeType)))];
      out.commandPermissions[command] = clean;
    }
    const rawCooldowns = out.commandCooldowns && typeof out.commandCooldowns === 'object' && !Array.isArray(out.commandCooldowns) ? out.commandCooldowns : {};
    out.commandCooldowns = { ...(defaultConfig().commandCooldowns || {}) };
    for (const [command, seconds] of Object.entries(rawCooldowns)) {
      if (!/^[a-z0-9_-]{1,32}$/i.test(command) || typeof seconds !== 'number' || !Number.isFinite(seconds)) continue;
      out.commandCooldowns[command] = Math.min(600, Math.max(0, Math.round(seconds)));
    }
    out.spotifyClientId = typeof out.spotifyClientId === 'string' ? out.spotifyClientId.trim().slice(0,128) : '';
    out.spotifyPreferredDeviceId = typeof out.spotifyPreferredDeviceId === 'string' ? out.spotifyPreferredDeviceId.trim().slice(0,256) : '';
    if (out.playbackProvider !== 'spotify' && out.playbackProvider !== 'youtube_music') out.playbackProvider = 'youtube_music';
    out.spotifyFallbackToYtm = out.spotifyFallbackToYtm !== false;
    if (out.language !== 'de' && out.language !== 'en') out.language='en';
    if (!['debug','info','warn','error'].includes(out.logLevel || 'info')) out.logLevel='info';
    if (Array.isArray(out.tabOrder)) {
      out.tabOrder = out.tabOrder.filter(v => typeof v === 'string').slice(0, 30);
    }
    return out;
  }

  private load(): BotConfig {
    const base = defaultConfig();
    let raw: PersistedConfig = {};
    let recoveredFromBackup = false;
    try {
      if (fs.existsSync(this.file)) raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as PersistedConfig;
    } catch (error) {
      const backup=this.file+'.backup';
      try { if(fs.existsSync(backup)) { raw=JSON.parse(fs.readFileSync(backup,'utf8')) as PersistedConfig; recoveredFromBackup = true; } } catch {}
      logger.log('error','CONFIG','Konfiguration konnte nicht gelesen werden',{error:String(error)});
    }
    // One-time migration of legacy plaintext secrets.
    const legacyTwitch=typeof raw.twitchBotOauthToken==='string'?raw.twitchBotOauthToken:'';
    const legacyYtm=typeof raw.ytmdaAuthToken==='string'?raw.ytmdaAuthToken:'';
    if (legacyTwitch) this.secrets.set('twitchBotOauthToken',legacyTwitch);
    if (legacyYtm) this.secrets.set('ytmdaAuthToken',legacyYtm);
    delete raw.twitchBotOauthToken; delete raw.ytmdaAuthToken;
    const migrated=this.migrate(raw);
    const merged=this.validate({
      ...base,
      ...migrated,
      twitchBotOauthToken: this.secrets.get('twitchBotOauthToken') || process.env.TWITCH_BOT_OAUTH_TOKEN || '',
      twitchClientSecret: this.secrets.get('twitchClientSecret') || process.env.TWITCH_CLIENT_SECRET || '',
      ytmdaAuthToken: this.secrets.get('ytmdaAuthToken') || process.env.YTMDA_AUTH_TOKEN || ''
    } as BotConfig);
    merged.companionConnected=false; merged.twitchConnected=false; delete merged.twitchTokenConfigured; delete merged.twitchClientSecretConfigured; delete merged.ytmTokenConfigured;
    if (raw.configVersion !== CONFIG_VERSION || legacyTwitch || legacyYtm || recoveredFromBackup) {
      this.saveConfig(merged, recoveredFromBackup);
      // writeJson creates a backup before replacing the main config. During a legacy
      // secret migration that backup would otherwise still contain plaintext tokens.
      if (legacyTwitch || legacyYtm) { try { fs.rmSync(this.file + '.backup', { force:true }); } catch {} }
    }
    return merged;
  }

  public get(): BotConfig {
    const commandPermissions = Object.fromEntries(Object.entries(this.config.commandPermissions || {}).map(([key, roles]) => [key, [...roles]]));
    return { ...this.config, tabOrder: this.config.tabOrder ? [...this.config.tabOrder] : undefined, commandCooldowns:{...(this.config.commandCooldowns||{})}, commandPermissions, blockedRequesters:[...(this.config.blockedRequesters||[])] };
  }
  public onChange(listener: ConfigListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  public update(patch: Partial<BotConfig>): { config: BotConfig; changedKeys: Array<keyof BotConfig> } {
    const before=this.config;
    if (typeof patch.twitchBotOauthToken==='string') { this.secrets.set('twitchBotOauthToken',patch.twitchBotOauthToken); }
    if (typeof patch.twitchClientSecret==='string') { this.secrets.set('twitchClientSecret',patch.twitchClientSecret); }
    if (typeof patch.ytmdaAuthToken==='string') { this.secrets.set('ytmdaAuthToken',patch.ytmdaAuthToken); }
    const next=this.validate({ ...before, ...patch, overlayPort:3000 });
    const changedKeys=(Object.keys(next) as Array<keyof BotConfig>).filter(key=>JSON.stringify(before[key])!==JSON.stringify(next[key]));
    if (!changedKeys.length) return {config:this.get(),changedKeys};
    this.config=next; this.save(); logger.setLevel(next.logLevel||'info');
    const snapshot=this.get(); botEvents.emit('config:changed',{changedKeys:changedKeys.map(String)}); for(const listener of this.listeners) listener(snapshot,changedKeys); return {config:snapshot,changedKeys};
  }
  public setYtmToken(token:string):BotConfig { return this.update({ytmdaAuthToken:token}).config; }
  private persistedConfig(config: BotConfig): PersistedConfig {
    const persisted: PersistedConfig={...config,configVersion:CONFIG_VERSION};
    delete persisted.companionConnected; delete persisted.twitchConnected; delete persisted.twitchTokenConfigured; delete persisted.twitchClientSecretConfigured; delete persisted.ytmTokenConfigured;
    delete persisted.twitchBotOauthToken; delete persisted.twitchClientSecret; delete persisted.ytmdaAuthToken;
    return persisted;
  }
  private saveConfig(config: BotConfig, preserveBackup = false): void {
    writeJson(this.file,this.persistedConfig(config), { preserveBackup });
  }
  public save():void {
    const persisted = this.persistedConfig(this.config);
    let preserveBackup = false;
    try {
      if (fs.existsSync(this.file) && JSON.stringify(JSON.parse(fs.readFileSync(this.file, 'utf8'))) === JSON.stringify(persisted)) return;
    } catch { preserveBackup = true; }
    writeJson(this.file,persisted,{ preserveBackup });
  }
  public getSecurityDiagnostics(){return this.secrets.diagnostics();}
}
