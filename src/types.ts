export type BadgeType = 'broadcaster' | 'moderator' | 'vip' | 'subscriber' | 'viewer';

export interface Requester {
  username: string;
  displayName: string;
  badge: BadgeType;
  color?: string;
  avatarUrl?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  duration: number; // in seconds
  url: string;
  videoId?: string;
  /** Actual provider item currently playing when it differs from the requested YouTube ID. */
  playbackId?: string;
  requester: Requester;
  redemptionId?: string;
  rewardId?: string;
  requestedAt: number; // timestamp
  requestSource?: 'spotify' | 'youtube' | 'text';
  originalRequestUrl?: string;
  spotifyUri?: string;
  playbackProvider?: 'youtube_music' | 'spotify';
}

export interface PlaybackState {
  currentSong: Track | null;
  isPlaying: boolean;
  progressSeconds: number;
  durationSeconds: number;
  volume: number;
  source: 'queue' | 'autoplay_radio' | 'external' | 'idle';
  status?: 'loading' | 'error' | 'playing' | 'paused';
  error?: string;
  repeatMode?: 'NONE' | 'ONE' | 'ALL';
}

export interface VoteSkipState {
  votes: string[]; // usernames who voted
  requiredVotes: number;
  currentTrackId: string | null;
}

export interface BotConfig {
  channelPointsEnabled?: boolean;
  channelPointsRewardId?: string;
  twitchTokenConfigured?: boolean;
  twitchClientSecretConfigured?: boolean;
  twitchAuthError?: string;
  ytmTokenConfigured?: boolean;
  spotifyConnected?: boolean;
  spotifyPremium?: boolean;
  twitchChannel: string;
  twitchBotUsername: string;
  twitchBotOauthToken: string;
  twitchClientId: string;
  twitchClientSecret?: string;
  ytmdaCompanionUrl: string;
  ytmdaAuthToken: string;
  spotifyClientId?: string;
  playbackProvider?: 'youtube_music' | 'spotify';
  spotifyFallbackToYtm?: boolean;
  spotifyPreferredDeviceId?: string;
  overlayPort: number;
  maxSongDurationSeconds: number; // default 420 (7 mins)
  maxActivePerViewer: number; // default 2
  voteSkipThreshold: number; // default 3
  autoPlayRadio: boolean; // default true
  spotifyFallbackPlaylist?: string;
  streamPlaylistUrl?: string;
  nowPlayingCooldownSeconds: number; // default 15
  maxQueueSize?: number;
  minSongDurationSeconds?: number;
  preventRecentDuplicates?: number;
  requestCooldownSeconds?: number;
  globalRequestCooldownSeconds?: number;
  commandCooldowns?: Record<string, number>;
  commandPermissions?: Record<string, BadgeType[]>;
  blockedRequesters?: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  tabOrder?: string[];
  persistSearchCache?: boolean;
  companionConnected: boolean;
  twitchConnected: boolean;
  simulationMode: boolean;
  language?: 'de' | 'en';
  playerPlugins?: PlayerPluginInfo[];
}

export interface PlayerPluginInfo {
  id: string;
  name: string;
  description: string;
  webPlayerUrl: string;
  isReady: boolean;
  statusMessage?: string;
}


export interface TwitchChannelPointReward {
  id: string;
  title: string;
  cost: number;
  prompt?: string;
  isEnabled: boolean;
  isUserInputRequired: boolean;
}

export interface BotLog {
  id: string;
  timestamp: number;
  type: 'chat' | 'song' | 'mod' | 'bot' | 'error' | 'warn' | 'info';
  message: string;
  user?: string;
  badge?: BadgeType;
  category?: 'TWITCH' | 'YTM' | 'QUEUE' | 'SEARCH' | 'CONFIG' | 'BOT';
}

export interface BlacklistRule {
  id: string;
  term: string;
  type: 'keyword' | 'artist' | 'channel';
  addedBy: string;
  addedAt: number;
}

export interface YtmPairingState {
  status: 'idle' | 'requesting_code' | 'waiting_for_user' | 'success' | 'error';
  code?: string;
  message?: string;
  error?: string;
  updatedAt?: number;
}

export interface YtmDiagnosticResult {
  reachable: boolean;
  resolvedUrl: string;
  authStatus: 'none' | 'valid' | 'invalid_token' | 'needs_pairing';
  details: string;
  appVersion?: string;
  httpStatus?: number;
  responseBody?: string;
  tokenPreview?: string;
  tokenLength?: number;
  testedEndpoints?: string[];
  testedFormats?: string[];
  curlCommand?: string;
  powershellCommand?: string;
  openModeDetected?: boolean;
  authHeaderFormat?: 'plain' | 'bearer';
}

import type { OverlayOptions } from './overlayOptions.ts';

export interface AppState {
  config: BotConfig;
  playback: PlaybackState;
  queue: Track[];
  history: Track[];
  voteSkip: VoteSkipState;
  blacklist: BlacklistRule[];
  logs: BotLog[];
  pairing: YtmPairingState;
  activeOverlay?: OverlayOptions;
  lastDiagnosis?: YtmDiagnosticResult;
  error?: string;
}

export type QueueDelta =
  | { op: 'add'; track: Track; index: number }
  | { op: 'remove'; trackId: string }
  | { op: 'move'; trackId: string; newIndex: number }
  | { op: 'replace'; queue: Track[] };

export type ServerToClientMessage =
  | { type: 'state'; data: AppState }
  | { type: 'patch'; data: Partial<AppState> }
  | { type: 'log'; data: BotLog }
  | { type: 'queue_delta'; data: QueueDelta }
  | { type: 'playlist:track_added'; data: import('./server/streamPlaylistService.ts').StreamPlaylistEntry }
  | { type: 'overlay_update'; data: OverlayOptions };

export type ClientToServerMessage = { type: 'get_state' };
