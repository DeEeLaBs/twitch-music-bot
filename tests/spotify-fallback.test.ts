import test from 'node:test';
import assert from 'node:assert/strict';
import { spotifyPlaylistUri } from '../src/spotifyPlaylist.ts';
import { validateConfig } from '../src/server/validation.ts';
import { QueueManager } from '../src/server/queueManager.ts';
import { SpotifyService } from '../src/server/spotifyService.ts';

test('playlist playback sends a context to the selected Spotify device and rejects API errors', async () => {
  const service: any = Object.create(SpotifyService.prototype);
  service.isReadyForPlayback = () => true;
  service.targetDeviceId = async () => 'web-player';
  const calls: string[] = [];
  service.api = async (path: string, options: RequestInit) => {
    calls.push(path);
    if (path.includes('/shuffle?')) {
      assert.equal(path, '/me/player/shuffle?state=true&device_id=web-player');
      assert.equal(options.method, 'PUT');
      return new Response(null, { status: 204 });
    }
    assert.equal(path, '/me/player/play?device_id=web-player');
    assert.deepEqual(JSON.parse(String(options.body)), { context_uri: uri, position_ms: 0 });
    return new Response(null, { status: 204 });
  };
  assert.equal(await service.playPlaylist(uri), true);
  assert.equal(calls.length, 2);
  service.api = async (path: string) => new Response(null, { status: path.includes('/shuffle?') ? 403 : 204 });
  await assert.rejects(service.playPlaylist(uri), /Shuffle fehlgeschlagen/);
  service.api = async () => new Response(null, { status: 403 });
  await assert.rejects(service.playPlaylist(uri), /403/);
});

test('late playlist response must not clear a newer request or provider state', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
  manager.queue = []; manager.notify = () => {};
  let finish: (value: boolean) => void = () => {};
  manager.spotifyService = { playPlaylist: () => new Promise<boolean>(resolve => { finish = resolve; }) };
  const pending = manager.continueSpotifyAfterRequest();
  manager.currentTrack = { id: 'new-request' };
  manager.playbackState = { currentSong: manager.currentTrack, isPlaying: true };
  finish(true); await pending;
  assert.equal(manager.playbackState.currentSong?.id, 'new-request');
});

const uri = 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M';

test('external Spotify playlist hands queued requests over at song boundaries', async () => {
  for (const scenario of [
    { progress: 80, uri: 'spotify:track:old', playing: true, after: 90, expected: 0 },
    { progress: 80, uri: 'spotify:track:old', playing: false, after: 80, expected: 0 },
    { progress: 198, uri: 'spotify:track:old', playing: false, after: 0, expected: 1 },
    { progress: 198, uri: undefined, playing: false, after: 0, expected: 1 },
    { progress: 198, uri: 'spotify:track:old', playing: true, after: 199.8, expected: 1 },
    { progress: 190, uri: 'spotify:track:new', playing: true, after: 1, expected: 1 }
  ]) {
    for (const guard of ['none', 'transition', 'error', 'other-provider', 'empty']) {
      const manager: any = Object.create(QueueManager.prototype);
      manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
      manager.queue = guard === 'empty' ? [] : [{ playbackProvider: guard === 'other-provider' ? 'youtube_music' : 'spotify' }];
      manager.playbackState = {
        currentSong: { playbackProvider: 'spotify', spotifyUri: 'spotify:track:old' },
        source: 'external', isPlaying: true, progressSeconds: scenario.progress, durationSeconds: 200
      };
      manager.transition = guard === 'transition' ? Promise.resolve(null) : null;
      manager.playbackError = guard === 'error' ? 'Start failed' : '';
      manager.notify = () => {};
      let listener: any, starts = 0;
      manager.spotifyService = { subscribe: (cb: any) => { listener = cb; } };
      manager.playNext = async () => { starts++; manager.transition = Promise.resolve(null); };
      manager.initSpotifySubscription();
      const snapshot = {
        connected: true, trackUri: scenario.uri, title: scenario.uri ? 'Playlist song' : '',
        isPlaying: scenario.playing, progressSeconds: scenario.after, durationSeconds: 200
      };
      listener(snapshot);
      listener(snapshot);
      assert.equal(starts, guard === 'none' ? scenario.expected : 0, JSON.stringify({ scenario, guard }));
    }
  }
});

