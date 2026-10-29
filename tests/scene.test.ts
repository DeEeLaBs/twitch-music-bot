import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CHAT_OPTIONS } from '../src/overlayChat.ts';
import {
  designForRender,
  displayFrame,
  fitScale,
  moveFrame,
  parseResolution,
  placeWidget,
  pointerToDesign,
  resizeFrame,
  resizeScene,
  sceneFromLegacy,
  normalizeScene,
  alignmentGuides
} from '../src/scene.ts';

test('fitScale keeps one uniform factor and letterboxes the longer side', () => {
  assert.equal(fitScale(960, 540, 1920, 1080), 0.5);
  assert.equal(fitScale(960, 800, 1920, 1080), 0.5);
  assert.equal(fitScale(0, 100, 1920, 1080), 1);
});

test('pointer coordinates convert through the scaled stage rect', () => {
  const point = pointerToDesign(100, 50, { left: 0, top: 0, width: 960, height: 540 }, { width: 1920, height: 1080 });
  assert.equal(point.x, 200);
  assert.equal(point.y, 100);
});

test('a mismatched resolution query does not replace the saved design', () => {
  const scene = sceneFromLegacy({ ...DEFAULT_CHAT_OPTIONS, enabled: false });
  const rendered = designForRender(scene, '1280x720');
  assert.deepEqual({ width: rendered.width, height: rendered.height }, scene.design);
  assert.equal(rendered.queryIgnored, true);
  assert.equal(designForRender(scene, '1920x1080').queryIgnored, false);
  assert.equal(parseResolution('99999x10'), null);
});

test('legacy chat percents become design pixels and a second copy is ignored', () => {
  const scene = sceneFromLegacy({ ...DEFAULT_CHAT_OPTIONS, enabled: true, x: 0, y: 0, width: 50, height: 50 });
  const chat = scene.widgets.find(widget => widget.type === 'twitch-chat');
  assert.equal(chat?.frame.x, 0);
  assert.equal(chat?.frame.y, 0);
  assert.equal(chat?.frame.width, 960);
  assert.equal(chat?.frame.height, 540);
  const again = placeWidget(scene, 'twitch-chat', { x: 10, y: 10 });
  assert.equal(again.widgets.filter(widget => widget.type === 'twitch-chat').length, 1);
});

test('resolution changes scale frames with the design and keep a uniform font factor', () => {
  const scene = sceneFromLegacy({ ...DEFAULT_CHAT_OPTIONS, enabled: false });
  const next = resizeScene(scene, 1280, 720);
  const player = next.widgets.find(widget => widget.type === 'music-player')!;
  const before = scene.widgets.find(widget => widget.type === 'music-player')!;
  assert.equal(next.design.width, 1280);
  assert.equal(next.design.height, 720);
  assert.equal(player.frame.width, Math.round(before.frame.width * (1280 / 1920)));
  assert.equal(player.fontSize, Math.round(before.fontSize * (1280 / 1920)));
});

test('a goal ring stays a circle while its handles move', () => {
  const frame = { x: 100, y: 80, width: 400, height: 640, z: 1 };
  const design = { width: 1920, height: 1080 };
  const east = resizeFrame(frame, 'e', 40, 0, 'goal', design, 1, false, true);
  assert.equal(east.width, east.height);
  assert.equal(east.x, 100);
  assert.equal(east.width, 440);
  assert.equal(east.y, 180);
  const corner = resizeFrame(frame, 'se', 20, 80, 'goal', design, 1, false, true);
  assert.equal(corner.x, 100);
  assert.equal(corner.y, 80);
  assert.equal(corner.width, 720);
  assert.equal(corner.height, 720);
  const shown = displayFrame({ type: 'goal', variant: 'follower|ring|violet', frame });
  assert.equal(shown.width, shown.height);
  assert.equal(shown.width, 400);
  assert.equal(shown.x, 100);
  assert.equal(shown.y, 200);
  const bar = displayFrame({ type: 'goal', variant: 'follower', frame });
  assert.equal(bar.height, 640);
});

test('a hidden layer stays hidden and a missing flag stays visible', () => {
  const scene = normalizeScene({
    version: 1,
    id: 'main',
    design: { width: 1920, height: 1080 },
    grid: 8,
    widgets: [
      { type: 'image', frame: { x: 10, y: 10, width: 200, height: 120, z: 1 }, visible: false },
      { type: 'label', frame: { x: 10, y: 200, width: 220, height: 80, z: 2 } }
    ]
  });
  assert.equal(scene?.widgets.find(widget => widget.type === 'image')?.visible, false);
  assert.equal(scene?.widgets.find(widget => widget.type === 'label')?.visible, true);
});

test('move and resize stay inside the design and respect the minimum size', () => {
  const scene = sceneFromLegacy({ ...DEFAULT_CHAT_OPTIONS, enabled: false });
  const player = scene.widgets[0];
  const moved = moveFrame(player.frame, -500, 40, player.type, scene.design, 8, true);
  assert.equal(moved.x, 0);
  assert.equal(moved.y % 8, 0);
  const shrunk = resizeFrame(player.frame, 'se', -900, -900, player.type, scene.design, 8, false);
  assert.equal(shrunk.width, 360);
  assert.equal(shrunk.height, 96);
});

test('alignment guides connect centered and symmetric widgets', () => {
  const design = { width: 1920, height: 1080 };
  const box = (id: string, x: number, y: number) => ({ id, frame: { x, y, width: 100, height: 100, z: 1 } });
  const centered = alignmentGuides([box('a', 100, 40), box('b', 100, 400)], 'a', design);
  assert.equal(centered[0]?.kind, 'center');
  assert.equal(centered[0]?.x1, 150);
  assert.equal(centered[0]?.x2, 150);
  const mirrored = alignmentGuides([box('a', 100, 490), box('b', 1720, 490)], 'a', design);
  assert.equal(mirrored.some(guide => guide.kind === 'symmetric'), true);
  assert.equal(alignmentGuides([box('a', 10, 10), box('b', 400, 700)], 'a', design).length, 0);
});
