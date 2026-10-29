import assert from 'node:assert/strict';
import test from 'node:test';
import { createOverlaySearch, DEFAULT_OVERLAY_OPTIONS, OVERLAY_POP_ANIMATIONS, OVERLAY_POP_POSITIONS, OVERLAY_POP_STYLES, parseOverlayOptions, QUEUE_POP_PRESETS, recommendedOverlaySize } from '../src/overlayOptions.ts';

test('overlay options survive URL round-trip', () => {
  const expected = { ...DEFAULT_OVERLAY_OPTIONS, theme: 'ocean' as const, layout: 'stacked' as const, showArtwork: false, accent: '#00ffaa', scale: 125, radius: 8, freePositioning: true, showRequesterAvatar: true, showRequesterBadge: false, backgroundImageUrl: '/overlay-assets/bg.png', logoImageUrl: '/overlay-assets/logo.png', showLogo: true, logoSize: 72, customCss: '#obs-now-playing-banner{opacity:.9}', positions: { ...DEFAULT_OVERLAY_OPTIONS.positions, artwork: { x: 22, y: 44 } } };
  assert.deepEqual(parseOverlayOptions(new URLSearchParams(createOverlaySearch(expected))), expected);
});

test('invalid overlay options fall back and numeric values are clamped', () => {
  const parsed = parseOverlayOptions(new URLSearchParams('theme=script&layout=wide&accent=red&scale=900&radius=-4&showProgress=0'));
  assert.equal(parsed.theme, 'glass');
  assert.equal(parsed.layout, 'horizontal');
  assert.equal(parsed.accent, '#a855f7');
  assert.equal(parsed.scale, 160);
  assert.equal(parsed.radius, 0);
  assert.equal(parsed.showProgress, false);
});

test('card border can be disabled without changing older overlay links', () => {
  const borderless = { ...DEFAULT_OVERLAY_OPTIONS, layout: 'coverCard' as const, showBorder: false };
  assert.equal(parseOverlayOptions(new URLSearchParams(createOverlaySearch(borderless))).showBorder, false);
  assert.equal(parseOverlayOptions(new URLSearchParams('layout=coverCard')).showBorder, true);
});

test('recommended OBS dimensions follow layout and scale', () => {
  assert.deepEqual(recommendedOverlaySize('compact', 100), { width: 420, height: 110 });
  assert.deepEqual(recommendedOverlaySize('stacked', 125), { width: 450, height: 550 });
  assert.deepEqual(recommendedOverlaySize('coverCard', 100), { width: 440, height: 180 });
});


test('free positioning and branding options survive URL round-trip', () => {
  const expected = { ...DEFAULT_OVERLAY_OPTIONS, freePositioning: true, showLogo: true, logoImageUrl: '/overlay-assets/logo.png', backgroundImageUrl: '/overlay-assets/bg.webp', showRequesterAvatar: true, customCss: '.overlay-copy{font-weight:900}', positions: { ...DEFAULT_OVERLAY_OPTIONS.positions, text: { x: 61.2, y: 33.7 }, logo: { x: 90, y: 10 } } };
  assert.deepEqual(parseOverlayOptions(new URLSearchParams(createOverlaySearch(expected))), expected);
});

test('all progress styles survive URL round-trip and invalid styles fall back to bar', () => {
  const styles = ['bar', 'pill', 'waveform', 'ring', 'spark', 'equalizer', 'border'] as const;
  for (const progressStyle of styles) {
    const expected = { ...DEFAULT_OVERLAY_OPTIONS, progressStyle };
    assert.equal(parseOverlayOptions(new URLSearchParams(createOverlaySearch(expected))).progressStyle, progressStyle);
  }
  const fallback = parseOverlayOptions(new URLSearchParams('progressStyle=unknownStyle'));
  assert.equal(fallback.progressStyle, 'bar');
});