test('skipping the final request starts the playlist directly and preserves request on failure', async () => {
  for (const fail of [false, true]) {
    const manager: any = Object.create(QueueManager.prototype);
    manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
    manager.queue = [];
    manager.currentTrack = { id: 'request', playbackProvider: 'spotify' };
    manager.playbackState = { currentSong: manager.currentTrack, source: 'queue' };
    manager.notify = () => {};
    manager.archiveCurrent = () => { manager.currentTrack = null; };
    manager.getActivePlugin = () => { throw new Error('Must not send Next for an isolated request'); };
    let calls = 0;
    manager.spotifyService = { playPlaylist: async (selected: string) => {
      calls++; assert.equal(selected, uri);
      if (fail) throw new Error('Unavailable');
      return true;
    } };
    const result = await manager.skipCurrent('Streamer');
    assert.equal(calls, 1);
    assert.equal(result.success, !fail);
    assert.equal(manager.skipping, false);
    assert.equal(Boolean(manager.currentTrack), fail);
    if (fail) assert.match(manager.playbackError, /Unavailable/);
    else assert.equal(manager.playbackState.source, 'external');
  }
});

test('skip starts the next queued Spotify request before considering a backup playlist', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
  const next = { id: 'next', playbackProvider: 'spotify' };
  manager.queue = [next];
  manager.playNext = async () => next;
  manager.spotifyService = { playPlaylist: () => { throw new Error('Playlist must not start'); } };
  assert.deepEqual(await manager.skipCurrent('Streamer'), { success: true, nextTrack: next });
});

