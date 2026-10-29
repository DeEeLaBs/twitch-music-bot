import assert from 'node:assert/strict';
import test from 'node:test';
import { alertForClip, alertFrame, alertFrameSize, alertPieces, alertSoundType, applyAlertFrame, applyAlertFx, blankClip, containAlertResolution, creatorClipFor, creatorPaintOrder, creatorShapePaint, dataUrlWithType, defaultAlertBox, filterAlertMessage, fitAlertFrame, matchVariation, moveCreatorLayer, normalizeAlertBox, placeCreatorShape, assignCreatorShape, planAlert, templateLayers } from '../src/alertBox.ts';
import { alertFromNotification, type StreamAlert } from '../src/streamAlerts.ts';

const alert = (patch: Partial<StreamAlert>): StreamAlert => ({
  id: '1', kind: 'cheer', user: 'Ari', amount: 100, createdAt: 1, message: 'hello', months: 0, tier: '', currency: '', viewers: 0, ...patch
});

test('an older alert box keeps the current plate and can store a corner', () => {
  const kept = normalizeAlertBox({ template: '{name}' });
  assert.equal(kept.plateColor, '#09090b');
  assert.equal(kept.plateOpacity, 72);
  assert.equal(kept.radius, 16);
  assert.equal(kept.align, 'center');
  assert.equal(kept.creator.clips.length, 0);
  assert.equal(normalizeAlertBox({ radius: 28, outro: 'slide' }).outro, 'slide');
  assert.equal(normalizeAlertBox({ radius: 28 }).radius, 28);
});

test('creator layers and a cheer range survive normalize', () => {
  const stored = normalizeAlertBox({
    creator: {
      clips: [{
        event: 'cheer',
        range: 'between',
        min: 10,
        max: 50,
        layers: [{ id: 'text-1', kind: 'text', intro: 'slide-left', outro: 'pop', template: '{name} {amount}' }]
      }]
    }
  });
  const clip = stored.creator.clips[0];
  assert.equal(clip.event, 'cheer');
  assert.equal(clip.range, 'between');
  assert.equal(clip.min, 10);
  assert.equal(clip.max, 50);
  assert.equal(clip.layers[0].kind, 'text');
  assert.equal(clip.layers[0].intro, 'slide-left');
  assert.equal(clip.layers[0].outro, 'pop');
  assert.equal(clip.layers[0].template, '{name} {amount}');
  assert.equal(clip.layers[0].fontFamily, 'Inter, sans-serif');
  const withFont = normalizeAlertBox({
    fonts: [{ id: 'font_1', family: 'Stream Deck', url: '/overlay-assets/alert-font-1.otf', format: 'opentype' }],
    creator: { clips: [{ event: 'follow', layers: [{ kind: 'text', fontFamily: '"Stream Deck", sans-serif' }] }, { event: 'cheer', layers: [{ kind: 'text' }] }] }
  });
  assert.equal(withFont.fonts.length, 1);
  assert.equal(withFont.fonts[0].url, '/overlay-assets/alert-font-1.otf');
  assert.equal(withFont.creator.clips[0].layers[0].fontFamily, '"Stream Deck", sans-serif');
  assert.equal(withFont.creator.clips[1].layers[0].fontFamily, 'Inter, sans-serif');
  assert.equal(withFont.creator.clips[0].event === 'follow' && withFont.creator.clips[1].event === 'cheer' && withFont.fonts.length === 1, true);
  assert.equal(stored.plateColor, '#09090b');
  assert.equal(clip.message, 'all');
  assert.equal(clip.tier, '');
});

test('a closer cheer variation wins and a tier filter stays on its plan', () => {
  const config = normalizeAlertBox({
    creator: {
      clips: [
        { event: 'cheer', range: 'to-infinite', min: 1, message: 'with', layers: [{ kind: 'text', template: 'wide' }] },
        { event: 'cheer', range: 'between', min: 10, max: 50, message: 'all', layers: [{ kind: 'text', template: 'mid' }] },
        { event: 'subscription', tier: '2000', layers: [{ kind: 'text', template: 'tier2' }] },
        { event: 'subscription', layers: [{ kind: 'text', template: 'any' }] }
      ]
    }
  });
  assert.equal(config.creator.clips.length, 4);
  assert.equal(creatorClipFor(config, alert({ kind: 'cheer', amount: 20, message: 'hi' }))?.layers[0].template, 'mid');
  assert.equal(creatorClipFor(config, alert({ kind: 'cheer', amount: 20, message: '' }))?.layers[0].template, 'mid');
  assert.equal(creatorClipFor(config, alert({ kind: 'cheer', amount: 80, message: '' })), null);
  assert.equal(creatorClipFor(config, alert({ kind: 'cheer', amount: 80, message: 'hi' }))?.layers[0].template, 'wide');
  assert.equal(creatorClipFor(config, alert({ kind: 'subscription', tier: '2000' }))?.layers[0].template, 'tier2');
  assert.equal(creatorClipFor(config, alert({ kind: 'subscription', tier: '1000' }))?.layers[0].template, 'any');
});

