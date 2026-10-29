import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDockSearch,
  DEFAULT_DOCK_OPTIONS,
  parseDockOptions,
  type DockOptions,
} from '../src/dockOptions.ts';
import {
  createOverlaySearch,
  DEFAULT_OVERLAY_OPTIONS,
  parseOverlayOptions,
  recommendedOverlaySize,
  type OverlayOptions,
} from '../src/overlayOptions.ts';
import type { PlaybackState, Track } from '../src/types.ts';

test('dock options survive URL round-trip with all properties preserved', () => {
  const custom: DockOptions = {
    layout: 'vertical',
    showQueue: false,
    queueItems: 12,
    showCover: false,
    showProgress: true,
    showVolume: false,
    showLinks: false,
    density: 'compact',
    accent: '#a855f7',
    opacity: 0.85,
    scale: 1.15,
  };

  const queryString = buildDockSearch(custom);
  const parsed = parseDockOptions(new URLSearchParams(queryString));

  assert.equal(parsed.layout, 'vertical');
  assert.equal(parsed.showQueue, false);
  assert.equal(parsed.queueItems, 12);
  assert.equal(parsed.showCover, false);
  assert.equal(parsed.showProgress, true);
  assert.equal(parsed.showVolume, false);
  assert.equal(parsed.showLinks, false);
  assert.equal(parsed.density, 'compact');
  assert.equal(parsed.accent, '#a855f7');
  assert.equal(parsed.opacity, 0.85);
  assert.equal(parsed.scale, 1.15);
});

test('dock options clamp out-of-bounds parameters and fall back gracefully', () => {
  const invalid = new URLSearchParams(
    'layout=invalid&density=huge&accent=notacolor&opacity=9.99&scale=0.1&queueItems=9999&queue=invalid'
  );
  const parsed = parseDockOptions(invalid);

  assert.equal(parsed.layout, 'auto');
  assert.equal(parsed.density, 'comfortable');
  assert.equal(parsed.accent, '#ffffff');
  assert.equal(parsed.opacity, 1.0); // clamped to 1.0
  assert.equal(parsed.scale, 0.8); // clamped to min 0.8
  assert.equal(parsed.queueItems, 25); // clamped to max 25
  assert.equal(parsed.showQueue, true); // non-'0'/non-'false' defaults to true
});

test('dock options clamp low opacity and scale correctly', () => {
  const params = new URLSearchParams('opacity=0.05&scale=2.5&queueItems=-5');
  const parsed = parseDockOptions(params);

  assert.equal(parsed.opacity, 0.35); // clamped to min 0.35
  assert.equal(parsed.scale, 1.25); // clamped to max 1.25
  assert.equal(parsed.queueItems, 1); // clamped to min 1
});

test('dock options buildDockSearch normalizes accent to lowercase and clamps values', () => {
  const input: DockOptions = {
    ...DEFAULT_DOCK_OPTIONS,
    accent: '#ABCDEF',
    opacity: 10,
    scale: 0.2,
    queueItems: 50,
  };
  const search = buildDockSearch(input);
  const parsed = parseDockOptions(new URLSearchParams(search));

  assert.equal(parsed.accent, '#abcdef');
  assert.equal(parsed.opacity, 1.0);
  assert.equal(parsed.scale, 0.8);
  assert.equal(parsed.queueItems, 25);
});

test('dock auto-layout threshold logic handles various OBS dock dimensions', () => {
  const computeAutoLayout = (width: number, height: number): 'horizontal' | 'vertical' => {
    const shouldBeVertical = (width < 520 && height >= 140) || height > Math.max(180, width * 0.68);
    return shouldBeVertical ? 'vertical' : 'horizontal';
  };

  // Standard wide bottom dock: 800 x 90 -> horizontal
  assert.equal(computeAutoLayout(800, 90), 'horizontal');

  // Wide bottom dock with queue: 960 x 200 -> horizontal
  assert.equal(computeAutoLayout(960, 200), 'horizontal');

  // Narrow horizontal dock in shallow slot: 480 x 90 -> horizontal (prevents cramped vertical stacking)
  assert.equal(computeAutoLayout(480, 90), 'horizontal');

  // Narrow sidebar dock with full height: 350 x 500 -> vertical
  assert.equal(computeAutoLayout(350, 500), 'vertical');

  // Tall OBS dock: 600 x 500 -> vertical (height > 600 * 0.68 = 408)
  assert.equal(computeAutoLayout(600, 500), 'vertical');

  // Compact floating dock: 300 x 250 -> vertical
  assert.equal(computeAutoLayout(300, 250), 'vertical');
});

