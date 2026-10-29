import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BotConfig, Track, PlaybackState } from '../src/types.ts';
import { PlayerPluginRegistry, type PlayerPlugin, type PlayerActionResult } from '../src/server/playerPlugins/index.ts';
import { QueueManager } from '../src/server/queueManager.ts';

let cwd: string, temporary: string;
beforeEach(() => {
  cwd = process.cwd();
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'player-plugin-test-'));
  process.chdir(temporary);
});
afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(temporary, { recursive: true, force: true });
});

const baseConfig: BotConfig = {
  twitchChannel: 'streamer',
  twitchBotUsername: 'bot',
  twitchBotOauthToken: 'oauth:token',
  twitchClientId: 'clientid',
  ytmdaCompanionUrl: 'http://127.0.0.1:9863',
  ytmdaAuthToken: 'token',
  playbackProvider: 'youtube_music',
  overlayPort: 3000,
  maxSongDurationSeconds: 420,
  maxActivePerViewer: 2,
  voteSkipThreshold: 3,
  autoPlayRadio: true,
  nowPlayingCooldownSeconds: 15,
  companionConnected: true,
  twitchConnected: true,
  simulationMode: true
};

class MockPlayerPlugin implements PlayerPlugin {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly webPlayerUrl: string;

  public playCalls = 0;
  public pauseCalls = 0;
  public playPauseCalls = 0;
  public skipCalls = 0;
  public previousCalls = 0;
  public volumeSet: number | null = null;
  public lastPlayedTrack: Track | null = null;
  public ready = true;
  public acceptPlay = true;

  constructor(
    id: string,
    name: string,
    description: string,
    webPlayerUrl: string
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.webPlayerUrl = webPlayerUrl;
  }

  isReady(): boolean {
    return this.ready;
  }

  async playTrack(track: Track): Promise<PlayerActionResult> {
    this.lastPlayedTrack = track;
    if (!this.acceptPlay) {
      return { success: false, error: `${this.name} play rejected` };
    }
    return { success: true, track };
  }

  async play(): Promise<boolean> {
    this.playCalls++;
    return true;
  }

  async pause(): Promise<boolean> {
    this.pauseCalls++;
    return true;
  }

  async playPause(_currentPlaybackState?: PlaybackState): Promise<boolean> {
    this.playPauseCalls++;
    return true;
  }

  async skip(): Promise<boolean> {
    this.skipCalls++;
    return true;
  }

  async previousTrack(): Promise<boolean> {
    this.previousCalls++;
    return true;
  }

  async setVolume(volume: number): Promise<boolean> {
    this.volumeSet = volume;
    return true;
  }
}

function makeTrack(id: string, provider: 'youtube_music' | 'spotify' = 'youtube_music'): any {
  return {
    id,
    title: `Song ${id}`,
    artist: 'Artist',
    albumArtUrl: 'https://example.com/art.jpg',
    thumbnailUrl: 'https://example.com/art.jpg',
    duration: 180,
    url: `https://example.com/${id}`,
    videoId: id,
    requester: { username: 'viewer1', displayName: 'Viewer One', badge: 'viewer' },
    requestedAt: Date.now(),
    playbackProvider: provider
  };
}

test('PlayerPluginRegistry registers and retrieves plugins with fallback', () => {
  const registry = new PlayerPluginRegistry();
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const spotify = new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com');

  registry.register(ytm);
  registry.register(spotify);

  assert.equal(registry.get('youtube_music'), ytm);
  assert.equal(registry.get('spotify'), spotify);
  assert.equal(registry.getActivePlugin('spotify'), spotify);
  assert.equal(registry.getActivePlugin('youtube_music'), ytm);
  // Unknown provider falls back to youtube_music
  assert.equal(registry.getActivePlugin('custom_unknown'), ytm);

  const descriptors = registry.listDescriptors();
  assert.equal(descriptors.length, 2);
  assert.equal(descriptors[0].id, 'youtube_music');
  assert.equal(descriptors[1].id, 'spotify');
});

