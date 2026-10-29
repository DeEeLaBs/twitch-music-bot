import type { Track, PlaybackState, BotConfig } from '../../types.ts';

export interface PlayerActionResult {
  success: boolean;
  error?: string;
  track?: Track;
}

export interface PlayerPluginMetadata {
  id: string;
  name: string;
  description: string;
  webPlayerUrl: string;
  authType: 'companion' | 'oauth' | 'none';
}

/**
 * Common PlayerPlugin interface for all playback engines (YouTube Music, Spotify, etc.)
 */
export interface PlayerPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly webPlayerUrl: string;

  /** Checks if the plugin has an active, ready connection or session */
  isReady(config?: BotConfig): boolean;

  /** Plays a specific track via this player plugin */
  playTrack(track: Track, options?: { signal?: AbortSignal; timeoutMs?: number; autoplayRadio?: boolean }): Promise<PlayerActionResult>;

  /** Resumes playback */
  play(): Promise<boolean>;

  /** Pauses playback */
  pause(): Promise<boolean>;

  /** Toggles play/pause state */
  playPause(currentPlaybackState?: PlaybackState): Promise<boolean>;

  /** Skips to previous track if supported */
  previousTrack?(): Promise<boolean>;

  /** Skips to next track */
  skip?(): Promise<boolean>;

  /** Sets the playback volume (0-100) */
  setVolume(volume: number): Promise<boolean>;

  /** Returns latest playback snapshot from this player */
  getPlaybackSnapshot?(): Partial<PlaybackState>;

  /** Gets localized status message */
  getStatusMessage?(lang: 'de' | 'en'): string;
}
