import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mock } from 'node:test';
import { NectarBridge } from '../src/server/nectarBridge.ts';
import { NectarPlugin } from '../src/server/playerPlugins/nectarPlugin.ts';
import { nectarArtworkKey, nectarArtworkMatches, nectarArtworkCandidate } from '../src/nectarArtwork.ts';

test('unknown artist requires an exact album and an unambiguous artist', () => {
  const track = { title: 'Venom (Music From The Motion Picture)', artist: 'Eminem', album: 'Kamikaze' };
  assert.equal(nectarArtworkCandidate('Venom', 'Unbekannter Interpret', 'Kamikaze', [track]), track);
  assert.equal(nectarArtworkCandidate('Venom', 'Unbekannter Interpret', undefined, [track]), undefined);
  assert.equal(nectarArtworkCandidate('Venom', 'Unbekannter Interpret', 'Other', [track]), undefined);
  assert.equal(nectarArtworkCandidate('Venom', 'Unbekannter Interpret', 'Kamikaze', [track, { ...track, artist: 'Other' }]), undefined);
  assert.equal(nectarArtworkCandidate('Venom', 'Unbekannter Interpret', 'Kamikaze', [{ ...track, title: 'Venom (Live)' }]), undefined);
});

test('album artwork can match known artist and album when phone title is inaccurate', () => {
  const track = { title: 'Polyamorous', artist: 'Breaking Benjamin', album: 'Saturate' };
  assert.equal(nectarArtworkCandidate('Saturate', 'Breaking Benjamin', 'Saturate', [track]), track);
  assert.equal(nectarArtworkCandidate('Saturate', 'Other Artist', 'Saturate', [track]), undefined);
  assert.equal(nectarArtworkCandidate('Saturate', 'Breaking Benjamin', 'Saturate Live', [track]), undefined);
  assert.equal(nectarArtworkCandidate('Saturate', 'Unknown Artist', 'Saturate', [track]), undefined);
});

test('cover identity includes album and rejects mismatched versions', () => {
  assert.notEqual(nectarArtworkKey('Song', 'Artist', 'Studio'), nectarArtworkKey('Song', 'Artist', 'Live'));
  assert.equal(nectarArtworkMatches('Song', 'Artist', 'Studio', { title: 'Song', artist: 'Artist', album: 'Studio' }), true);
  assert.equal(nectarArtworkMatches('Song', 'Artist', 'Studio', { title: 'Song', artist: 'Other', album: 'Studio' }), false);
  assert.equal(nectarArtworkMatches('Song', 'Artist', 'Studio', { title: 'Song (Live)', artist: 'Artist', album: 'Studio' }), false);
  assert.equal(nectarArtworkMatches('Song', 'Artist', 'Studio', { title: 'Song', artist: 'Artist', album: 'Live' }), false);
});

test('late cover results cannot overwrite another artist or native artwork', async () => {
  const bridge = NectarBridge.getInstance();
  let finish!: (art: string | null) => void;
  bridge.setArtworkResolver(async title => title === 'Race Song' ? new Promise(resolve => { finish = resolve; }) : null);
  bridge.updateState({ title: 'Race Song', artist: 'First', album: 'One', albumArtUrl: '', isPlaying: true });
  bridge.updateState({ title: 'Race Song', artist: 'Second', album: 'Two', albumArtUrl: 'native-second' });
  finish('late-first');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bridge.getState()?.albumArtUrl, 'native-second');

  bridge.updateState({ title: 'Race Song', artist: 'Third', album: 'Three', albumArtUrl: '' });
  bridge.updateState({ albumArtUrl: 'native-third' });
  finish('late-search');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bridge.getState()?.albumArtUrl, 'native-third');
});

test('same title on another album clears previous cover and missing album is not inherited', () => {
  const bridge = NectarBridge.getInstance();
  bridge.updateState({ title: 'Album Test', artist: 'Artist', album: 'One', albumArtUrl: 'cover-one' });
  bridge.updateState({ title: 'Album Test', artist: 'Artist', album: 'Two', albumArtUrl: '' });
  assert.equal(bridge.getState()?.albumArtUrl, '');
  bridge.updateState({ title: 'Different', artist: 'Artist', albumArtUrl: '' });
  assert.equal(bridge.getState()?.album, undefined);
});

