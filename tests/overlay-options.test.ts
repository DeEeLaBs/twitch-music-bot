import assert from 'node:assert/strict';
import test from 'node:test';
import { createOverlaySearch, DEFAULT_OVERLAY_OPTIONS, parseOverlayOptions, recommendedOverlaySize } from '../src/overlayOptions.ts';

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
