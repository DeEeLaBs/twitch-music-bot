import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../desktop/playerPreload.cjs', import.meta.url), 'utf8');
function player() {
  const messages: string[] = [];
  let domReady = () => {};
  let tick = () => {};
  let now = 0;
  let text = '';
  let width = 300;
  let cleared = false;
  const root = { get textContent() { return text; }, getBoundingClientRect: () => ({ width, height: 300 }), querySelector: () => ({}) };
  vm.runInNewContext(source, {
    require: () => ({ ipcRenderer: { sendToHost: (channel: string) => messages.push(channel), send: () => {}, on: () => {} } }),
    window: { addEventListener: (_name: string, callback: () => void) => { domReady = callback; } },
    document: { querySelector: (selector: string) => selector.startsWith('main') ? root : null },
    performance: { now: () => now },
    setInterval: (callback: () => void) => { tick = callback; return 1; },
    clearInterval: () => { cleared = true; },
    requestAnimationFrame: (callback: () => void) => callback(),
  });
  domReady();
  return { messages, tick: () => tick(), text: (value: string) => { text = value; }, width: (value: number) => { width = value; }, time: (value: number) => { now = value; }, cleared: () => cleared };
}

test('DOM-ready and empty Spotify skeleton do not uncover the webview', () => {
  const p = player();
  p.tick();
  assert.deepEqual(p.messages, []);
  p.text('Playlist and album content that has now been rendered by Spotify');
  p.tick();
  p.tick();
  assert.deepEqual(p.messages, ['player-content-ready']);
  assert.equal(p.cleared(), true);
});

test('content without layout space does not count as visible', () => {
  const p = player();
  p.text('Playlist and album content that has now been rendered by Spotify');
  p.width(0);
  p.tick();
  assert.deepEqual(p.messages, []);
  p.width(300);
  p.tick();
  assert.deepEqual(p.messages, ['player-content-ready']);
});

test('unrendered player times out with an error instead of showing a grey surface', () => {
  const p = player();
  p.time(20000);
  p.tick();
  assert.deepEqual(p.messages, ['player-content-timeout']);
  assert.equal(p.cleared(), true);
});
