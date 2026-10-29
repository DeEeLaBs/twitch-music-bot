import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMessage, EMPTY_STATE, type BotState, type BotTrack , withVolume } from '../src/core/state.ts';

const track = (id: string, title = id): BotTrack => ({ id, title, artist: 'Artist' });
const full = (overrides: Partial<BotState> = {}) => ({
  type: 'state',
  data: { playback: { currentSong: null, isPlaying: true, volume: 40 }, queue: [track('a'), track('b')], config: { songRequestsOpen: true }, logs: ['ignored'], ...overrides }
});

test('a full state message replaces everything and drops data the plugin does not need', () => {
  const state = applyMessage(EMPTY_STATE, full());
  assert.equal(state.playback.volume, 40);
  assert.deepEqual(state.queue.map(t => t.id), ['a', 'b']);
  assert.equal('logs' in state, false);
});

test('a patch merges playback fields and replaces only the slices it contains', () => {
  const start = applyMessage(EMPTY_STATE, full());
  const next = applyMessage(start, { type: 'patch', data: { playback: { volume: 10 } } });
  assert.equal(next.playback.volume, 10);
  assert.equal(next.playback.isPlaying, true, 'untouched playback fields survive');
  assert.equal(next.queue, start.queue, 'untouched slices keep their identity');
  assert.equal(next.config, start.config);
});

test('queue deltas add, move, remove and replace', () => {
  let state = applyMessage(EMPTY_STATE, full());
  state = applyMessage(state, { type: 'queue_delta', data: { op: 'add', track: track('c'), index: 1 } });
  assert.deepEqual(state.queue.map(t => t.id), ['a', 'c', 'b']);
  state = applyMessage(state, { type: 'queue_delta', data: { op: 'move', trackId: 'b', newIndex: 0 } });
  assert.deepEqual(state.queue.map(t => t.id), ['b', 'a', 'c']);
  state = applyMessage(state, { type: 'queue_delta', data: { op: 'remove', trackId: 'a' } });
  assert.deepEqual(state.queue.map(t => t.id), ['b', 'c']);
  state = applyMessage(state, { type: 'queue_delta', data: { op: 'replace', queue: [track('z')] } });
  assert.deepEqual(state.queue.map(t => t.id), ['z']);
});

test('adding a track that is already queued does not duplicate it', () => {
  const state = applyMessage(applyMessage(EMPTY_STATE, full()), { type: 'queue_delta', data: { op: 'add', track: track('a'), index: 5 } });
  assert.deepEqual(state.queue.map(t => t.id), ['b', 'a']);
});

test('unknown, malformed or irrelevant messages leave the state untouched', () => {
  const start = applyMessage(EMPTY_STATE, full());
  for (const message of [null, 'text', 42, [], {}, { type: 'log', data: {} }, { type: 'state', data: 'x' }, { type: 'patch', data: null }, { type: 'queue_delta', data: null }, { type: 'queue_delta', data: { op: 'nonsense' } }]) {
    assert.equal(applyMessage(start, message), start);
  }
});

test('withVolume overrides only the volume and keeps identity when nothing changes', () => {
  const state = { ...EMPTY_STATE, playback: { ...EMPTY_STATE.playback, volume: 40 } };
  assert.equal(withVolume(state, null), state);
  assert.equal(withVolume(state, 40), state);
  const shown = withVolume(state, 55);
  assert.equal(shown.playback.volume, 55);
  assert.equal(state.playback.volume, 40, 'the original is untouched');
  assert.equal(shown.queue, state.queue);
});