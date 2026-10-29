import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { build } from 'esbuild';
import { writeFileSync, unlinkSync } from 'node:fs';
import { SpotifyService } from '../src/server/spotifyService.ts';

const bundle = new URL('../player-reactivity-fixture.mjs', import.meta.url);
const output = await build({ entryPoints: ['src/components/NowPlayingCard.tsx'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
writeFileSync(bundle, output.outputFiles[0].text);
const { NowPlayingCard } = await import(bundle.href);
if (!process.env.PLAYER_REACTIVITY_COVERAGE) unlinkSync(bundle);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = globalThis;
const song = { id: 'spotify-live-first', spotifyUri: 'spotify:track:first', playbackProvider: 'spotify', title: 'First', artist: 'Artist', duration: 100, albumArtUrl: '', requester: { displayName: 'Streamer' } };
const playback = { currentSong: song, isPlaying: true, progressSeconds: 20, durationSeconds: 100, volume: 80, source: 'external' };
const props = { playback, voteSkip: { votes: [], requiredVotes: 2 }, onVolumeChange() {}, onPlayPause() {}, onSkip() {}, onPrevious() {}, onVoteSkip() {} };
async function setup() {
 let root: ReactTestRenderer;
 await act(() => { root = create(React.createElement(NowPlayingCard, props)); });
 return { width: () => parseFloat(root!.root.findByProps({ role: 'progressbar' }).findAllByType('div').find(node => node.props.style?.width)?.props.style.width), update: (patch: Record<string, unknown>) => act(() => root!.update(React.createElement(NowPlayingCard, { ...props, playback: { ...playback, ...patch } }))), close: () => act(() => root!.unmount()) };
}

test('Spotify progress advances between one-second ticks without waiting for polling', async t => {
 t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
 const ui = await setup();
 try {
  await act(() => t.mock.timers.tick(250));
  assert.equal(ui.width(), 20.25);
 } finally { await ui.close(); }
});

test('a new Spotify song immediately uses its own confirmed progress', async () => {
 const ui = await setup();
 try {
  await ui.update({ currentSong: { ...song, id: 'spotify-live-second', spotifyUri: 'spotify:track:second', title: 'Second' }, progressSeconds: 50 });
  assert.equal(ui.width(), 50);
 } finally { await ui.close(); }
});

test('pausing Spotify corrects interpolation to its confirmed position', async t => {
 t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
 const ui = await setup();
 try {
  await act(() => t.mock.timers.tick(1000));
  await ui.update({ isPlaying: false, progressSeconds: 20 });
  assert.equal(ui.width(), 20);
  await act(() => t.mock.timers.tick(1000));
  assert.equal(ui.width(), 20);
 } finally { await ui.close(); }
});

test('Spotify refresh starts immediately after a command and retries stale metadata', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const service: any = Object.create(SpotifyService.prototype);
 Object.assign(service, { burstTimer: null, pollTimer: null, burstGeneration: 0, lastSnapshot: { trackUri: 'spotify:track:old', progressSeconds: 10 } });
 let polls = 0;
 service.poll = async () => { polls++; return { trackUri: polls === 1 ? 'spotify:track:old' : 'spotify:track:new', progressSeconds: polls === 1 ? 10 : 0, isPlaying: true }; };
 try {
  service.triggerPollBurst('spotify:track:old');
  await act(async () => t.mock.timers.tick(1));
  assert.equal(polls, 1);
  await act(async () => t.mock.timers.tick(200));
  assert.equal(polls, 2);
  assert.equal(service.burstTimer, null);
 } finally { service.stop(); }
});



test('fractional Spotify positions display whole seconds', async () => {
 let root: ReactTestRenderer;
 try {
  await act(() => { root = create(React.createElement(NowPlayingCard, { ...props, playback: { ...playback, progressSeconds: 20.25 } })); });
  const texts = root!.root.findAllByType('span').flatMap(node => node.children.filter(child => typeof child === 'string'));
  assert.ok(texts.includes('0:20'));
  assert.ok(!texts.includes('0:20.25'));
 } finally { await act(() => root!.unmount()); }
});

test('delayed progress ticks use elapsed time and stop at the song duration', async t => {
 t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
 const ui = await setup();
 try {
  await act(() => t.mock.timers.tick(2000));
  assert.equal(ui.width(), 22);
  await ui.update({ progressSeconds: 99.9 });
  await act(() => t.mock.timers.tick(1000));
  assert.equal(ui.width(), 100);
 } finally { await ui.close(); }
});

