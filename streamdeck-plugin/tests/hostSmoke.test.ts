import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

// Starts the real, bundled plugin against a fake Stream Deck host. Unit tests cannot catch a plugin that
// crashes while connecting (for example an SDK version requirement), which is exactly what makes every key fail.
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdPlugin = path.join(pluginRoot, 'com.twitchmusicbot.sdPlugin');
const bundle = path.join(sdPlugin, 'bin', 'plugin.js');
const STREAM_DECK_VERSION = '7.1.0.22000';
const PLUGIN_UUID = 'com.twitchmusicbot';
const CONTEXT = 'ctx-play-pause';

function waitFor<T>(poll: () => T | undefined, what: () => string, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = poll();
      if (value !== undefined) { clearInterval(timer); resolve(value); }
      else if (Date.now() - started > ms) { clearInterval(timer); reject(new Error(`Timed out waiting for ${what()}`)); }
    }, 25);
  });
}

test('the bundled plugin registers with Stream Deck, survives, and draws a key', { timeout: 60000 }, async () => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: pluginRoot, stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(path.join(sdPlugin, 'manifest.json'), 'utf8')) as { Actions: Array<{ UUID: string }> };
  const actionUuid = manifest.Actions.find(action => action.UUID.endsWith('.play-pause'))!.UUID;

  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const received: Array<Record<string, unknown>> = [];
  let socket: WebSocket | undefined;
  server.on('connection', ws => {
    socket = ws;
    ws.on('message', data => received.push(JSON.parse(String(data)) as Record<string, unknown>));
  });

  const info = {
    application: { font: 'Segoe UI', language: 'en', platform: 'windows', platformVersion: '10.0.0', version: STREAM_DECK_VERSION },
    colors: { buttonPressedBackgroundColor: '#303030', buttonPressedBorderColor: '#646464', buttonPressedTextColor: '#969696', disabledColor: '#007F7F7F', highlightColor: '#0F7FFF', mouseDownColor: '#2D2D2D' },
    devicePixelRatio: 1,
    devices: [{ id: 'device-1', name: 'Test deck', size: { columns: 5, rows: 3 }, type: 0 }],
    plugin: { uuid: PLUGIN_UUID, version: '1.0.0.0' }
  };
  const started = Date.now();
  let stderr = '';
  // The SDK logs its own errors to <plugin>/logs, not to stderr.
  const diagnostics = () => {
    const logs = path.join(sdPlugin, 'logs');
    const newest = fs.existsSync(logs) ? fs.readdirSync(logs).map(name => path.join(logs, name)).filter(file => fs.statSync(file).mtimeMs >= started - 1000).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).at(-1) : undefined;
    return `exit code: ${exitCode}, stderr: ${stderr.trim()}, plugin log: ${newest ? fs.readFileSync(newest, 'utf8').trim().split('\n').slice(-8).join(' | ') : 'none'}`;
  };
  let exitCode: number | null = null;
  const child = spawn(process.execPath, [bundle, '-port', String(port), '-pluginUUID', PLUGIN_UUID, '-registerEvent', 'registerPlugin', '-info', JSON.stringify(info)], { cwd: sdPlugin, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  child.on('exit', code => { exitCode = code ?? -1; });

  try {
    const registration = await waitFor(() => received.find(message => message.event === 'registerPlugin'), () => `registration (${diagnostics()})`);
    assert.equal(registration.uuid, PLUGIN_UUID);

    socket!.send(JSON.stringify({
      event: 'willAppear', action: actionUuid, context: CONTEXT, device: 'device-1',
      payload: { settings: {}, controller: 'Keypad', isInMultiAction: false, coordinates: { column: 0, row: 0 }, state: 0 }
    }));
    const image = await waitFor(() => received.find(message => message.event === 'setImage' && message.context === CONTEXT), () => `a key image (${diagnostics()})`);
    assert.match(String((image.payload as { image: string }).image), /^data:image\/svg\+xml/);

    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(exitCode, null, `the plugin exited early (code ${exitCode}): ${stderr}`);
    assert.equal(stderr.trim(), '', 'the plugin wrote errors');
    assert.doesNotMatch(diagnostics(), / ERROR /, 'the plugin logged an error');
  } finally {
    child.kill();
    for (const client of server.clients) client.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
