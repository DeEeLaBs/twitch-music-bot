import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackIdentity } from '../src/playbackIdentity.ts';
import type { Track } from '../src/types.ts';

test('real provider track changes reset identity even when queue request id stays the same', () => {
  const track = { id: 'request-1', videoId: 'abcdefghijk', title: 'Song', artist: 'Artist' } as Track;
  assert.notEqual(playbackIdentity(track), playbackIdentity({ ...track, playbackId: 'lmnopqrstuv' }));
  assert.notEqual(playbackIdentity(track), playbackIdentity({ ...track, videoId: 'lmnopqrstuv' }));
  assert.equal(playbackIdentity(track), playbackIdentity({ ...track, duration: 200 }));
  assert.notEqual(playbackIdentity({ ...track, videoId: undefined }), playbackIdentity({ ...track, videoId: undefined, title: 'Next' }));
});
