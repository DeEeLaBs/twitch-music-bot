// Idle means the provider has not reported a track yet, so the dock is still
// on its waiting line. Poll that case quickly. Once a song is visible, keep
// the slower cadence so Spotify and the YouTube Music companion are not hit
// on every second of a normal track.

export const SPOTIFY_IDLE_POLL_MS = 1000;
export const SPOTIFY_PLAYING_POLL_MS = 2000;
export const SPOTIFY_ENDING_POLL_MS = 500;
export const SPOTIFY_PAUSED_POLL_MS = 4000;
export const SPOTIFY_DISCONNECTED_POLL_MS = 5000;
export const SPOTIFY_ERROR_POLL_MS = 8000;

export const YTM_IDLE_REALTIME_STALE_MS = 0;
export const YTM_PLAYING_REALTIME_STALE_MS = 2500;
export const YTM_MIN_REQUEST_GAP_MS = 1000;

export function spotifyPlaybackPollDelayMs(input: {
  connected: boolean;
  isPlaying: boolean;
  hasTrack: boolean;
  remainingSeconds?: number;
  failed?: boolean;
}): number {
  if (input.failed) return SPOTIFY_ERROR_POLL_MS;
  if (!input.connected) return SPOTIFY_DISCONNECTED_POLL_MS;
  if (!input.hasTrack) return SPOTIFY_IDLE_POLL_MS;
  if (!input.isPlaying) return SPOTIFY_PAUSED_POLL_MS;
  const remaining = input.remainingSeconds ?? Number.POSITIVE_INFINITY;
  if (remaining > 0 && remaining < 4) return SPOTIFY_ENDING_POLL_MS;
  return SPOTIFY_PLAYING_POLL_MS;
}

export function ytmRealtimeStaleMs(hasSong: boolean): number {
  return hasSong ? YTM_PLAYING_REALTIME_STALE_MS : YTM_IDLE_REALTIME_STALE_MS;
}
