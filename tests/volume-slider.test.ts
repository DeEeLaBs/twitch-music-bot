import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { build } from 'esbuild';
import { writeFileSync, unlinkSync } from 'node:fs';

const bundle = new URL('../volume-card-fixture.mjs', import.meta.url);
const output = await build({ entryPoints: ['src/components/NowPlayingCard.tsx'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
writeFileSync(bundle, output.outputFiles[0].text);
const { NowPlayingCard } = await import(bundle.href);
if (!process.env.VOLUME_COVERAGE) unlinkSync(bundle);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = globalThis;
const pause = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const playback = { currentSong: { id: 'song', title: 'Song', artist: 'Artist', duration: 120, albumArtUrl: '', requester: { displayName: 'Streamer' } }, isPlaying: false, progressSeconds: 0, durationSeconds: 120, volume: 80, source: 'queue' };
async function setup(send: (volume: number) => void | Promise<void>) {
  let root: ReactTestRenderer;
  const props = { playback, voteSkip: { votes: [], requiredVotes: 2 }, onVolumeChange: send, onPlayPause() {}, onSkip() {}, onPrevious() {}, onVoteSkip() {} };
  await act(() => { root = create(React.createElement(NowPlayingCard, props)); });
  const slider = () => root!.root.findByProps({ 'aria-label': 'Lautstärke' });
  return { slider, change: (value: number) => act(() => slider().props.onChange({ target: { value: String(value) } })), update: (volume: number) => act(() => root!.update(React.createElement(NowPlayingCard, { ...props, playback: { ...playback, volume } }))), close: () => act(() => root!.unmount()) };
}

test('slider keeps the latest user value when stale player updates arrive', async () => {
  const sent: number[] = [];
  const ui = await setup(v => { sent.push(v); });
  try {
    await ui.change(40);
    await ui.update(75);
    assert.equal(ui.slider().props.value, 40);
    await ui.change(0);
    await pause(190);
    assert.deepEqual(sent, [0]);
    await ui.update(40);
    assert.equal(ui.slider().props.value, 0);
    await ui.update(0);
    await pause(1600);
    await ui.update(25);
    assert.equal(ui.slider().props.value, 25);
  } finally { await ui.close(); }
});

test('volume requests are serialized and intermediate values coalesced', async () => {
  const sent: number[] = [];
  let finish!: () => void;
  const ui = await setup(v => { sent.push(v); return new Promise<void>(resolve => { finish = resolve; }); });
  try {
    await ui.change(40);
    await pause(190);
    await ui.change(60);
    await ui.change(20);
    await pause(190);
    assert.deepEqual(sent, [40]);
    await act(async () => finish());
    assert.deepEqual(sent, [40, 20]);
    await act(async () => finish());
  } finally { await ui.close(); }
});

test('unmount cancels an unsent volume change', async () => {
  const sent: number[] = [];
  const ui = await setup(v => { sent.push(v); });
  await ui.change(30);
  await ui.close();
  await pause(190);
  assert.deepEqual(sent, []);
});

test('a failed request reconciles with the player and permits later changes', async () => {
  const sent: number[] = [];
  const ui = await setup(async v => { sent.push(v); if (v === 30) throw new Error('Player unavailable'); });
  try {
    await ui.change(30);
    await pause(190);
    await ui.update(70);
    assert.equal(ui.slider().props.value, 30);
    await pause(1600);
    assert.equal(ui.slider().props.value, 70);
    await ui.change(100);
    await pause(190);
    assert.deepEqual(sent, [30, 100]);
  } finally { await ui.close(); }
});

test('unmount discards a queued change while an earlier request completes', async () => {
  const sent: number[] = [];
  let finish!: () => void;
  const ui = await setup(v => { sent.push(v); return new Promise<void>(resolve => { finish = resolve; }); });
  await ui.change(40);
  await pause(190);
  await ui.change(90);
  await pause(190);
  await ui.close();
  await act(async () => finish());
  assert.deepEqual(sent, [40]);
});


