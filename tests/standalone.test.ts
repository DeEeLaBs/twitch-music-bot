import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);

test('portable launch uses bundled runtime and server from its own directory', () => {
 const { launchOptions } = require('../scripts/portable-launcher.cjs');
 const root = path.resolve('standalone test folder');
 const options = launchOptions(root, { PATH: 'empty', NODE_PATH: 'global-modules', NODE_OPTIONS: '--require global-hook', ELECTRON_RUN_AS_NODE: '1' });
 assert.equal(options.executable, path.join(root, 'runtime', 'node.exe'));
 assert.deepEqual(options.args, [path.join(root, 'scripts', 'start.cjs')]);
 assert.equal(options.cwd, root);
 assert.equal(options.env.NODE_ENV, 'production');
 assert.equal(options.env.NODE_PATH, '');
 assert.equal(options.env.NODE_OPTIONS, undefined);
 assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);
});

test('portable readiness rejects errors and identifies only the music bot', () => {
 const { isBotHealth } = require('../scripts/portable-launcher.cjs');
 assert.equal(isBotHealth({ status: 'ok', app: 'twitch-ytm-song-request-bot' }), true);
 assert.equal(isBotHealth({ status: 'ok', app: 'something-else' }), false);
 assert.equal(isBotHealth(null), false);
});

test('portable runtime retains the VMP signature matching its renamed executable', async () => {
 const fs = await import('node:fs');
 const os = await import('node:os');
 const { copyDesktopRuntime } = require('../scripts/build-standalone.cjs');
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-signature-'));
 const source = path.join(directory, 'source'), target = path.join(directory, 'portable');
 fs.mkdirSync(source);
 fs.writeFileSync(path.join(source, 'electron.exe'), 'runtime-test');
 fs.writeFileSync(path.join(source, 'electron.exe.sig'), 'signature-test');
 try {
  copyDesktopRuntime(source, target);
  assert.equal(fs.readFileSync(path.join(target, 'MusicBot.exe'), 'utf8'), 'runtime-test');
  assert.equal(fs.readFileSync(path.join(target, 'MusicBot.exe.sig'), 'utf8'), 'signature-test');
  assert.equal(fs.existsSync(path.join(target, 'electron.exe.sig')), false);
 } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('portable packaging rejects a missing DRM signature', async () => {
 const fs = await import('node:fs');
 const os = await import('node:os');
 const { copyDesktopRuntime } = require('../scripts/build-standalone.cjs');
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-signature-'));
 fs.writeFileSync(path.join(directory, 'electron.exe'), 'runtime-test');
 try { assert.throws(() => copyDesktopRuntime(directory, path.join(directory, 'portable')), /Signatur/); }
 finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
