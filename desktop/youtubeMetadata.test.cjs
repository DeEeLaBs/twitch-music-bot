const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('actual injected timeline script keeps zero at a track change despite stale DOM time', () => {
  const source = fs.readFileSync(require.resolve('./main.cjs'), 'utf8');
  const script = source.split('const timelinePromise = ytmWc.executeJavaScript(String.raw`')[1]?.split('`).catch(() => null);')[0];
  assert.ok(script, 'test must execute the production timeline reader');
  const player = {
    getPlayerResponse: () => ({ videoDetails: { lengthSeconds: '200' } }),
    getCurrentTime: () => 0, getDuration: () => 200,
    getVolume: () => 50, getPlayerState: () => 1
  };
  const document = {
    getElementById: () => player,
    querySelector: selector => selector.includes('time-info') ? { textContent: '2:45 / 3:20' } : null
  };
  const state = vm.runInNewContext(script, { document, window: {}, navigator: { mediaSession: { metadata: { title: 'New track', artwork: [{ src: 'https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg' }] } } } });
  assert.equal(state.progress, 0);
  assert.equal(state.duration, 200);
  assert.equal(state.id, 'abcdefghijk');
});
const { isUsableVideoId, mergePlaybackTimeline, playbackIdsFromUrl, playbackStateFromTimeline, playbackStateFromUrl, timelineBelongsToState, titleFromDocument } = require('./youtubeMetadata.cjs');

test('current YouTube Music document titles provide a metadata fallback', () => {
  assert.equal(titleFromDocument('Loser | YouTube Music'), 'Loser');
  assert.equal(titleFromDocument('Song – YouTube Music'), 'Song');
  assert.equal(titleFromDocument('YouTube Music'), '');
  assert.equal(titleFromDocument(''), '');
});

test('only canonical YouTube video ids are accepted', () => {
  assert.equal(isUsableVideoId('MX7FSAnRPug'), true);
  assert.equal(isUsableVideoId('too-short'), false);
  assert.equal(isUsableVideoId('https://example.com'), false);
});

test('player URL preserves both the actual video and original radio request id', () => {
  assert.deepEqual(
    playbackIdsFromUrl('https://music.youtube.com/watch?v=BSTsnWoslP4&list=RDAMVMfJ9rUzIMcZQ'),
    { videoId: 'BSTsnWoslP4', requestedId: 'fJ9rUzIMcZQ' }
  );
  assert.equal(playbackIdsFromUrl('https://evil.example/watch?v=fJ9rUzIMcZQ'), null);
  assert.equal(playbackIdsFromUrl('https://music.youtube.com/watch?v=invalid'), null);
});

test('URL fallback returns an idle-safe state only for an active watch URL', () => {
  const state = playbackStateFromUrl('https://music.youtube.com/watch?v=BSTsnWoslP4&list=RDAMVMfJ9rUzIMcZQ', 'Bohemian Rhapsody | YouTube Music');
  assert.equal(state.player.hasSong, true);
  assert.equal(state.video.id, 'BSTsnWoslP4');
  assert.equal(state.video.requestedId, 'fJ9rUzIMcZQ');
  assert.equal(state.video.title, 'Bohemian Rhapsody');
  assert.equal(playbackStateFromUrl('https://music.youtube.com/'), null);
});

test('timeline data enriches the URL fallback without replacing its identity', () => {
  const base = playbackStateFromUrl('https://music.youtube.com/watch?v=i5_asj1BGFs', 'Sweet Dreams | YouTube Music');
  const merged = mergePlaybackTimeline(base, { progress: 42.4, duration: 213.8, volume: 37.6, isPaused: false });
  assert.equal(merged.video.id, 'i5_asj1BGFs');
  assert.equal(merged.player.videoProgress, 42);
  assert.equal(merged.player.durationSeconds, 214);
  assert.equal(merged.video.durationSeconds, 214);
  assert.equal(merged.player.volume, 38);
  assert.equal(merged.player.trackState, 1);
});