test('a higher bits variation wins over a lower threshold', () => {
  const config = defaultAlertBox();
  config.variations = [
    { ...config.variations[0], id: 'low', name: 'Low', kind: 'cheer', enabled: true, match: { months: 0, monthMin: 0, tier: '', exactAmount: 0, minAmount: 1, maxAmount: 0, minViewers: 0 }, template: 'low {amount}', mediaUrl: '', soundUrl: '', volume: 80, layout: 'text-over', durationMs: 6000, textDelayMs: 0, introMs: 400, outroMs: 400, intro: 'fade', outro: 'fade', textAnim: 'none' },
    { id: 'high', name: 'High', kind: 'cheer', enabled: true, match: { months: 0, monthMin: 0, tier: '', exactAmount: 500, minAmount: 0, maxAmount: 0, minViewers: 0 }, template: 'high {name}', mediaUrl: '', soundUrl: '', volume: 80, layout: 'media-left', durationMs: 8000, textDelayMs: 200, introMs: 400, outroMs: 400, intro: 'zoom', outro: 'fade', textAnim: 'pulse' }
  ];
  const plan = planAlert(config, alert({ amount: 500 }));
  assert.equal(plan.variationId, 'high');
  assert.equal(plan.layout, 'media-left');
  assert.equal(plan.pieces.map(piece => piece.text).join('').replaceAll('\u00A0', ' '), 'high Ari');
  assert.equal(matchVariation(config, alert({ amount: 50 }))?.id, 'low');
});

test('tts stays quiet under the bits threshold and filters a shouted message', () => {
  const config = defaultAlertBox();
  config.speech.enabled = true;
  config.speech.minAmount = 200;
  config.template = '{name}';
  assert.equal(planAlert(config, alert({ amount: 50, message: 'loooool' })).speech, '');
  const spoken = planAlert(config, alert({ amount: 200, message: 'loooool badword' }));
  config.speech.blacklist = 'badword';
  const filtered = planAlert({ ...config, speech: { ...config.speech, blacklist: 'badword' } }, alert({ amount: 200, message: 'loooool badword' }));
  assert.match(filtered.speech, /Ari/);
  assert.equal(filtered.speech.includes('badword'), false);
  assert.equal(filterAlertMessage('loooool', 3, ''), 'loool');
  assert.equal(spoken.speech.includes('looo'), true);
});

test('gifted subscriptions are one alert and individual gifts are skipped', () => {
  const bomb = alertFromNotification({ payload: { subscription: { type: 'channel.subscription.gift' }, event: { user_name: 'Nova', total: 5, tier: '1000' } } }, 9);
  assert.equal(bomb?.kind, 'communitygift');
  assert.equal(bomb?.amount, 5);
  const gifted = alertFromNotification({ payload: { subscription: { type: 'channel.subscribe' }, event: { user_name: 'Ari', is_gift: true } } }, 9);
  assert.equal(gifted, null);
});

test('image options keep their place, fit, and transform', () => {
  const stored = normalizeAlertBox({
    creator: {
      clips: [{
        event: 'follow',
        layers: [{ kind: 'image', role: 'background', fit: 'cover', gifFromStart: true, rotateX: 12, translateZ: 8, anchorX: 20, skewY: 4, anchor: 'top-left' }]
      }]
    }
  });
  const layer = stored.creator.clips[0].layers[0];
  assert.equal(layer.role, 'background');
  assert.equal(layer.fit, 'cover');
  assert.equal(layer.gifFromStart, true);
  assert.equal(layer.rotateX, 12);
  assert.equal(layer.translateZ, 8);
  assert.equal(layer.anchorX, 20);
  assert.equal(layer.anchorY, 0);
  assert.equal(layer.skewY, 4);
  assert.equal(layer.hideOverflow, true);
  assert.equal(layer.icon, '');
});

