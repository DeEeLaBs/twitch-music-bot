import assert from 'node:assert/strict';
import test from 'node:test';
import { applyChromaKey } from '../src/chromaKey.ts';
import {
  formatFxVariant,
  formatGoalVariant,
  formatLabelVariant,
  formatBoardVariant,
  formatMediaVariant,
  formatTextVariant,
  fxParticleCount,
  fxParticleStyle,
  fxShouldShow,
  liveFxKind,
  parseFxVariant,
  parseGoalVariant,
  parseLabelVariant,
  parseBoardVariant,
  parseMediaVariant,
  parseTextVariant,
  withLabelDesign
} from '../src/widgetLooks.ts';

test('a saved label source still resolves to the classic card', () => {
  for (const source of ['follower', 'subscriber', 'cheerer', 'follows', 'viewers'] as const) {
    const look = parseLabelVariant(source);
    assert.equal(look.source, source);
    assert.equal(look.design, 'card');
    assert.equal(look.accent, 'violet');
    assert.equal(look.mark, 'plain');
    assert.equal(formatLabelVariant(look), source);
  }
  assert.equal(parseLabelVariant('').source, 'follower');
  assert.equal(parseLabelVariant('not-a-source').design, 'card');
});

test('a plain image address stays a picture without a key', () => {
  const look = parseMediaVariant('https://cdn.example/art.png');
  assert.equal(look.src, 'https://cdn.example/art.png');
  assert.equal(look.key, '');
  assert.equal(formatMediaVariant(look), 'https://cdn.example/art.png');
  const keyed = parseMediaVariant(formatMediaVariant({ src: '/overlay-assets/clip.mp4', key: '#00ff00', amount: 40, sound: true }));
  assert.equal(keyed.src, '/overlay-assets/clip.mp4');
  assert.equal(keyed.key, '#00ff00');
  assert.equal(keyed.amount, 40);
  assert.equal(keyed.sound, true);
});

test('overlay text keeps its words and alignment', () => {
  assert.equal(parseTextVariant('').text, 'Text');
  assert.equal(parseTextVariant('').align, 'center');
  const saved = formatTextVariant({ text: 'Starting soon', color: '#ffcc00', align: 'left', weight: 'regular', shadow: false });
  const look = parseTextVariant(saved);
  assert.equal(look.text, 'Starting soon');
  assert.equal(look.color, '#ffcc00');
  assert.equal(look.align, 'left');
  assert.equal(look.weight, 'regular');
  assert.equal(look.shadow, false);
});

test('chroma key clears the chosen color and keeps the others', () => {
  const pixels = new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255]);
  applyChromaKey(pixels, '#00ff00', 40);
  assert.equal(pixels[3], 0);
  assert.equal(pixels[7], 255);
});

test('a saved leaderboard source stays the classic list', () => {
  assert.deepEqual(parseBoardVariant('bits'), { source: 'bits', design: 'list', accent: 'violet', rows: 5 });
  assert.equal(formatBoardVariant(parseBoardVariant('requests')), 'requests');
  const bars = parseBoardVariant('bits|bars|cyan|3');
  assert.equal(bars.design, 'bars');
  assert.equal(bars.accent, 'cyan');
  assert.equal(bars.rows, 3);
  assert.equal(formatBoardVariant(bars), 'bits|bars|cyan|3');
  assert.equal(parseBoardVariant('nope|podium|rose|9').design, 'podium');
});

