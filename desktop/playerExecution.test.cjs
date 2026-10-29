const test = require('node:test');
const assert = require('node:assert/strict');
const { withDeadline, youtubePlaybackTarget } = require('./playerExecution.cjs');

test('a stuck player request times out and later requests can finish', async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 5), { code: 'PLAYER_TIMEOUT' });
  assert.equal(await withDeadline(Promise.resolve('ready')), 'ready');
});

test('radio requests navigate with a playlist so autoplay and Next have a queue', () => {
  const radio = youtubePlaybackTarget('abcdefghijk', true);
  assert.equal(radio.url, 'https://music.youtube.com/watch?v=abcdefghijk&list=RDAMVMabcdefghijk');
  assert.equal(radio.useInPagePlayer, false);
  const plain = youtubePlaybackTarget('abcdefghijk', false);
  assert.equal(plain.url, 'https://music.youtube.com/watch?v=abcdefghijk');
  assert.equal(plain.useInPagePlayer, true);
  assert.throws(() => youtubePlaybackTarget('bad', true), /invalid_video_id/);
});
