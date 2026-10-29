import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPOTIFY_DISCONNECTED_POLL_MS,
  SPOTIFY_ENDING_POLL_MS,
  SPOTIFY_ERROR_POLL_MS,
  SPOTIFY_IDLE_POLL_MS,
  SPOTIFY_PAUSED_POLL_MS,
  SPOTIFY_PLAYING_POLL_MS,
  YTM_IDLE_REALTIME_STALE_MS,
  YTM_PLAYING_REALTIME_STALE_MS,
  spotifyPlaybackPollDelayMs,
  ytmRealtimeStaleMs,
} from '../src/server/playbackPoll.ts';

test('spotify polls quickly only while no track is reported', () => {
  assert.equal(spotifyPlaybackPollDelayMs({ connected: true, isPlaying: false, hasTrack: false }), SPOTIFY_IDLE_POLL_MS);
  assert.ok(SPOTIFY_IDLE_POLL_MS <= 1000);
  assert.equal(spotifyPlaybackPollDelayMs({ connected: true, isPlaying: true, hasTrack: true, remainingSeconds: 90 }), SPOTIFY_PLAYING_POLL_MS);
  assert.equal(spotifyPlaybackPollDelayMs({ connected: true, isPlaying: true, hasTrack: true, remainingSeconds: 2 }), SPOTIFY_ENDING_POLL_MS);
  assert.equal(spotifyPlaybackPollDelayMs({ connected: true, isPlaying: false, hasTrack: true }), SPOTIFY_PAUSED_POLL_MS);
  assert.equal(spotifyPlaybackPollDelayMs({ connected: false, isPlaying: false, hasTrack: false }), SPOTIFY_DISCONNECTED_POLL_MS);
  assert.equal(spotifyPlaybackPollDelayMs({ connected: true, isPlaying: false, hasTrack: false, failed: true }), SPOTIFY_ERROR_POLL_MS);
  assert.ok(SPOTIFY_IDLE_POLL_MS < SPOTIFY_PAUSED_POLL_MS);
  assert.ok(SPOTIFY_IDLE_POLL_MS < SPOTIFY_DISCONNECTED_POLL_MS);
});

test('youtube music http fallback is immediate only while no song is showing', () => {
  assert.equal(ytmRealtimeStaleMs(false), YTM_IDLE_REALTIME_STALE_MS);
  assert.equal(YTM_IDLE_REALTIME_STALE_MS, 0);
  assert.equal(ytmRealtimeStaleMs(true), YTM_PLAYING_REALTIME_STALE_MS);
  assert.equal(YTM_PLAYING_REALTIME_STALE_MS, 2500);
});
