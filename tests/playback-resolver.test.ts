import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveForPlaybackProvider } from '../src/server/playbackResolver.ts';
import { YouTubeResolver } from '../src/server/youtubeResolver.ts';

test('plain dashboard and Twitch requests use Spotify search when Spotify is active', async () => {
  let searched = '';
  const spotify = {
    isReadyForPlayback: () => true,
    searchTrack: async (query: string) => {
      searched = query;
      return { videoId: 'spotify-track1', title: 'Song', artist: 'Artist', duration: 180, thumbnailUrl: '', url: 'https://open.spotify.com/track/track1', requestSource: 'spotify', spotifyUri: 'spotify:track:track1' };
    }
  };
  const result = await resolveForPlaybackProvider('Artist Song', { playbackProvider: 'spotify', spotifyFallbackToYtm: false }, spotify as any);
  assert.equal(searched, 'Artist Song');
  assert.equal(result.spotifyUri, 'spotify:track:track1');
});

test('Spotify without a ready player does not silently route to YouTube when fallback is disabled', async () => {
  const spotify = { isReadyForPlayback: () => false, searchTrack: async () => { throw new Error('unexpected'); } };
  await assert.rejects(
    resolveForPlaybackProvider('Artist Song', { playbackProvider: 'spotify', spotifyFallbackToYtm: false }, spotify as any),
    /Spotify Premium ist nicht bereit/
  );
});

test('Spotify selection resolves Spotify links through Spotify and never searches YouTube', async () => {
  const id = 'A'.repeat(22);
  let searched = '';
  const spotify = {
    isReadyForPlayback: () => true,
    searchTrack: async (query: string) => {
      searched = query;
      return { videoId: `spotify-${id}`, title: 'Song', artist: 'Artist', duration: 180, thumbnailUrl: '', url: `https://open.spotify.com/track/${id}`, spotifyUri: `spotify:track:${id}` };
    }
  };
  const link = `https://open.spotify.com/track/${id}`;
  const result = await resolveForPlaybackProvider(link, { playbackProvider: 'spotify', spotifyFallbackToYtm: true }, spotify as any);
  assert.equal(searched, link);
  assert.equal(result.spotifyUri, `spotify:track:${id}`);
  await assert.rejects(resolveForPlaybackProvider('https://music.youtube.com/watch?v=abcdefghijk', { playbackProvider: 'spotify', spotifyFallbackToYtm: true }, spotify as any), /YouTube-Links/);
});

test('YouTube selection converts Spotify track links into YouTube playback requests', async () => {
  const link = `spotify:track:${'B'.repeat(22)}`;
  const originalResolve = YouTubeResolver.resolve;
  let resolvedQuery = '';
  YouTubeResolver.resolve = async (query: string) => {
    resolvedQuery = query;
    return { videoId: 'abcdefghijk', title: 'Matched Song', artist: 'Artist', duration: 180, thumbnailUrl: '', url: 'https://music.youtube.com/watch?v=abcdefghijk', requestSource: 'spotify', originalRequestUrl: link, spotifyUri: link };
  };
  try {
    const result = await resolveForPlaybackProvider(link, { playbackProvider: 'youtube_music', spotifyFallbackToYtm: true });
    assert.equal(resolvedQuery, link);
    assert.equal(result.videoId, 'abcdefghijk');
    assert.equal(result.spotifyUri, undefined);
  } finally {
    YouTubeResolver.resolve = originalResolve;
  }
});

test('Spotify selection never falls back to YouTube when unavailable', async () => {
  await assert.rejects(resolveForPlaybackProvider('Artist Song', { playbackProvider: 'spotify', spotifyFallbackToYtm: true }, { isReadyForPlayback: () => false, searchTrack: async () => { throw new Error('unexpected'); } } as any), /Spotify Premium ist nicht bereit/);
});