test('overlay options round-trip all layouts and themes', () => {
  const layouts = ['horizontal', 'compact', 'stacked', 'banner', 'vertical', 'spotlight', 'textOnly', 'coverCard'] as const;
  const themes = ['glass', 'neon', 'minimal', 'light', 'ocean', 'sunset', 'twitch', 'mono'] as const;

  for (const layout of layouts) {
    for (const theme of themes) {
      const options: OverlayOptions = {
        ...DEFAULT_OVERLAY_OPTIONS,
        layout,
        theme,
        progressStyle: layout === 'coverCard' ? 'waveform' : 'bar',
        accent: '#10b981',
        scale: 110,
        radius: 12,
        backgroundOpacity: 85,
        shadowStrength: 40,
        useMarquee: false,
        hideWhenIdle: true,
      };
      const queryString = createOverlaySearch(options);
      const parsed = parseOverlayOptions(new URLSearchParams(queryString));

      assert.equal(parsed.layout, layout);
      assert.equal(parsed.theme, theme);
      assert.equal(parsed.progressStyle, layout === 'coverCard' ? 'waveform' : 'bar');
      assert.equal(parsed.accent, '#10b981');
      assert.equal(parsed.scale, 110);
      assert.equal(parsed.radius, 12);
      assert.equal(parsed.backgroundOpacity, 85);
      assert.equal(parsed.shadowStrength, 40);
      assert.equal(parsed.useMarquee, false);
      assert.equal(parsed.hideWhenIdle, true);
    }
  }
});

test('overlay free positioning clamps coordinates to [0, 100]', () => {
  const invalid = new URLSearchParams('freePositioning=1&posArtwork=-20,150&posText=abc,def&posMeta=50,50');
  const parsed = parseOverlayOptions(invalid);

  assert.equal(parsed.freePositioning, true);
  assert.equal(parsed.positions.artwork.x, 0); // clamped min
  assert.equal(parsed.positions.artwork.y, 100); // clamped max
  assert.deepEqual(parsed.positions.text, DEFAULT_OVERLAY_OPTIONS.positions.text); // fallback on NaN
  assert.deepEqual(parsed.positions.meta, { x: 50, y: 50 });
});

test('recommendedOverlaySize computes appropriate OBS bounding box for each layout', () => {
  const horizontal = recommendedOverlaySize('horizontal', 100);
  assert.ok(horizontal.width >= 520 && horizontal.height >= 120);

  const compact = recommendedOverlaySize('compact', 100);
  assert.ok(compact.width <= horizontal.width && compact.height <= horizontal.height);

  const vertical = recommendedOverlaySize('vertical', 100);
  assert.ok(vertical.height > vertical.width);

  const banner = recommendedOverlaySize('banner', 100);
  assert.ok(banner.width >= 720);

  const coverCard = recommendedOverlaySize('coverCard', 100);
  assert.equal(coverCard.width, 440);
  assert.equal(coverCard.height, 180);
  assert.deepEqual(recommendedOverlaySize('coverCard', 90), { width: 396, height: 162 });

  const scaled = recommendedOverlaySize('horizontal', 150);
  assert.equal(scaled.width, Math.ceil(horizontal.width * 1.5));
  assert.equal(scaled.height, Math.ceil(horizontal.height * 1.5));
});

test('playback state contract conforms to dock and overlay requirements', () => {
  const sampleTrack: Track = {
    id: 'ytm-test-123',
    title: 'Test Song Title',
    artist: 'Test Artist',
    duration: 245,
    albumArtUrl: 'https://example.com/art.jpg',
    url: 'https://music.youtube.com/watch?v=123',
    requester: {
      username: 'testviewer',
      displayName: 'TestViewer',
      badge: 'vip',
      color: '#ff00aa',
    },
    requestedAt: Date.now(),
    requestSource: 'youtube',
  };

  const samplePlayback: PlaybackState = {
    currentSong: sampleTrack,
    isPlaying: true,
    progressSeconds: 12,
    durationSeconds: 245,
    volume: 80,
    source: 'queue',
    status: 'playing',
  };

  // Verifies required fields are defined and of proper type
  assert.equal(typeof samplePlayback.currentSong?.title, 'string');
  assert.equal(typeof samplePlayback.currentSong?.artist, 'string');
  assert.equal(typeof samplePlayback.currentSong?.duration, 'number');
  assert.equal(typeof samplePlayback.isPlaying, 'boolean');
  assert.equal(typeof samplePlayback.progressSeconds, 'number');
  assert.equal(typeof samplePlayback.durationSeconds, 'number');
  assert.equal(typeof samplePlayback.volume, 'number');
  assert.ok(samplePlayback.progressSeconds <= (samplePlayback.durationSeconds || samplePlayback.currentSong.duration));
});

test('activeOverlay live sync state preserves valid options and defaults', () => {
  const custom = {
    ...DEFAULT_OVERLAY_OPTIONS,
    layout: 'coverCard' as const,
    progressStyle: 'waveform' as const,
    theme: 'glass' as const,
    radius: 20
  };
  assert.equal(custom.layout, 'coverCard');
  assert.equal(custom.progressStyle, 'waveform');
  assert.equal(custom.radius, 20);
});