// Never dispatch real phone commands from tests.
const commandFiles: string[] = [];
mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 200 }));
const mkdir = fs.mkdirSync;
const write = fs.writeFileSync;
const rename = fs.renameSync;
mock.method(fs, 'renameSync', (...args: Parameters<typeof fs.renameSync>) => {
  if (String(args[0]).includes(`${path.sep}.nectar-commands${path.sep}`)) return;
  return rename(...args);
});
mock.method(fs, 'mkdirSync', (...args: Parameters<typeof fs.mkdirSync>) => {
  if (String(args[0]).endsWith('.nectar-commands')) return undefined;
  return mkdir(...args);
});
mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
  if (String(args[0]).includes(`${path.sep}.nectar-commands${path.sep}`)) { commandFiles.push(String(args[0])); return; }
  return write(...args);
});

test('Nectar clears disconnected tracks and preserves consecutive commands', async () => {
  const bridge = NectarBridge.getInstance();
  bridge.updateState({ title: 'Song', artist: 'Artist', isPlaying: true, albumArtUrl: 'data:image/png;base64,AA==' });
  const count = commandFiles.length;
  assert.equal(await bridge.sendCommand('next'), true);
  assert.equal(await bridge.sendCommand('next'), true);
  assert.equal(commandFiles.length - count, 2);
  assert.notEqual(commandFiles[count], commandFiles[count + 1]);
  bridge.popPendingCommands();
  assert.equal(await bridge.sendCommand('volume', 50), false);
  bridge.updateState({ title: '', artist: '', isPlaying: false });
  assert.equal(bridge.toTrack(), null);
});

test('Nectar reports command write failures without queueing them', async t => {
  const bridge = NectarBridge.getInstance();
  bridge.updateState({ title: 'Song', artist: 'Artist', isPlaying: true, albumArtUrl: 'data:image/png;base64,AA==' });
  bridge.popPendingCommands();
  const fail = t.mock.method(fs, 'writeFileSync', () => { throw new Error('Read only'); });
  assert.equal(await bridge.sendCommand('next'), false);
  assert.deepEqual(bridge.popPendingCommands(), []);
  fail.mock.restore();
});

test('NectarBridge tracks state updates and converts to Track', () => {
  const bridge = NectarBridge.getInstance();
  bridge.updateState({
    title: 'Nectar Test Song',
    artist: 'Phone Artist',
    album: 'Phone Album',
    isPlaying: true,
    progressSeconds: 15,
    durationSeconds: 180,
    playerApp: 'Spotify (Android)'
  });

  assert.equal(bridge.getIsConnected(), true);
  assert.equal(bridge.getIsPlaying(), true);

  const state = bridge.getState();
  assert.equal(state?.title, 'Nectar Test Song');
  assert.equal(state?.artist, 'Phone Artist');

  const track = bridge.toTrack();
  assert.ok(track);
  assert.equal(track?.title, 'Nectar Test Song');
  assert.equal(track?.artist, 'Phone Artist');
  assert.equal(track?.requester.displayName, 'Spotify (Android)');
  assert.ok(track?.url?.includes('spotify') || track?.url?.includes('search'));
});

test('NectarBridge resolves URLs based on active provider and resolver', async () => {
  const bridge = NectarBridge.getInstance();
  bridge.setActiveProvider('spotify');
  assert.equal(bridge.getActiveProvider(), 'spotify');

  bridge.setTrackUrlResolver(async (title, _artist, provider) => {
    if (provider === 'spotify') {
      return `https://open.spotify.com/track/mock123?q=${encodeURIComponent(title)}`;
    }
    return `https://music.youtube.com/watch?v=mockyt456`;
  });

  bridge.updateState({
    title: 'Bridge Song',
    artist: 'Bridge Artist',
    isPlaying: true
  });

  // Allow async resolver tick
  await new Promise(r => setTimeout(r, 50));

  let track = bridge.toTrack();
  assert.equal(track?.url, 'https://open.spotify.com/track/mock123?q=Bridge%20Song');
  assert.equal(track?.playbackProvider, 'spotify');

  // Switch to YouTube Music
  bridge.setActiveProvider('youtube_music');
  await new Promise(r => setTimeout(r, 50));

  track = bridge.toTrack();
  assert.equal(track?.url, 'https://music.youtube.com/watch?v=mockyt456');
  assert.equal(track?.playbackProvider, 'youtube_music');
});

test('NectarPlugin dispatches commands via Bridge', async () => {
  const bridge = NectarBridge.getInstance();
  const plugin = new NectarPlugin(bridge);

  assert.equal(plugin.isReady(), true);
  assert.equal(plugin.isPlaying(), true);

  await plugin.pause();
  assert.equal(bridge.getIsPlaying(), false);

  const commands = bridge.popPendingCommands();
  assert.equal(commands.length, 1);
  assert.equal(commands[0].action, 'pause');
});