test('a saved goal kind stays the classic bar', () => {
  assert.deepEqual(parseGoalVariant('follower'), { kind: 'follower', design: 'bar', accent: 'violet', reveal: 'always', holdSeconds: 8 });
  assert.deepEqual(parseGoalVariant('sub'), { kind: 'sub', design: 'bar', accent: 'violet', reveal: 'always', holdSeconds: 8 });
  assert.equal(formatGoalVariant(parseGoalVariant('sub')), 'sub');
  const ring = parseGoalVariant('follower|ring|cyan');
  assert.deepEqual(ring, { kind: 'follower', design: 'ring', accent: 'cyan', reveal: 'always', holdSeconds: 8 });
  assert.equal(formatGoalVariant(ring), 'follower|ring|cyan');
  const timed = parseGoalVariant('follower|ring|violet|event|12');
  assert.equal(timed.reveal, 'event');
  assert.equal(timed.holdSeconds, 12);
  assert.equal(formatGoalVariant(timed), 'follower|ring|violet|event|12');
  assert.equal(parseGoalVariant('nope|meter|rose').kind, 'follower');
});

test('label looks round-trip and keep their data source', () => {
  const stored = 'subscriber|glass|amber|glow';
  const look = parseLabelVariant(stored);
  assert.deepEqual(look, { source: 'subscriber', design: 'glass', accent: 'amber', mark: 'glow' });
  assert.equal(formatLabelVariant(look), stored);
  const next = withLabelDesign(parseLabelVariant('viewers'), 'line');
  assert.equal(next.source, 'viewers');
  assert.equal(next.design, 'line');
  assert.equal(next.mark, 'bar');
  assert.equal(formatLabelVariant(next), 'viewers|line|violet|bar');
  const kept = withLabelDesign(parseLabelVariant('follower|card|rose|glow'), 'lower');
  assert.equal(kept.mark, 'glow');
  assert.equal(kept.accent, 'rose');
});

test('an empty effect variant is confetti and other looks round-trip', () => {
  assert.deepEqual(parseFxVariant(''), { design: 'confetti', density: 'medium', tint: 'auto', emotes: 'off' });
  assert.equal(formatFxVariant(parseFxVariant('')), '');
  assert.equal(parseFxVariant('follower').design, 'confetti');
  const embers = parseFxVariant('embers|rich|gold');
  assert.deepEqual(embers, { design: 'embers', density: 'rich', tint: 'gold', emotes: 'off' });
  assert.equal(formatFxVariant(embers), 'embers|rich|gold');
  assert.equal(parseFxVariant('rings').density, 'medium');
  const parade = parseFxVariant('aurora|sparse|ice|parade');
  assert.deepEqual(parade, { design: 'aurora', density: 'sparse', tint: 'ice', emotes: 'parade' });
  assert.equal(formatFxVariant(parade), 'aurora|sparse|ice|parade');
  assert.equal(formatFxVariant({ design: 'confetti', density: 'medium', tint: 'auto', emotes: 'rain' }), 'confetti|medium|auto|rain');
  assert.equal(fxParticleCount({ design: 'fireworks', density: 'medium', tint: 'auto', emotes: 'off' }), 14);
});

test('effects show for raid, cheer, and gift, and for an editor preview', () => {
  assert.equal(liveFxKind('raid'), 'raid');
  assert.equal(liveFxKind('subscription'), null);
  assert.equal(fxShouldShow({ alertKind: 'cheer' }), true);
  assert.equal(fxShouldShow({ alertKind: 'gift' }), true);
  assert.equal(fxShouldShow({ alertKind: 'follow' }), false);
  assert.equal(fxShouldShow({ alertKind: 'subscription', preview: true }), true);
  assert.equal(fxShouldShow({ alertKind: null, selected: true }), true);
});

test('particle counts follow density and rings stay centered', () => {
  const sparse = fxParticleCount({ design: 'confetti', density: 'sparse', tint: 'auto', emotes: 'off' });
  const rich = fxParticleCount({ design: 'confetti', density: 'rich', tint: 'auto', emotes: 'off' });
  assert.ok(sparse < rich);
  assert.equal(fxParticleCount({ design: 'rings', density: 'medium', tint: 'auto', emotes: 'off' }), 5);
  assert.equal(fxParticleStyle('rings', 0).left, '50%');
  assert.equal(fxParticleStyle('rings', 0).top, '50%');
  assert.match(fxParticleStyle('streaks', 2).top || '', /%$/);
});