test('a donation template matches a tip in range and keeps its icon', () => {
  const stored = normalizeAlertBox({
    creator: { clips: [{ event: 'tip', range: 'between', min: 5, max: 20, message: 'with', layers: templateLayers('tip', 'en') }] }
  });
  const icon = stored.creator.clips[0].layers.find(layer => layer.icon === 'heart');
  assert.ok(icon);
  assert.equal(creatorClipFor(stored, alert({ kind: 'tip', amount: 10, message: 'thanks' }))?.event, 'tip');
  assert.equal(creatorClipFor(stored, alert({ kind: 'tip', amount: 10, message: '' })), null);
  assert.equal(applyAlertFx(icon, 'pop-center').intro, 'pop');
  assert.equal(normalizeAlertBox({ creator: { clips: [{ event: 'tip', layers: [{ kind: 'image', icon: 'nope', hideOverflow: false }] }] } }).creator.clips[0].layers[0].hideOverflow, false);
});

test('an alert clip frame defaults to fullscreen and a square frame fits a 1:1 stage', () => {
  const missing = normalizeAlertBox({ creator: { clips: [{ event: 'follow', layers: [{ kind: 'text', x: 12, y: 34, width: 40, height: 20 }] }] } });
  assert.equal(missing.creator.clips[0].frame, 'fullscreen');
  assert.deepEqual({ width: missing.creator.clips[0].width, height: missing.creator.clips[0].height }, { width: 1920, height: 1080 });
  assert.equal(missing.creator.clips[0].layers[0].x, 12);
  assert.equal(missing.creator.clips[0].layers[0].y, 34);
  assert.equal(alertFrame('wide'), 'fullscreen');
  assert.equal(alertFrame(undefined), 'fullscreen');
  assert.deepEqual(alertFrameSize('fullscreen'), { width: 1920, height: 1080 });
  assert.equal(blankClip('cheer').frame, 'fullscreen');
  assert.deepEqual(alertFrameSize('square', { width: 1920, height: 1080 }), { width: 1080, height: 1080 });
  assert.deepEqual(alertFrameSize('fullscreen', { width: 1080, height: 1080 }), { width: 1920, height: 1080 });
  assert.deepEqual(alertFrameSize('square', { width: 1280, height: 720 }), { width: 720, height: 720 });
  assert.deepEqual(alertFrameSize('fullscreen', { width: 720, height: 720 }), { width: 1280, height: 720 });
  const wide = normalizeAlertBox({
    creator: { clips: [{ event: 'cheer', frame: 'fullscreen', width: 1280, height: 720, layers: [{ kind: 'text', template: 'kept', x: 8, y: 9 }] }] }
  });
  assert.equal(wide.creator.clips[0].frame, 'fullscreen');
  assert.equal(wide.creator.clips[0].width, 1280);
  assert.equal(wide.creator.clips[0].height, 720);
  assert.equal(wide.creator.clips[0].layers[0].x, 8);
  const square = normalizeAlertBox({
    creator: { clips: [{ event: 'follow', frame: 'square', layers: [{ kind: 'text', template: 'kept' }] }] }
  });
  assert.equal(square.creator.clips[0].frame, 'square');
  assert.equal(square.creator.clips[0].layers[0].template, 'kept');
  assert.deepEqual({ width: square.creator.clips[0].width, height: square.creator.clips[0].height }, { width: 1080, height: 1080 });
  assert.deepEqual(alertFrameSize('square'), { width: 1080, height: 1080 });
  assert.deepEqual(fitAlertFrame('fullscreen', { width: 1600, height: 500 }), { width: 888, height: 500 });
  assert.deepEqual(fitAlertFrame('square', { width: 1600, height: 500 }), { width: 500, height: 500 });
  assert.deepEqual(fitAlertFrame('square', { width: 0, height: 400 }), { width: 0, height: 0 });
  assert.equal(missing.frame, 'fullscreen');
  const untouched = normalizeAlertBox({
    creator: { clips: [{ event: 'follow', frame: 'square', layers: [{ kind: 'text', template: 'kept', x: 3 }] }] }
  });
  assert.equal(untouched.creator.clips[0].frame, 'square');
  assert.equal(untouched.creator.clips[0].layers[0].template, 'kept');
  assert.deepEqual(containAlertResolution({ width: 1080, height: 1080 }, { width: 1920, height: 1080 }), { width: 1080, height: 1080 });
  assert.deepEqual(containAlertResolution({ width: 1920, height: 1080 }, { width: 960, height: 540 }), { width: 960, height: 540 });
});