test('QueueManager delegates playback commands directly to the active PlayerPlugin', async () => {
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const spotify = new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com');
  const registry = new PlayerPluginRegistry([ytm, spotify]);

  const mockCompanion = {
    subscribe: () => () => {},
    getIsConnected: () => true,
    getIsSimulation: () => true,
    playTrack: async () => true,
    play: async () => true,
    pause: async () => true,
    playPause: async () => true,
    previousTrack: async () => true,
    setVolume: async () => true,
    skipTrack: async () => true,
    getStartConfirmationTimeout: () => 1000,
    getLastCommandError: () => ''
  } as any;

  const queueManager = new QueueManager(baseConfig, mockCompanion, undefined, registry);

  // Default active plugin is youtube_music
  assert.equal(queueManager.getActivePlugin().id, 'youtube_music');

  await queueManager.play();
  assert.equal(ytm.playCalls, 1);

  await queueManager.pause();
  assert.equal(ytm.pauseCalls, 1);

  await queueManager.playPause();
  assert.equal(ytm.playPauseCalls, 1);

  await queueManager.setVolume(65);
  assert.equal(ytm.volumeSet, 65);

  await queueManager.previousTrack();
  assert.equal(ytm.previousCalls, 1);

  await queueManager.skipCurrent('streamer');
  assert.equal(ytm.skipCalls, 1);

  // Switch configuration to Spotify
  queueManager.updateConfig({ playbackProvider: 'spotify' });
  assert.equal(queueManager.getActivePlugin().id, 'spotify');
  assert.equal(ytm.pauseCalls, 2);

  await queueManager.play();
  assert.equal(spotify.playCalls, 1);

  await queueManager.pause();
  assert.equal(spotify.pauseCalls, 1);

  await queueManager.setVolume(42);
  assert.equal(spotify.volumeSet, 42);

  await queueManager.skipCurrent('streamer');
  assert.equal(spotify.skipCalls, 1);
});

test('switching providers pauses the outgoing player and resets playback for a new song', () => {
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const spotify = new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com');
  let spotifyListener: ((snapshot: any) => void) | null = null;
  const spotifyService = {
    subscribe: (listener: (snapshot: any) => void) => { spotifyListener = listener; return () => {}; },
    getSnapshot: () => ({}),
    isReadyForPlayback: () => true
  } as any;
  const companion = {
    subscribe: () => () => {}, getIsConnected: () => true, getIsSimulation: () => false
  } as any;
  const manager = new QueueManager(
    { ...baseConfig, playbackProvider: 'spotify' },
    companion,
    spotifyService,
    new PlayerPluginRegistry([ytm, spotify])
  );

  spotifyListener!({
    connected: true,
    isPlaying: true,
    progressSeconds: 35,
    durationSeconds: 180,
    volume: 70,
    trackUri: 'spotify:track:playing',
    trackId: 'playing',
    title: 'Playing on Spotify',
    artist: 'Artist'
  });

  manager.updateConfig({ playbackProvider: 'youtube_music' });

  const playback = manager.getPlaybackState();
  assert.equal(spotify.pauseCalls, 1);
  assert.equal(manager.getActivePlugin().id, 'youtube_music');
  assert.equal(playback.currentSong, null);
  assert.equal(playback.isPlaying, false);
  assert.equal(playback.progressSeconds, 0);
  assert.equal(playback.durationSeconds, 0);
  assert.equal(playback.source, 'idle');
  assert.equal(playback.volume, 70);
});