test('the queue pop settings survive the URL round-trip, are clamped, and default to on for older links', () => {
  const expected = { ...DEFAULT_OVERLAY_OPTIONS, queuePop: false, queuePopSeconds: 7 };
  assert.deepEqual(parseOverlayOptions(new URLSearchParams(createOverlaySearch(expected))), expected);
  assert.equal(DEFAULT_OVERLAY_OPTIONS.queuePop, true);
  assert.equal(parseOverlayOptions(new URLSearchParams('layout=banner')).queuePop, true);
  assert.equal(parseOverlayOptions(new URLSearchParams('layout=banner')).queuePopSeconds, DEFAULT_OVERLAY_OPTIONS.queuePopSeconds);
  assert.equal(parseOverlayOptions(new URLSearchParams('queuePopSeconds=0')).queuePopSeconds, 2);
  assert.equal(parseOverlayOptions(new URLSearchParams('queuePopSeconds=999')).queuePopSeconds, 10);
  assert.equal(parseOverlayOptions(new URLSearchParams('queuePopSeconds=abc')).queuePopSeconds, DEFAULT_OVERLAY_OPTIONS.queuePopSeconds);
});
test('numeric settings missing from an older link use their defaults instead of the minimum', () => {
  const parsed = parseOverlayOptions(new URLSearchParams('layout=banner'));
  assert.equal(parsed.scale, DEFAULT_OVERLAY_OPTIONS.scale);
  assert.equal(parsed.radius, DEFAULT_OVERLAY_OPTIONS.radius);
  assert.equal(parsed.backgroundOpacity, DEFAULT_OVERLAY_OPTIONS.backgroundOpacity);
  assert.equal(parseOverlayOptions(new URLSearchParams('scale=')).scale, DEFAULT_OVERLAY_OPTIONS.scale);
});
test('popup design settings survive the URL round-trip, fall back when invalid, and keep the original look for older links', () => {
  const expected = { ...DEFAULT_OVERLAY_OPTIONS, queuePopAnimation: 'slideUp' as const, queuePopPosition: 'bottom' as const, queuePopStyle: 'glass' as const, queuePopShowArt: false };
  assert.deepEqual(parseOverlayOptions(new URLSearchParams(createOverlaySearch(expected))), expected);
  const invalid = parseOverlayOptions(new URLSearchParams('queuePopAnimation=explode&queuePopPosition=left&queuePopStyle=rainbow'));
  assert.equal(invalid.queuePopAnimation, DEFAULT_OVERLAY_OPTIONS.queuePopAnimation);
  assert.equal(invalid.queuePopPosition, DEFAULT_OVERLAY_OPTIONS.queuePopPosition);
  assert.equal(invalid.queuePopStyle, DEFAULT_OVERLAY_OPTIONS.queuePopStyle);
  const older = parseOverlayOptions(new URLSearchParams('layout=banner'));
  assert.deepEqual([older.queuePopAnimation, older.queuePopPosition, older.queuePopStyle, older.queuePopShowArt], ['drop', 'top', 'accent', true]);
});

test('every popup preset uses valid values, has both languages, and one slides up from under the overlay', () => {
  assert.ok(QUEUE_POP_PRESETS.length >= 4);
  assert.equal(new Set(QUEUE_POP_PRESETS.map(preset => preset.id)).size, QUEUE_POP_PRESETS.length);
  for (const preset of QUEUE_POP_PRESETS) {
    assert.ok(OVERLAY_POP_ANIMATIONS.includes(preset.values.queuePopAnimation), preset.id);
    assert.ok(OVERLAY_POP_POSITIONS.includes(preset.values.queuePopPosition), preset.id);
    assert.ok(OVERLAY_POP_STYLES.includes(preset.values.queuePopStyle), preset.id);
    assert.equal(typeof preset.values.queuePopShowArt, 'boolean', preset.id);
    for (const text of [preset.name, preset.hint]) assert.ok(text.de && text.en && text.de !== text.en, preset.id);
  }
  assert.ok(QUEUE_POP_PRESETS.some(preset => preset.values.queuePopAnimation === 'slideUp' && preset.values.queuePopPosition === 'bottom'));
});