test('one frame choice is stored on every creator clip', () => {
  const box = normalizeAlertBox({
    creator: {
      clips: [
        { event: 'follow', layers: [{ kind: 'text', template: 'follow-text', x: 11, y: 22 }] },
        { event: 'cheer', frame: 'fullscreen', width: 1280, height: 720, layers: [{ kind: 'image', template: 'cheer-art', y: 7 }] },
        { id: 'raid-clip', event: 'raid', name: 'Raid', layers: [{ kind: 'text', template: 'raid-text' }] }
      ]
    }
  });
  assert.equal(box.frame, 'fullscreen');
  assert.equal(box.creator.clips[0].frame, 'fullscreen');
  const square = applyAlertFrame(box, 'square');
  assert.equal(square.frame, 'square');
  assert.equal(square.creator.clips.length, 3);
  assert.deepEqual(square.creator.clips.map(clip => clip.frame), ['square', 'square', 'square']);
  assert.deepEqual({ width: square.creator.clips[0].width, height: square.creator.clips[0].height }, { width: 1080, height: 1080 });
  assert.equal(square.creator.clips[0].layers[0].template, 'follow-text');
  assert.equal(square.creator.clips[0].layers[0].x, 11);
  assert.equal(square.creator.clips[0].layers[0].y, 22);
  assert.deepEqual({ width: square.creator.clips[1].width, height: square.creator.clips[1].height }, { width: 720, height: 720 });
  assert.equal(square.creator.clips[1].layers[0].template, 'cheer-art');
  assert.equal(square.creator.clips[1].layers[0].y, 7);
  assert.equal(square.creator.clips[2].id, 'raid-clip');
  assert.equal(square.creator.clips[2].name, 'Raid');
  const wide = applyAlertFrame(square, 'fullscreen');
  assert.equal(wide.frame, 'fullscreen');
  assert.deepEqual(wide.creator.clips.map(clip => clip.frame), ['fullscreen', 'fullscreen', 'fullscreen']);
  assert.deepEqual({ width: wide.creator.clips[0].width, height: wide.creator.clips[0].height }, { width: 1920, height: 1080 });
  assert.deepEqual({ width: wide.creator.clips[1].width, height: wide.creator.clips[1].height }, { width: 1280, height: 720 });
  assert.equal(wide.creator.clips[0].layers[0].template, 'follow-text');
  const created = blankClip('tip', wide.creator.clips.length, wide.frame);
  assert.equal(created.frame, 'fullscreen');
  assert.deepEqual({ width: created.width, height: created.height }, { width: 1920, height: 1080 });
  const stored = normalizeAlertBox(square);
  assert.equal(stored.frame, 'square');
  assert.deepEqual(stored.creator.clips.map(clip => [clip.frame, clip.width, clip.height]), [
    ['square', 1080, 1080],
    ['square', 720, 720],
    ['square', 1080, 1080]
  ]);
  assert.equal(stored.creator.clips[2].layers[0].template, 'raid-text');
  const mixed = normalizeAlertBox({
    creator: {
      clips: [
        { event: 'follow', frame: 'square', layers: [{ kind: 'text', template: 'stay' }] },
        { event: 'cheer', layers: [{ kind: 'text', template: 'old' }] }
      ]
    }
  });
  assert.equal(mixed.frame, 'fullscreen');
  assert.equal(mixed.creator.clips[0].frame, 'square');
  assert.equal(mixed.creator.clips[0].layers[0].template, 'stay');
  assert.equal(mixed.creator.clips[1].frame, 'fullscreen');
});

test('a space after an alert token survives and extra spaces collapse to one', () => {
  const follow = alert({ kind: 'follow', user: 'Viewer', amount: 3, months: 4, tier: '1000', viewers: 12, message: 'hello', currency: 'EUR' });
  const shown = (template: string) => alertPieces(template, follow).map(piece => piece.text).join('').replaceAll('\u00A0', ' ');
  assert.equal(shown('{name}  is now following'), 'Viewer is now following');
  assert.equal(shown('{name} is now following'), 'Viewer is now following');
  assert.equal(shown('{user}  is now following'), 'Viewer is now following');
  assert.equal(shown('{amount}  bits'), '3 bits');
  assert.equal(shown('{months}  months'), '4 months');
  assert.equal(shown('{tier}  tier'), '1000 tier');
  assert.equal(shown('{viewers}  viewers'), '12 viewers');
  assert.equal(shown('{message}  text'), 'hello text');
  assert.equal(shown('{currency}  left'), 'EUR left');
  assert.equal(shown('{name}{amount}'), 'Viewer3');
  assert.equal(shown('{name} folgt jetzt'), 'Viewer folgt jetzt');
  const pieces = alertPieces('{name}  is now following', follow);
  assert.equal(pieces.map(piece => piece.text).join(''), 'Viewer\u00A0is now following');
  const config = defaultAlertBox();
  config.template = '{name}  is now following';
  config.speech.enabled = true;
  assert.equal(planAlert(config, follow).speech, 'Viewer is now following: hello');
});