test('Spotify listener continues after finished item resets to zero but respects manual pause', async () => {
  for (const scenario of [
    { before: 198, after: 0, connected: true, expected: 1 },
    { before: 80, after: 0, connected: true, expected: 0 },
    { before: 198, after: 198, connected: true, expected: 0 },
    { before: 198, after: 0, connected: false, expected: 0 }
  ]) {
    const manager: any = Object.create(QueueManager.prototype);
    manager.config = { playbackProvider: 'spotify' };
    manager.currentTrack = { id: 'request', playbackProvider: 'spotify', spotifyUri: 'spotify:track:test', duration: 200 };
    manager.playbackState = { isPlaying: true, progressSeconds: scenario.before, durationSeconds: 200 };
    let listener: any, continued = 0;
    manager.spotifyService = { subscribe: (cb: any) => { listener = cb; } };
    manager.archiveCurrent = () => { manager.currentTrack = null; };
    manager.continueSpotifyAfterRequest = async () => { continued++; };
    manager.notify = () => {};
    manager.initSpotifySubscription();
    listener({ connected: scenario.connected, isPlaying: false, trackUri: 'spotify:track:test', progressSeconds: scenario.after, durationSeconds: 200 });
    assert.equal(continued, scenario.expected, JSON.stringify(scenario));
  }
});
test('playlist selection accepts Spotify links, persists a URI and rejects foreign links', () => {
  assert.equal(validateConfig({ spotifyFallbackPlaylist: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc' }).spotifyFallbackPlaylist, uri);
  assert.equal(spotifyPlaylistUri(''), '');
  assert.throws(() => spotifyPlaylistUri('https://example.com/playlist/37i9dQZF1DXcBWIGoYBM5M'));
});

test('Spotify continuation prioritizes requests, prevents duplicate starts and reports failures', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri, language: 'en' };
  manager.queue = [{ playbackProvider: 'spotify' }]; manager.playbackState = {}; manager.notify = () => {};
  let next = 0, playlists = 0;
  manager.playNext = async () => { next++; };
  let finish: () => void = () => {};
  manager.spotifyService = { playPlaylist: async (value: string) => { assert.equal(value, uri); playlists++; await new Promise<void>(resolve => { finish = resolve; }); return true; } };
  await manager.continueSpotifyAfterRequest();
  assert.equal(next, 1); assert.equal(playlists, 0);
  manager.queue = [{ playbackProvider: 'youtube_music' }];
  const pending = manager.continueSpotifyAfterRequest();
  await manager.continueSpotifyAfterRequest();
  assert.equal(playlists, 1);
  finish(); await pending;
  manager.spotifyService.playPlaylist = async () => { throw new Error('Unavailable'); };
  await manager.continueSpotifyAfterRequest();
  assert.match(manager.playbackError, /Unavailable/);
  assert.equal(manager.spotifyContinuationPending, false);
});

test('SpotifyService next triggers adaptive poll burst and updates track rapidly', async () => {
  const service = new SpotifyService('test-client-id', 'test-device');
  (service as any).refreshToken = 'fake-refresh-token';
  (service as any).accessToken = 'fake-access-token';
  (service as any).accessTokenExpiresAt = Date.now() + 3600_000;
  (service as any).profile = { id: 'test-user', product: 'premium' };

  let pollCount = 0;
  let returnedTrackUri = 'spotify:track:track1';
  (service as any).api = async (path: string) => {
    if (path.startsWith('/me/player/next')) {
      return new Response(null, { status: 204 });
    }
    if (path === '/me/player') {
      pollCount++;
      if (pollCount >= 2) {
        returnedTrackUri = 'spotify:track:track2';
      }
      return new Response(JSON.stringify({
        is_playing: true,
        progress_ms: 1000,
        item: {
          id: returnedTrackUri.replace('spotify:track:', ''),
          uri: returnedTrackUri,
          name: 'Track Title',
          duration_ms: 180000,
          artists: [{ name: 'Track Artist' }]
        },
        device: { id: 'test-device', volume_percent: 80 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(null, { status: 404 });
  };

  await service.poll();
  assert.equal(service.getSnapshot().trackUri, 'spotify:track:track1');

  pollCount = 0;
  await service.next();

  await new Promise(resolve => setTimeout(resolve, 600));

  assert.equal(service.getSnapshot().trackUri, 'spotify:track:track2');
  assert.ok(pollCount >= 2, 'Should have polled multiple times in burst until track changed');

  service.stop();
});

test('QueueManager skipCurrent on external Spotify sets loading status then updates to playing', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify' };
  manager.queue = [];
  manager.currentTrack = null;
  manager.playbackState = {
    currentSong: { id: 'spotify-live-track1', title: 'Old Song', artist: 'Old Artist', playbackProvider: 'spotify', duration: 180, requester: { username: 'spotify' } },
    source: 'external',
    isPlaying: true,
    progressSeconds: 50,
    durationSeconds: 180,
    status: 'playing'
  };
  manager.skipping = false;
  manager.history = [];
  manager.voteSkip = { votes: [], currentTrackId: null };
  manager.saveQueue = () => {};
  manager.notify = () => {};
  manager.archiveCurrent = () => {};
  let skipped = false;
  manager.getActivePlugin = () => ({
    skip: async () => { skipped = true; return true; }
  });

  let listener: any;
  manager.spotifyService = { subscribe: (cb: any) => { listener = cb; } };
  manager.initSpotifySubscription();

  const res = await manager.skipCurrent('streamer');
  assert.equal(res.success, true);
  assert.equal(skipped, true);
  assert.equal(manager.playbackState.status, 'loading');

  listener({
    connected: true,
    isPlaying: true,
    trackUri: 'spotify:track:newtrack',
    trackId: 'newtrack',
    title: 'New Song',
    artist: 'New Artist',
    durationSeconds: 200,
    progressSeconds: 1
  });

  assert.equal(manager.playbackState.status, 'playing');
  assert.equal(manager.playbackState.currentSong?.title, 'New Song');
  assert.equal(manager.playbackState.currentSong?.spotifyUri, 'spotify:track:newtrack');
});

test('SpotifyService targetDeviceId prioritizes active Web Player over preferred device', async () => {
  const service = new SpotifyService('client-id', 'offline-preferred-device');
  (service as any).devices = async () => [
    { id: 'offline-preferred-device', name: 'Desktop App', is_active: false },
    { id: 'active-web-player', name: 'Web Player', is_active: true }
  ];
  assert.equal(await (service as any).targetDeviceId(), 'active-web-player');
});

test('SpotifyService targetDeviceId remembers last active device when playback momentarily stops', async () => {
  const service = new SpotifyService('client-id', 'offline-preferred-device');
  (service as any).lastActiveDeviceId = 'web-player-id';
  (service as any).devices = async () => [
    { id: 'offline-preferred-device', name: 'Desktop App', is_active: false },
    { id: 'web-player-id', name: 'Web Player', is_active: false }
  ];
  assert.equal(await (service as any).targetDeviceId(), 'web-player-id');
});

test('Spotify listener triggers fallback playlist continuation when track stops with no URI even mid-song', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify' };
  manager.currentTrack = { id: 'request', playbackProvider: 'spotify', spotifyUri: 'spotify:track:mid', duration: 240 };
  manager.playbackState = { isPlaying: true, progressSeconds: 45, durationSeconds: 240 };
  let listener: any, continued = 0;
  manager.spotifyService = { subscribe: (cb: any) => { listener = cb; } };
  manager.archiveCurrent = () => { manager.currentTrack = null; };
  manager.continueSpotifyAfterRequest = async () => { continued++; };
  manager.notify = () => {};
  manager.initSpotifySubscription();

  // Spotify returns empty / no trackUri mid-song (e.g. 204 No Content after user skipped)
  listener({ connected: true, isPlaying: false, trackUri: undefined, progressSeconds: 0, durationSeconds: 0 });
  assert.equal(continued, 1);
});

test('continueSpotifyAfterRequest preserves incoming external track and does not wipe it', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
  manager.queue = [];
  manager.notify = () => {};
  manager.currentTrack = null;
  manager.playbackState = { source: 'external', currentSong: { id: 'playlist-track-1', title: 'Backup Song' }, isPlaying: true };
  manager.spotifyService = { playPlaylist: async () => true };

  await manager.continueSpotifyAfterRequest();
  assert.equal(manager.playbackState.source, 'external');
  assert.equal(manager.playbackState.currentSong?.id, 'playlist-track-1');
  assert.equal(manager.playbackState.isPlaying, true);
});

test('skipCurrent with fallback playlist preserves external track metadata if snapshot arrived during play', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
  manager.queue = [];
  manager.currentTrack = { id: 'req', playbackProvider: 'spotify' };
  manager.playbackState = { currentSong: manager.currentTrack, source: 'queue' };
  manager.notify = () => {};
  manager.archiveCurrent = () => { manager.currentTrack = null; };
  manager.spotifyService = {
    playPlaylist: async () => {
      // Simulate listener updating playbackState during poll burst
      manager.currentTrack = null;
      manager.playbackState = {
        currentSong: { id: 'fallback-track-1', title: 'Fallback Song 1' },
        source: 'external',
        isPlaying: true,
        progressSeconds: 1,
        durationSeconds: 200,
        status: 'playing'
      };
      return true;
    }
  };

  const res = await manager.skipCurrent('streamer');
  assert.equal(res.success, true);
  assert.equal(manager.playbackState.source, 'external');
  assert.equal(manager.playbackState.currentSong?.id, 'fallback-track-1');
  assert.equal(manager.playbackState.isPlaying, true);
});

test('song request reaching end clears currentSong immediately and ignores stale echo before fallback song starts', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
  manager.queue = [];
  manager.history = [];
  manager.voteSkip = { votes: [], currentTrackId: 'req-1' };
  manager.currentTrack = { id: 'req-1', title: 'Old Song', artist: 'Old Artist', playbackProvider: 'spotify', spotifyUri: 'spotify:track:old-song', duration: 100 };
  manager.playbackState = {
    currentSong: manager.currentTrack,
    source: 'queue',
    isPlaying: true,
    progressSeconds: 98,
    durationSeconds: 100,
    status: 'playing'
  };
  manager.saveQueue = () => {};
  let notifyCount = 0;
  manager.notify = () => { notifyCount++; };
  let continuedCount = 0;
  manager.continueSpotifyAfterRequest = async () => { continuedCount++; };

  let listener: any;
  manager.spotifyService = { subscribe: (cb: any) => { listener = cb; } };
  manager.initSpotifySubscription();

  // 1. Song reaches the end boundary (progress >= duration - 0.5)
  listener({
    connected: true,
    isPlaying: true,
    trackUri: 'spotify:track:old-song',
    title: 'Old Song',
    progressSeconds: 99.8,
    durationSeconds: 100
  });

  // Current track must be archived, currentSong cleared to null, status set to loading
  assert.equal(manager.currentTrack, null);
  assert.equal(manager.playbackState.currentSong, null);
  assert.equal(manager.playbackState.status, 'loading');
  assert.equal(manager.lastArchivedSpotifyUri, 'spotify:track:old-song');
  assert.equal(continuedCount, 1);

  // 2. Stale poll snapshot still reporting the old song from Spotify API delay
  listener({
    connected: true,
    isPlaying: true,
    trackUri: 'spotify:track:old-song',
    title: 'Old Song',
    progressSeconds: 100,
    durationSeconds: 100
  });

  // Must still be suppressed! Old song must not reappear as externalTrack
  assert.equal(manager.playbackState.currentSong, null);

  // 3. New track from fallback playlist arrives
  listener({
    connected: true,
    isPlaying: true,
    trackUri: 'spotify:track:new-fallback-song',
    title: 'New Fallback Song',
    artist: 'Playlist Artist',
    progressSeconds: 1,
    durationSeconds: 180
  });

  // Fallback track is rendered cleanly and suppression is cleared
  assert.equal(manager.playbackState.currentSong?.title, 'New Fallback Song');
  assert.equal(manager.playbackState.source, 'external');
  assert.equal(manager.lastArchivedSpotifyUri, null);
});


test('repeated skips inside the Spotify fallback playlist advance without restarting its shuffle context', async () => {
  const manager: any = Object.create(QueueManager.prototype);
  manager.config = { playbackProvider: 'spotify', spotifyFallbackPlaylist: uri };
  manager.queue = [];
  manager.currentTrack = null;
  manager.playbackState = { currentSong: { id: 'live', playbackProvider: 'spotify', spotifyUri: 'spotify:track:live' }, source: 'external' };
  manager.notify = () => {};
  manager.archiveCurrent = () => {};
  let nextCalls = 0, playlistStarts = 0;
  manager.getActivePlugin = () => ({ skip: async () => { nextCalls++; return true; } });
  manager.spotifyService = { playPlaylist: async () => { playlistStarts++; return true; } };
  for (let i = 0; i < 8; i++) {
    assert.equal((await manager.skipCurrent('Streamer')).success, true);
    assert.equal(manager.playbackState.source, 'external');
  }
  assert.equal(nextCalls, 8);
  assert.equal(playlistStarts, 0);
});

test('Spotify playlist shuffle is enabled before starting its playback context', async () => {
  const service: any = Object.create(SpotifyService.prototype);
  service.isReadyForPlayback = () => true;
  service.targetDeviceId = async () => 'device';
  service.triggerPollBurst = () => {};
  const calls: string[] = [];
  service.api = async (path: string) => { calls.push(path); return new Response(null, { status: 204 }); };
  await service.playPlaylist(uri);
  assert.deepEqual(calls, ['/me/player/shuffle?state=true&device_id=device', '/me/player/play?device_id=device']);
  calls.length = 0;
  service.api = async (path: string) => { calls.push(path); return new Response(null, { status: 403 }); };
  await assert.rejects(service.playPlaylist(uri), /Shuffle fehlgeschlagen/);
  assert.deepEqual(calls, ['/me/player/shuffle?state=true&device_id=device']);
});