test('Current Playback tracks and controls a Spotify track started outside the bot queue', async () => {
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const spotify = new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com');
  const registry = new PlayerPluginRegistry([ytm, spotify]);
  let spotifyListener: ((snapshot: any) => void) | null = null;
  const spotifyService = {
    subscribe: (listener: (snapshot: any) => void) => { spotifyListener = listener; return () => {}; },
    getSnapshot: () => ({}),
    isReadyForPlayback: () => true
  } as any;
  let ytmListener: ((snapshot: any) => void) | null = null;
  const companion = {
    subscribe: (listener: (snapshot: any) => void) => { ytmListener = listener; return () => {}; },
    getIsConnected: () => true,
    getIsSimulation: () => false
  } as any;
  const manager = new QueueManager({ ...baseConfig, playbackProvider: 'spotify' }, companion, spotifyService, registry);

  spotifyListener!({
    connected: true,
    isPlaying: true,
    progressSeconds: 42,
    durationSeconds: 215,
    volume: 63,
    trackUri: 'spotify:track:abc123',
    trackId: 'abc123',
    title: 'External Spotify Song',
    artist: 'Spotify Artist',
    albumArtUrl: 'https://i.scdn.co/image/cover'
  });

  const playback = manager.getPlaybackState();
  assert.equal(playback.currentSong?.title, 'External Spotify Song');
  assert.equal(playback.currentSong?.playbackProvider, 'spotify');
  assert.equal(playback.currentSong?.spotifyUri, 'spotify:track:abc123');
  assert.equal(playback.source, 'external');
  assert.equal(playback.progressSeconds, 42);
  assert.equal(playback.durationSeconds, 215);
  assert.equal(playback.volume, 63);
  assert.equal(manager.getActivePlugin().id, 'spotify');

  await manager.playPause();
  await manager.previousTrack();
  await manager.setVolume(25);
  await manager.skipCurrent('streamer');
  assert.equal(spotify.playPauseCalls, 1);
  assert.equal(spotify.previousCalls, 1);
  assert.equal(spotify.volumeSet, 25);
  assert.equal(spotify.skipCalls, 1);

  ytmListener!({
    isConnected: true,
    isPlaying: true,
    progressSeconds: 1,
    durationSeconds: 100,
    volume: 50,
    songInfo: { id: 'abcdefghijk', title: 'Unrelated YouTube Song', author: 'YouTube Artist' }
  });
  assert.equal(manager.getPlaybackState().currentSong?.title, 'External Spotify Song');
});

test('Spotify request keeps its provider while waiting even if the preferred provider changes', () => {
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const spotify = new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com');
  const companion = {
    subscribe: () => () => {}, getIsConnected: () => false, getIsSimulation: () => false
  } as any;
  const spotifyService = {
    subscribe: () => () => {}, isReadyForPlayback: () => false
  } as any;
  const manager = new QueueManager({ ...baseConfig, playbackProvider: 'spotify', spotifyFallbackToYtm: false }, companion, spotifyService, new PlayerPluginRegistry([ytm, spotify]));
  const result = manager.addSong({
    videoId: 'abcdefghijk', title: 'Spotify Request', artist: 'Artist', duration: 180,
    thumbnailUrl: '', url: 'https://open.spotify.com/track/test', spotifyUri: 'spotify:track:test', requestSource: 'spotify'
  }, { username: 'viewer', displayName: 'Viewer', badge: 'viewer' });
  assert.equal(result.success, true);
  assert.equal(manager.getQueue()[0].playbackProvider, 'spotify');
  manager.updateConfig({ playbackProvider: 'youtube_music' });
  assert.equal(manager.getQueue()[0].playbackProvider, 'spotify');
  assert.equal(manager.getActivePlugin().id, 'youtube_music');
});