test('each alert token prints its own field', () => {
  const shown = (template: string, item: StreamAlert) => alertPieces(template, item).map(piece => piece.text).join('').replaceAll('\u00A0', ' ');
  const every = '{name} {user} {amount} {currency} {months} {tier} {viewers} {message}';
  const cheer = alert({ kind: 'cheer', user: 'Ari', amount: 100, months: 0, tier: '', currency: '', viewers: 0, message: 'pog' });
  assert.equal(shown('{name} cheered', cheer), 'Ari cheered');
  assert.equal(shown('{user} cheered', cheer), 'Ari cheered');
  assert.equal(shown('{amount}', cheer), '100');
  assert.equal(shown('{months}', cheer), '0');
  assert.equal(shown('{viewers}', cheer), '0');
  assert.equal(shown('{amount} {currency}', cheer), '100');
  assert.equal(shown('{currency}', cheer), '');
  assert.equal(shown(every, cheer).includes('{'), false);
  const tip = alert({ kind: 'tip', user: 'Ari', amount: 5, currency: 'EUR', message: 'thanks', months: 0, viewers: 0 });
  assert.equal(shown('{amount} {currency}', tip), '5 EUR');
  assert.equal(shown('{message}', tip), 'thanks');
  const resub = alert({ kind: 'resub', user: 'Ari', amount: 12, months: 12, tier: '2000', viewers: 0, currency: '', message: '' });
  assert.equal(shown('{months} {tier}', resub), '12 2000');
  assert.equal(shown('{amount}', resub), '12');
  const raid = alert({ kind: 'raid', user: 'Mika', amount: 40, viewers: 40, months: 0, currency: '', message: '' });
  assert.equal(shown('{viewers}', raid), '40');
  assert.equal(shown('{amount}', raid), '40');
  const crossed = alert({ kind: 'cheer', user: 'Ari', amount: 100, months: 3, viewers: 8, currency: 'USD', tier: '1000', message: 'hi' });
  assert.equal(shown(every, crossed), 'Ari Ari 100 USD 3 1000 8 hi');
  const pieces = alertPieces('{name} cheered', cheer);
  assert.equal(pieces.map(piece => piece.text).join(''), 'Ari\u00A0cheered');
  const raidClip = normalizeAlertBox({ creator: { clips: [{ event: 'raid', range: 'exactly', min: 40, layers: [{ kind: 'text' }] }] } }).creator.clips[0];
  const preview = alertForClip(raidClip);
  assert.equal(preview.viewers, 40);
  assert.equal(preview.amount, 40);
  const tipClip = normalizeAlertBox({ creator: { clips: [{ event: 'tip', min: 5, layers: [{ kind: 'text' }] }] } }).creator.clips[0];
  assert.equal(alertForClip(tipClip).currency, 'EUR');
  assert.equal(alertForClip(normalizeAlertBox({ creator: { clips: [{ event: 'resub', min: 6, tier: '1000', layers: [{ kind: 'text' }] }] } }).creator.clips[0]).months, 6);
});

test('a creator clip can be played back from the alert it describes', () => {
  const stored = normalizeAlertBox({
    creator: { clips: [{ id: 'cheer-1', event: 'cheer', range: 'exactly', min: 100, message: 'with', layers: [{ kind: 'text', template: '{name}' }] }] }
  });
  const clip = stored.creator.clips[0];
  assert.equal(creatorClipFor(stored, alertForClip(clip))?.id, 'cheer-1');
});

