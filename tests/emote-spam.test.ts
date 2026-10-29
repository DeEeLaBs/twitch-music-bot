import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyEmoteSpam, playingEmoteUrl, pushEmoteLine, safeEmoteUrl } from '../src/emoteSpam.ts';
import { sampleChatLine } from '../src/overlayChat.ts';

const KAPPA = 'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/1.0';

function line(id: string, text: string, start: number, end: number) {
  return sampleChatLine({ id, text, emotes: [{ id: '25', start, end }] });
}

test('four of the same emote inside the window become one burst', () => {
  let clock = emptyEmoteSpam();
  let burst = null;
  for (let index = 0; index < 4; index += 1) {
    const next = pushEmoteLine(clock, line(`m${index}`, 'Kappa', 0, 4), {}, 1_000 + index * 200);
    clock = next.clock;
    burst = next.burst;
  }
  assert.equal(burst?.name, 'Kappa');
  assert.equal(burst?.url, KAPPA);
  const held = pushEmoteLine(clock, line('m4', 'Kappa', 0, 4), {}, 1_900);
  assert.equal(held.burst, null);
});

test('one message with four copies counts, and a different emote does not', () => {
  const text = 'Kappa Kappa Kappa Kappa';
  const emotes = [
    { id: '25', start: 0, end: 4 },
    { id: '25', start: 6, end: 10 },
    { id: '25', start: 12, end: 16 },
    { id: '25', start: 18, end: 22 }
  ];
  const once = pushEmoteLine(emptyEmoteSpam(), sampleChatLine({ id: 'pack', text, emotes }), {}, 5_000);
  assert.equal(once.burst?.url, KAPPA);
  let clock = emptyEmoteSpam();
  for (let index = 0; index < 3; index += 1) {
    clock = pushEmoteLine(clock, line(`a${index}`, 'Kappa', 0, 4), {}, 8_000 + index).clock;
  }
  const other = pushEmoteLine(clock, sampleChatLine({
    id: 'other',
    text: 'LUL',
    emotes: [{ id: '425618', start: 0, end: 2 }]
  }), {}, 8_400);
  assert.equal(other.burst, null);
});

test('emote urls stay on the known image hosts', () => {
  assert.equal(safeEmoteUrl(KAPPA), KAPPA);
  assert.equal(safeEmoteUrl('https://cdn.7tv.app/emote/abc/1x.webp').includes('cdn.7tv.app'), true);
  assert.equal(safeEmoteUrl('https://cdn.betterttv.net/emote/abc/1x'), 'https://cdn.betterttv.net/emote/abc/1x');
  assert.equal(safeEmoteUrl('https://cdn.frankerfacez.com/emote/1/animated/1').includes('frankerfacez.com'), true);
  assert.equal(safeEmoteUrl('https://example.com/emote.png'), '');
  assert.equal(safeEmoteUrl('http://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/1.0'), '');
});

test('a twitch still becomes the animated rendition and a gif is left alone', () => {
  assert.equal(playingEmoteUrl(KAPPA), 'https://static-cdn.jtvnw.net/emoticons/v2/25/animated/dark/3.0');
  assert.equal(playingEmoteUrl('https://cdn.7tv.app/emote/abc/2x.gif'), 'https://cdn.7tv.app/emote/abc/2x.gif');
  assert.equal(playingEmoteUrl('https://example.com/nope.gif'), '');
});