test('only the selected player can update Current Playback or start queued songs', async () => {
  fs.mkdirSync(path.join(temporary, 'data'), { recursive: true });
  fs.writeFileSync(path.join(temporary, 'data', 'queue.json'), JSON.stringify({ version: 3, queue: [{ ...makeTrack('youtube-only'), videoId: 'abcdefghijk' }], history: [] }));
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const spotify = new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com');
  let ytmListener: ((snapshot: any) => void) | null = null;
  let spotifyListener: ((snapshot: any) => void) | null = null;
  const companion = {
    subscribe: (listener: (snapshot: any) => void) => { ytmListener = listener; return () => {}; },
    getIsConnected: () => true, getIsSimulation: () => false,
    pause: async () => true, start: () => {}
  } as any;
  const spotifyService = {
    subscribe: (listener: (snapshot: any) => void) => { spotifyListener = listener; return () => {}; },
    isReadyForPlayback: () => true, pause: async () => true, getSnapshot: () => ({})
  } as any;
  const manager = new QueueManager(baseConfig, companion, spotifyService, new PlayerPluginRegistry([ytm, spotify]));
  spotifyListener!({ connected: true, isPlaying: true, trackUri: 'spotify:track:external', title: 'Spotify External', progressSeconds: 12, durationSeconds: 180, volume: 70 });
  assert.equal(manager.getPlaybackState().currentSong, null);
  ytmListener!({ isConnected: true, isPlaying: true, progressSeconds: 8, durationSeconds: 180, volume: 60, songInfo: { id: 'abcdefghijk', title: 'YouTube External', author: 'Artist' } });
  assert.equal(manager.getPlaybackState().currentSong?.title, 'YouTube External');

  manager.updateConfig({ playbackProvider: 'spotify' });
  ytmListener!({ isConnected: true, isPlaying: true, progressSeconds: 9, durationSeconds: 180, volume: 60, songInfo: { id: 'abcdefghijk', title: 'YouTube External', author: 'Artist' } });
  assert.equal(manager.getPlaybackState().currentSong, null);
  spotifyListener!({ connected: true, isPlaying: true, trackUri: 'spotify:track:external', title: 'Spotify External', progressSeconds: 12, durationSeconds: 180, volume: 70 });
  assert.equal(manager.getPlaybackState().currentSong?.title, 'Spotify External');

  const result = await manager.playNext();
  assert.equal(result, null);
  assert.equal(manager.getQueue().length, 1);
  assert.equal(ytm.lastPlayedTrack, null);
  assert.equal(spotify.lastPlayedTrack, null);
});

test('song requests stay queued while the selected player has an external song', async () => {
  for (const provider of ['youtube_music', 'spotify'] as const) {
    fs.mkdirSync(path.join(temporary, 'data'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'data', 'queue.json'), JSON.stringify({ version: 3, queue: [], history: [] }));
    const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
    const spotify = new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com');
    let ytmListener: ((snapshot: any) => void) | null = null;
    let spotifyListener: ((snapshot: any) => void) | null = null;
    const companion = {
      subscribe: (listener: (snapshot: any) => void) => { ytmListener = listener; return () => {}; },
      getIsConnected: () => true, getIsSimulation: () => false
    } as any;
    const spotifyService = {
      subscribe: (listener: (snapshot: any) => void) => { spotifyListener = listener; return () => {}; },
      isReadyForPlayback: () => true, getSnapshot: () => ({})
    } as any;
    const manager = new QueueManager({ ...baseConfig, playbackProvider: provider }, companion, spotifyService, new PlayerPluginRegistry([ytm, spotify]));
    if (provider === 'spotify') {
      spotifyListener!({ connected: true, isPlaying: true, trackUri: 'spotify:track:external', trackId: 'external', title: 'External song', artist: 'Artist', progressSeconds: 5, durationSeconds: 180, volume: 60 });
    } else {
      ytmListener!({ isConnected: true, isPlaying: true, progressSeconds: 5, durationSeconds: 180, volume: 60, songInfo: { id: 'abcdefghijk', title: 'External song', author: 'Artist' } });
    }
    const result = manager.addSong({
      videoId: provider === 'spotify' ? 'spotify-requested' : 'lmnopqrstuv',
      title: 'Requested song', artist: 'Artist', duration: 180, thumbnailUrl: '',
      url: provider === 'spotify' ? 'https://open.spotify.com/track/requested' : 'https://music.youtube.com/watch?v=lmnopqrstuv',
      spotifyUri: provider === 'spotify' ? 'spotify:track:requested' : undefined
    }, { username: 'viewer', displayName: 'Viewer', badge: 'viewer' });
    await Promise.resolve();
    assert.equal(result.success, true);
    assert.equal(manager.getQueue().length, 1);
    assert.equal(manager.getPlaybackState().currentSong?.title, 'External song');
    assert.equal(ytm.lastPlayedTrack, null);
    assert.equal(spotify.lastPlayedTrack, null);
  }
});