test('a sound layer keeps the uploaded url and common audio types', () => {
  const stored = normalizeAlertBox({
    creator: { clips: [{ event: 'follow', layers: [{ id: 'sound-1', kind: 'sound', soundUrl: '/overlay-assets/alert-sound-1.mp3' }] }] }
  });
  assert.equal(stored.creator.clips[0].layers[0].kind, 'sound');
  assert.equal(stored.creator.clips[0].layers[0].soundUrl, '/overlay-assets/alert-sound-1.mp3');
  assert.equal(alertSoundType('cheer.mp3', ''), 'audio/mpeg');
  assert.equal(alertSoundType('cheer.mp3', 'audio/mp3'), 'audio/mpeg');
  assert.equal(alertSoundType('cheer.wav', 'audio/x-wav'), 'audio/wav');
  assert.equal(alertSoundType('cheer.ogg', 'application/octet-stream'), 'audio/ogg');
  assert.equal(alertSoundType('cheer.m4a', 'audio/x-m4a'), 'audio/mp4');
  assert.equal(dataUrlWithType('data:;base64,AAAA', 'audio/mpeg'), 'data:audio/mpeg;base64,AAAA');
  assert.equal(dataUrlWithType('data:audio/mp3;base64,AAAA', 'audio/mpeg'), 'data:audio/mpeg;base64,AAAA');
});

test('shape layers keep their form, fill, and stroke, and older plates stay rounded', () => {
  const stored = normalizeAlertBox({
    creator: { clips: [{ event: 'cheer', layers: [
      { kind: 'shape', radius: 16, color: '#112233' },
      { kind: 'shape', shape: 'ellipse', color: '#abcdef', stroke: true, strokeWidth: 6, strokeColor: '#ff00aa' },
      { kind: 'shape', shape: 'line', color: '#00ff00' },
      { kind: 'shape' }
    ] }] }
  });
  const [legacy, ellipse, line, plain] = stored.creator.clips[0].layers;
  assert.equal(legacy.shape, 'rounded');
  assert.equal(legacy.radius, 16);
  assert.equal(legacy.color, '#112233');
  assert.equal(ellipse.shape, 'ellipse');
  assert.equal(ellipse.stroke, true);
  assert.equal(ellipse.strokeWidth, 6);
  assert.equal(ellipse.strokeColor, '#ff00aa');
  assert.equal(line.shape, 'line');
  assert.equal(line.stroke, false);
  assert.equal(plain.shape, 'rectangle');
  assert.equal(templateLayers('follow')[0].shape, 'rounded');
  const fresh = placeCreatorShape(0, 'line');
  assert.equal(fresh.kind, 'shape');
  assert.equal(fresh.shape, 'line');
  assert.equal(fresh.height, 4);
  const box = placeCreatorShape(1, 'rectangle');
  box.x = 12;
  box.y = 18;
  box.width = 40;
  box.height = 22;
  const switched = assignCreatorShape(box, 'ellipse');
  assert.equal(switched.shape, 'ellipse');
  assert.equal(switched.x, 12);
  assert.equal(switched.y, 18);
  assert.equal(switched.width, 40);
  assert.equal(switched.height, 22);
  const lined = assignCreatorShape(box, 'line');
  assert.equal(lined.shape, 'line');
  assert.equal(lined.width, 40);
  assert.equal(lined.height, 22);
  assert.equal(creatorShapePaint(ellipse).borderRadius, '50%');
  assert.equal(creatorShapePaint(ellipse).border, '6px solid #ff00aa');
  assert.equal(creatorShapePaint(ellipse).background, '#abcdef');
  assert.equal(creatorShapePaint(line).border, undefined);
  assert.equal(creatorShapePaint(plain).borderRadius, undefined);
});

test('layer stack order survives parse and later layers paint in front', () => {
  const stored = normalizeAlertBox({
    creator: { clips: [{ event: 'follow', layers: [
      { id: 'back', kind: 'shape', startMs: 0, lengthMs: 1000 },
      { id: 'tone', kind: 'sound', startMs: 200, lengthMs: 800 },
      { id: 'front', kind: 'text', startMs: 400, lengthMs: 1200 }
    ] }] }
  });
  const layers = stored.creator.clips[0].layers;
  assert.deepEqual(layers.map(layer => layer.id), ['back', 'tone', 'front']);
  assert.deepEqual(layers.map(layer => [layer.startMs, layer.lengthMs]), [[0, 1000], [200, 800], [400, 1200]]);
  assert.deepEqual(creatorPaintOrder(layers).map(layer => layer.id), ['back', 'front']);
  const raised = moveCreatorLayer(layers, 'back', layers.length - 1);
  assert.deepEqual(raised.map(layer => layer.id), ['tone', 'front', 'back']);
  assert.deepEqual(raised.map(layer => [layer.startMs, layer.lengthMs]), [[200, 800], [400, 1200], [0, 1000]]);
  assert.deepEqual(creatorPaintOrder(raised).map(layer => layer.id), ['front', 'back']);
  assert.equal(raised.length, layers.length);
});