test('a stale document title on the home page does not create phantom playback', () => {
  const base = playbackStateFromUrl('https://music.youtube.com/', 'T.N.T. | YouTube Music');
  assert.equal(base, null);
  assert.equal(playbackStateFromTimeline({ title: 'T.N.T.', progress: 0, duration: 0 }), null);
  const merged = mergePlaybackTimeline(base, { progress: 18, duration: 215, isPaused: false, title: 'T.N.T.', author: 'AC/DC', cover: 'https://example.test/art.jpg' });
  assert.equal(merged.player.hasSong, true);
  assert.equal(merged.video.id, '');
  assert.equal(merged.video.title, 'T.N.T.');
  assert.equal(merged.video.author, 'AC/DC');
  assert.equal(merged.video.cover, 'https://example.test/art.jpg');
  assert.equal(merged.player.videoProgress, 18);
  assert.equal(playbackStateFromUrl('https://music.youtube.com/', 'YouTube Music'), null);
});

test('Media Session alone can restore playback while the page DOM is rebuilding', () => {
  const state = mergePlaybackTimeline(null, { title: 'Thunderstruck', author: 'AC/DC', progress: 12, duration: 292, isPaused: false });
  assert.equal(state.video.title, 'Thunderstruck');
  assert.equal(state.video.author, 'AC/DC');
  assert.equal(state.player.videoProgress, 12);
  assert.equal(state.player.durationSeconds, 292);
  assert.equal(playbackStateFromTimeline({ progress: 10 }), null);
});

test('timeline values are sanitized and progress cannot exceed duration', () => {
  const base = playbackStateFromUrl('https://music.youtube.com/watch?v=i5_asj1BGFs', 'Sweet Dreams | YouTube Music');
  const merged = mergePlaybackTimeline(base, { progress: 999, duration: 200, volume: 500, isPaused: true });
  assert.equal(merged.player.videoProgress, 200);
  assert.equal(merged.player.volume, 100);
  assert.equal(merged.player.trackState, 2);
});

test('a previous tracks timeline is never merged into a newly detected song', () => {
  const next = playbackStateFromUrl('https://music.youtube.com/watch?v=abcdefghijk', 'New Song | YouTube Music');
  const merged = mergePlaybackTimeline(next, {
    id: 'lmnopqrstuv', title: 'Previous Song', author: 'Previous Artist',
    progress: 198, duration: 201, isPaused: false
  });
  assert.equal(timelineBelongsToState(next, { id: 'lmnopqrstuv', title: 'Previous Song' }), false);
  assert.equal(merged.video.id, 'abcdefghijk');
  assert.equal(merged.video.title, 'New Song');
  assert.equal(merged.player.videoProgress, 0);
  assert.equal(merged.player.durationSeconds, 0);
});

test('same-title timeline data remains usable when YouTube temporarily omits the id', () => {
  const next = playbackStateFromUrl('https://music.youtube.com/watch?v=abcdefghijk', 'New Song | YouTube Music');
  const merged = mergePlaybackTimeline(next, { title: 'New Song', progress: 3, duration: 180, isPaused: false });
  assert.equal(merged.player.videoProgress, 3);
  assert.equal(merged.player.durationSeconds, 180);
});

test('timeline duration inflation is rejected when an established canonical duration exists for the same track', () => {
  const base = playbackStateFromUrl('https://music.youtube.com/watch?v=abcdefghijk', 'Dragon Attack | YouTube Music');
  base.player.duration = 259;
  base.player.durationSeconds = 259;
  if (base.video) {
    base.video.duration = 259;
    base.video.durationSeconds = 259;
  }
  const merged = mergePlaybackTimeline(base, { id: 'abcdefghijk', title: 'Dragon Attack', progress: 258, duration: 389, isPaused: false });
  assert.equal(merged.player.videoProgress, 258);
  assert.equal(merged.player.duration, 259);
  assert.equal(merged.player.durationSeconds, 259);
  assert.equal(merged.video.duration, 259);
  assert.equal(merged.video.durationSeconds, 259);
});