test('QueueManager preserves Nectar playback against idle Spotify polling', async () => {
  const { QueueManager } = await import('../src/server/queueManager.ts');
  const bridge = NectarBridge.getInstance();
  bridge.updateState({
    title: 'Phone Jam',
    artist: 'Mobile Musician',
    isPlaying: true,
    progressSeconds: 10,
    durationSeconds: 200
  });

  let spotifyCb: ((snapshot: any) => void) | null = null;
  const mockSpotify = {
    subscribe: (cb: (s: any) => void) => { spotifyCb = cb; },
    isConnected: () => true,
    getStatus: () => ({ premium: true })
  } as any;

  const mockYtm = {
    subscribe: () => {},
    getIsConnected: () => false,
    getIsSimulation: () => true
  } as any;

  const qm = new QueueManager({ playbackProvider: 'spotify', blockedRequesters: [] } as any, mockYtm, mockSpotify);

  bridge.emit('state', bridge.getState()!);
  assert.equal(qm.getPlaybackState().currentSong?.title, 'Phone Jam');
  assert.equal(qm.getPlaybackState().isPlaying, true);

  // An idle Spotify poll snapshot arrives (no track)
  assert.ok(spotifyCb);
  spotifyCb!({ connected: true, isPlaying: false, trackUri: '', title: '' });

  // Must NOT wipe Nectar
  assert.equal(qm.getPlaybackState().currentSong?.title, 'Phone Jam');
  assert.equal(qm.getPlaybackState().isPlaying, true);

  // A paused old track from Spotify arrives
  spotifyCb!({ connected: true, isPlaying: false, trackUri: 'spotify:track:old', title: 'Old Spotify Song', artist: 'Artist' });
  // Must NOT replace Nectar with paused Spotify track
  assert.equal(qm.getPlaybackState().currentSong?.title, 'Phone Jam');
  assert.equal(qm.getPlaybackState().isPlaying, true);
});

test('QueueManager routes transport controls and volume to NectarPlugin when playing from phone', async () => {
  const { QueueManager } = await import('../src/server/queueManager.ts');
  const bridge = NectarBridge.getInstance();
  bridge.updateState({
    title: 'Dock Song',
    artist: 'Dock Artist',
    isPlaying: true,
    progressSeconds: 15,
    durationSeconds: 180
  });

  const throwingSpotify = {
    subscribe: () => {},
    isConnected: () => true,
    getStatus: () => ({ premium: true }),
    setVolume: () => { throw new Error('Spotify Rate Limit aktiv. Erneut in 43000s versuchen.'); },
    pause: () => { throw new Error('Spotify Rate Limit aktiv.'); },
    play: () => { throw new Error('Spotify Rate Limit aktiv.'); }
  } as any;

  const mockYtm = {
    subscribe: () => {},
    getIsConnected: () => false,
    getIsSimulation: () => true
  } as any;

  const qm = new QueueManager({ playbackProvider: 'spotify', blockedRequesters: [] } as any, mockYtm, throwingSpotify);
  bridge.emit('state', bridge.getState()!);

  // Nectar should be active plugin
  assert.equal(qm.getActivePlugin().id, 'nectar');

  // Volume command must go to Nectar, NOT throwing Spotify
  const volOk = await qm.setVolume(84);
  assert.equal(volOk, false);
  assert.equal(qm.getPlaybackState().volume, 80);

  // Play/pause must go to Nectar
  const pauseOk = await qm.playPause();
  assert.equal(pauseOk, true);

  const cmds = bridge.popPendingCommands();
  assert.equal(cmds.some(c => c.action === 'volume'), false);
  assert.ok(cmds.some(c => c.action === 'play_pause'));
});

test('NectarBridge resolves artwork online when screen is off (no local art provided)', async () => {
  const bridge = NectarBridge.getInstance();

  bridge.setArtworkResolver(async (title, _artist) => {
    if (title === 'Display Off Song') {
      return 'https://i.scdn.co/image/resolved-online-cover-123';
    }
    return null;
  });

  // State update without albumArtUrl (as happens when phone screen is locked/off)
  bridge.updateState({
    title: 'Display Off Song',
    artist: 'Screen Off Artist · Poweramp on Phone',
    isPlaying: true,
    albumArtUrl: ''
  });

  // Wait for async artwork resolution
  await new Promise(r => setTimeout(r, 60));

  const state = bridge.getState();
  assert.equal(state?.title, 'Display Off Song');
  assert.equal(state?.artist, 'Screen Off Artist');
  assert.equal(state?.albumArtUrl, 'https://i.scdn.co/image/resolved-online-cover-123');

  const track = bridge.toTrack();
  assert.equal(track?.albumArtUrl, 'https://i.scdn.co/image/resolved-online-cover-123');
});
