import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/core/commands.ts';
import { dialFeedback, escapeXml, renderKey, svgToDataUri, wrapText } from '../src/core/render.ts';
import { EMPTY_STATE, type BotState } from '../src/core/state.ts';

const playing: BotState = {
  playback: { currentSong: { id: 's', title: 'Bohemian Rhapsody & <Friends>', artist: 'Queen', requester: { username: 'viewer' } }, isPlaying: true, volume: 42 },
  queue: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
  config: { songRequestsOpen: false, autoPlayRadio: true, channelPointsEnabled: true, channelPointsRewardId: 'r' }
};

test('every action renders well-formed SVG online and offline', () => {
  for (const action of ACTIONS) {
    for (const online of [true, false]) {
      for (const state of [EMPTY_STATE, playing]) {
        const svg = renderKey(action.id, state, { online });
        assert.match(svg, /^<svg [^>]*width="144" height="144"/, action.id);
        assert.ok(svg.endsWith('</svg>'), action.id);
        // Balanced tags: every opening <g>/<text> has a closing one.
        assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length, `${action.id} <g>`);
        assert.equal((svg.match(/<text[ >]/g) || []).length, (svg.match(/<\/text>/g) || []).length, `${action.id} <text>`);
      }
    }
  }
});

test('text from tracks is escaped so a hostile title cannot break out of the SVG', () => {
  const svg = renderKey('now-playing', playing, { online: true });
  assert.ok(svg.includes('&amp;'));
  assert.ok(!svg.includes('<Friends>'));
  const evil: BotState = { ...playing, playback: { ...playing.playback, currentSong: { id: 'x', title: '</text><script>alert(1)</script>', artist: '"><image href="http://evil"/>' } } };
  const svgEvil = renderKey('now-playing', evil, { online: true });
  assert.ok(!svgEvil.includes('<script>'));
  assert.ok(!svgEvil.includes('<image'), 'an injected tag must not become an element');
  assert.ok(svgEvil.includes('&lt;/text&gt;'));
  assert.equal(escapeXml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
});

test('the play/pause key follows the player state', () => {
  const pause = renderKey('play-pause', playing, { online: true });
  const play = renderKey('play-pause', EMPTY_STATE, { online: true });
  assert.match(pause, /Pause/);
  assert.match(play, /Play/);
  assert.notEqual(pause, play);
});

test('switch keys show their state in words as well as colour', () => {
  assert.match(renderKey('toggle-requests', playing, { online: true }), /CLOSED/);
  assert.match(renderKey('toggle-requests', EMPTY_STATE, { online: true }), /OPEN/);
  assert.match(renderKey('toggle-autoplay', playing, { online: true }), />ON</);
  assert.match(renderKey('toggle-channelpoints', EMPTY_STATE, { online: true }), />OFF</);
});

test('the queue key shows the length with correct wording', () => {
  assert.match(renderKey('queue-count', playing, { online: true }), />2</);
  assert.match(renderKey('queue-count', playing, { online: true }), /songs queued/);
  assert.match(renderKey('queue-count', { ...playing, queue: [playing.queue[0]] }, { online: true }), /song queued/);
});

test('destructive keys warn after the first press', () => {
  const calm = renderKey('clear-queue', playing, { online: true });
  const armed = renderKey('clear-queue', playing, { online: true, armed: true });
  assert.match(calm, /Clear \(2\)/);
  assert.match(armed, /Press again/);
  assert.match(renderKey('block-requester', playing, { online: true, armed: true }), /Press again/);
});

test('keys say "Bot offline" instead of pretending to work', () => {
  assert.match(renderKey('next', playing, { online: false }), /Bot offline/);
  assert.match(renderKey('now-playing', playing, { online: false }), /Bot offline/);
  assert.match(renderKey('now-playing', EMPTY_STATE, { online: false }), /Bot offline/);
});

test('album art is embedded only when provided', () => {
  const art = 'data:image/jpeg;base64,AAAA';
  assert.ok(renderKey('now-playing', playing, { online: true, art }).includes(`href="${art}"`));
  assert.ok(!renderKey('now-playing', playing, { online: true, art: null }).includes('<image'));
});

test('wrapText wraps, breaks long words and ellipsizes', () => {
  assert.deepEqual(wrapText('Hello big world', 9, 3), ['Hello big', 'world']);
  assert.deepEqual(wrapText('Supercalifragilistic', 8, 3), ['Supercal', 'ifragili', 'stic']);
  assert.deepEqual(wrapText('one two three four five six', 7, 2), ['one two', 'three…']);
  assert.deepEqual(wrapText('   ', 5, 2), []);
});

test('data URIs round-trip and dial feedback reflects the volume', () => {
  const svg = renderKey('next', playing, { online: true });
  assert.equal(decodeURIComponent(svgToDataUri(svg).split(',')[1]), svg);
  assert.deepEqual(dialFeedback(playing, true), { title: 'Volume', value: '42%', indicator: 42 });
  assert.deepEqual(dialFeedback(playing, false), { title: 'Bot offline', value: '–', indicator: 0 });
});

test('a flashing key is tinted green on top of any key, including the album art key', () => {
  for (const id of ['play-pause', 'toggle-requests', 'clear-queue', 'now-playing']) {
    const plain = renderKey(id, EMPTY_STATE, { online: true });
    const flashing = renderKey(id, EMPTY_STATE, { online: true, flash: true });
    assert.doesNotMatch(plain, /id="flash"/, id);
    assert.match(flashing, /id="flash"/, id);
    assert.ok(flashing.endsWith('</svg>'), id);
    assert.equal((flashing.match(/<svg/g) ?? []).length, 1, id);
  }
});