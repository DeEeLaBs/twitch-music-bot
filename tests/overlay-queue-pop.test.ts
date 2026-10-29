import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePop, EMPTY_POP, enqueuePop, popFromDelta, popText, type QueuePopItem } from '../src/overlayQueuePop.ts';
import type { QueueDelta, Track } from '../src/types.ts';
import fs from 'node:fs';
import { OVERLAY_POP_ANIMATIONS, OVERLAY_POP_POSITIONS, OVERLAY_POP_STYLES } from '../src/overlayOptions.ts';

const track = (id: string, patch: Partial<Track> = {}, requester: Partial<Track['requester']> = {}): Track => ({
  id, title: `Song ${id}`, artist: 'Artist', albumArtUrl: `/art/${id}.jpg`, duration: 200, url: `https://example.test/${id}`, requestedAt: 1,
  requester: { username: 'viewer1', displayName: 'Viewer One', badge: 'viewer', ...requester }, ...patch
});
const added = (t: Track, index = 0): QueueDelta => ({ op: 'add', track: t, index });
const item = (key: string): Extract<QueuePopItem, { kind: 'track' }> => ({ kind: 'track', key, title: key, artist: 'A', art: '', user: 'u', position: 1 });

test('a single added viewer request becomes a pop with its queue position (1-based)', () => {
  assert.deepEqual(popFromDelta(added(track('a'), 2)), { kind: 'track', key: 'a', title: 'Song a', artist: 'Artist', art: '/art/a.jpg', user: 'Viewer One', position: 3 });
});

test('removals, moves and bulk replacements never pop', () => {
  assert.equal(popFromDelta({ op: 'remove', trackId: 'a' }), null);
  assert.equal(popFromDelta({ op: 'move', trackId: 'a', newIndex: 1 }), null);
  assert.equal(popFromDelta({ op: 'replace', queue: [track('a'), track('b')] }), null);
});

test('autoplay radio tracks do not pop, however the radio requester is named', () => {
  assert.equal(popFromDelta(added(track('r1', {}, { username: 'radio', displayName: 'Autoplay Radio' }))), null);
  assert.equal(popFromDelta(added(track('r2', {}, { username: 'YouTube Music Radio', displayName: 'whatever' }))), null);
});

test('a missing cover or requester name does not break the pop', () => {
  const bare = track('x', { albumArtUrl: undefined as unknown as string }, { displayName: '' , username: 'someone' });
  assert.deepEqual(popFromDelta(added(bare)), { kind: 'track', key: 'x', title: 'Song x', artist: 'Artist', art: '', user: 'someone', position: 1 });
});

test('the first pop shows at once, later ones wait their turn in order', () => {
  let state = enqueuePop(EMPTY_POP, item('a'));
  assert.equal(state.current?.key, 'a');
  state = enqueuePop(state, item('b'));
  assert.deepEqual(state.pending.map(p => p.key), ['b']);
  state = advancePop(state);
  assert.equal(state.current?.key, 'b');
  state = advancePop(state);
  assert.deepEqual(state, EMPTY_POP);
  assert.deepEqual(advancePop(EMPTY_POP), EMPTY_POP, 'advancing nothing is harmless');
});

test('a burst collapses into one "+N more" pop instead of a long parade', () => {
  let state = enqueuePop(EMPTY_POP, item('a'));
  for (const key of ['b', 'c']) state = enqueuePop(state, item(key));
  assert.deepEqual(state.pending.map(p => p.key), ['b', 'c'], 'two waiting pops are still shown individually');
  state = enqueuePop(state, item('d'));
  assert.deepEqual(state.pending.map(p => ({ kind: p.kind, count: p.kind === 'more' ? p.count : 1 })), [{ kind: 'more', count: 3 }]);
  state = enqueuePop(state, item('e'));
  assert.deepEqual(state.pending.map(p => p.kind === 'more' ? p.count : 1), [3, 1]);
  state = enqueuePop(state, item('f'));
  assert.deepEqual(state.pending.map(p => p.kind === 'more' ? p.count : 1), [5], 'counts keep adding up');
  assert.equal(state.current?.key, 'a', 'the pop on screen is never interrupted');
});

test('pops are worded in German and English', () => {
  const song = item('a');
  assert.deepEqual(popText({ ...song, title: 'Hello', artist: 'Adele', user: 'Max', position: 3 }, 'en'), { kicker: 'Added to the queue', title: 'Hello', subtitle: 'Adele · @Max · #3' });
  assert.deepEqual(popText({ ...song, title: 'Hallo', artist: 'Adele', user: 'Max', position: 1 }, 'de'), { kicker: 'Neu in der Warteschlange', title: 'Hallo', subtitle: 'Adele · @Max · #1' });
  assert.deepEqual(popText({ kind: 'more', key: 'm', count: 4 }, 'en'), { kicker: 'Added to the queue', title: '+4 more songs', subtitle: '' });
  assert.deepEqual(popText({ kind: 'more', key: 'm', count: 4 }, 'de'), { kicker: 'Neu in der Warteschlange', title: '+4 weitere Songs', subtitle: '' });
});

test('every popup animation, position and look has its CSS, including an entrance and an exit', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  for (const animation of OVERLAY_POP_ANIMATIONS) {
    assert.match(css, new RegExp(`\\.pop-anim-${animation}\\s*\\{`), `rule for ${animation}`);
    const name = animation[0].toUpperCase() + animation.slice(1);
    assert.match(css, new RegExp(`@keyframes pop${name}In\\b`), `entrance for ${animation}`);
    assert.match(css, new RegExp(`@keyframes pop${name}Out\\b`), `exit for ${animation}`);
  }
  for (const position of OVERLAY_POP_POSITIONS) assert.match(css, new RegExp(`\\.pop-pos-${position}\\s*\\{`), position);
  for (const style of OVERLAY_POP_STYLES) assert.match(css, new RegExp(`\\.pop-style-${style}\\s*\\{`), style);
});