test('a title-only YouTube status cannot replace or block a real song request', async () => {
  let listener: ((snapshot: any) => void) | null = null;
  const companion = {
    subscribe: (cb: (snapshot: any) => void) => { listener = cb; return () => {}; },
    getIsConnected: () => true, getIsSimulation: () => false,
    pause: async () => true, start: () => {}, getStartConfirmationTimeout: () => 20,
    getLastCommandError: () => ''
  } as any;
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const manager = new QueueManager(baseConfig, companion, undefined, new PlayerPluginRegistry([ytm]));
  listener!({ isConnected: true, isPlaying: true, progressSeconds: 0, durationSeconds: 0, volume: 50, songInfo: { id: '', title: 'Old window title', author: '' } });
  assert.equal(manager.getPlaybackState().currentSong, null);
  const result = manager.addSong({ videoId: 'abcdefghijk', title: 'Requested song', artist: 'Artist', duration: 180, thumbnailUrl: '', url: 'https://music.youtube.com/watch?v=abcdefghijk' }, { username: 'viewer', displayName: 'Viewer', badge: 'viewer' });
  assert.equal(result.success, true);
  const starting = manager.playNext();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ytm.lastPlayedTrack?.title, 'Requested song');
  listener!({ isConnected: true, isPlaying: true, progressSeconds: 0, durationSeconds: 0, volume: 50, songInfo: { id: '', title: 'Old window title', author: '' } });
  assert.equal(manager.getPlaybackState().currentSong?.title, 'Requested song');
  listener!({ isConnected: true, isPlaying: true, progressSeconds: 0, durationSeconds: 0, volume: 50, songInfo: { id: '', title: 'Requested song', author: '' } });
  assert.equal(manager.getPlaybackState().status, 'loading');
  listener!({ isConnected: true, isPlaying: true, progressSeconds: 1, durationSeconds: 180, volume: 50, songInfo: { id: 'abcdefghijk', title: 'Requested song', author: 'Artist' } });
  await starting;
  assert.equal(manager.getPlaybackState().source, 'queue');
});

test('restart restores an active Spotify queue request from persisted state', () => {
  const active = { ...makeTrack('spotify-active', 'spotify'), videoId: 'abcdefghijk', spotifyUri: 'spotify:track:restored' };
  fs.mkdirSync(path.join(temporary, 'data'), { recursive: true });
  fs.writeFileSync(path.join(temporary, 'data', 'queue.json'), JSON.stringify({ version: 3, queue: [], active, history: [] }));
  let spotifyListener: ((snapshot: any) => void) | null = null;
  const spotifyService = {
    subscribe: (listener: (snapshot: any) => void) => { spotifyListener = listener; return () => {}; },
    isReadyForPlayback: () => true,
    getSnapshot: () => ({})
  } as any;
  const companion = { subscribe: () => () => {}, getIsConnected: () => true, getIsSimulation: () => false } as any;
  const registry = new PlayerPluginRegistry([
    new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com'),
    new MockPlayerPlugin('spotify', 'Spotify', 'Spotify Player', 'https://open.spotify.com')
  ]);
  const manager = new QueueManager({ ...baseConfig, playbackProvider: 'spotify' }, companion, spotifyService, registry);
  spotifyListener!({ connected: true, isPlaying: true, progressSeconds: 12, durationSeconds: 180, volume: 60, trackUri: 'spotify:track:restored', title: 'Restored Song', artist: 'Artist' });
  assert.equal(manager.getCurrentTrack()?.id, active.id);
  assert.equal(manager.getPlaybackState().currentSong?.title, 'Restored Song');
  assert.equal(manager.getPlaybackState().source, 'queue');
  assert.equal(manager.getQueue().length, 0);
});

test('QueueManager plays and transitions queued tracks cleanly with the active plugin', async () => {
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const registry = new PlayerPluginRegistry([ytm]);

  let emitCallback: any = null;
  const mockCompanion = {
    subscribe: (cb: any) => { emitCallback = cb; return () => {}; },
    getIsConnected: () => true,
    getIsSimulation: () => true,
    playTrack: async () => true,
    play: async () => true,
    pause: async () => true,
    getStartConfirmationTimeout: () => 2000,
    getLastCommandError: () => ''
  } as any;

  const queueManager = new QueueManager(baseConfig, mockCompanion, undefined, registry);

  const track1 = makeTrack('vid1');
  const track2 = makeTrack('vid2');

  queueManager.addSong(track1, track1.requester);
  queueManager.addSong(track2, track2.requester);

  assert.equal(queueManager.getQueue().length, 2);

  // Trigger play next in background and simulate companion confirmation
  const playPromise = queueManager.playNext();

  // Allow promise to start pendingTrack
  await new Promise(r => setTimeout(r, 10));

  // Simulate companion confirming track1
  emitCallback?.({
    songInfo: { id: 'vid1', title: 'Song vid1', author: 'Artist' },
    isPlaying: true,
    progressSeconds: 1,
    durationSeconds: 180,
    isConnected: true
  });

  const started = await playPromise;
  assert.ok(started);
  assert.equal(started?.videoId, 'vid1');
  assert.equal(queueManager.getCurrentTrack()?.videoId, 'vid1');
  assert.equal(queueManager.getQueue().length, 1);
  assert.equal(queueManager.getQueue()[0].videoId, 'vid2');
  assert.equal(queueManager.getPlaybackState().isPlaying, true);
});

test('previousTrack delegates to active plugin when playback source is autoplay_radio even if history is not empty', async () => {
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  const registry = new PlayerPluginRegistry([ytm]);

  const mockCompanion = {
    subscribe: () => () => {},
    getIsConnected: () => true,
    getIsSimulation: () => true,
    previousTrack: async () => true,
    getStartConfirmationTimeout: () => 1000,
    getLastCommandError: () => ''
  } as any;

  const queueManager = new QueueManager(baseConfig, mockCompanion, undefined, registry);
  (queueManager as any).history = [makeTrack('old1')];
  (queueManager as any).playbackState.source = 'autoplay_radio';
  (queueManager as any).playbackState.progressSeconds = 1;

  const ok = await queueManager.previousTrack();
  assert.equal(ok, true);
  assert.equal(ytm.previousCalls, 1);
  // History should remain intact and not inserted into queue
  assert.equal(queueManager.getQueue().length, 0);
  assert.equal(queueManager.getHistory().length, 1);
});

test('skipCurrent discards unconfirmed queue track when explicitly skipped and falls through to player skip', async () => {
  const ytm = new MockPlayerPlugin('youtube_music', 'YTM', 'YTM Player', 'https://music.youtube.com');
  ytm.acceptPlay = false;
  const registry = new PlayerPluginRegistry([ytm]);

  const mockCompanion = {
    subscribe: () => () => {},
    getIsConnected: () => true,
    getIsSimulation: () => true,
    playTrack: async () => false,
    skipTrack: async () => true,
    getStartConfirmationTimeout: () => 50,
    getLastCommandError: () => 'Command rejected'
  } as any;

  const queueManager = new QueueManager(baseConfig, mockCompanion, undefined, registry);
  const brokenTrack = makeTrack('broken1');
  queueManager.addSong(brokenTrack, brokenTrack.requester);
  // Wait for automatic playNext attempt to complete its rejection
  await new Promise(r => setTimeout(r, 20));
  assert.equal(queueManager.getQueue().length, 1);

  // Explicit skipCurrent should attempt next, fail, discard the broken track and call ytm.skip()
  const result = await queueManager.skipCurrent('streamer');
  assert.equal(result.success, true);
  assert.equal(queueManager.getQueue().length, 0);
  assert.equal(ytm.skipCalls, 1);
});
