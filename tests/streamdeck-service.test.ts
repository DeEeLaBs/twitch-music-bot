import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareVersions, installStreamDeckPlugin, pluginsDirectory, streamDeckStatus } from '../src/server/streamDeckService.ts';

const FILE = 'com.twitchmusicbot.streamDeckPlugin';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-service-'));
  const bundleDir = path.join(root, 'dist', 'streamdeck');
  const plugins = path.join(root, 'Plugins');
  const bundle = (version: string) => {
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(bundleDir, FILE), 'synthetic plugin archive');
    fs.writeFileSync(path.join(bundleDir, 'info.json'), JSON.stringify({ version, file: FILE }));
  };
  const installed = (version: string | null) => {
    const folder = path.join(plugins, 'com.twitchmusicbot.sdPlugin');
    fs.mkdirSync(folder, { recursive: true });
    const manifest = path.join(folder, 'manifest.json');
    if (version === null) fs.rmSync(manifest, { force: true });
    else fs.writeFileSync(manifest, JSON.stringify({ UUID: 'com.twitchmusicbot', Version: version }));
  };
  return { root, bundleDir, plugins, bundle, installed, options: () => ({ bundleDir, pluginsDir: plugins }), done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('versions compare numerically, not as text', () => {
  assert.equal(compareVersions('1.0.0.0', '1.0.0.0'), 0);
  assert.equal(compareVersions('1.0.0.1', '1.0.0.0'), 1);
  assert.equal(compareVersions('1.9.0.0', '1.10.0.0'), -1);
  assert.equal(compareVersions('2', '1.99.99.99'), 1);
  assert.equal(compareVersions('1.0', '1.0.0.0'), 0);
  assert.equal(compareVersions('garbage', '1.0.0.0'), -1);
});

test('the Stream Deck plugins folder is located per platform', () => {
  assert.equal(pluginsDirectory('win32', { APPDATA: 'C:\\Users\\U\\AppData\\Roaming' }, 'C:\\Users\\U'), path.join('C:\\Users\\U\\AppData\\Roaming', 'Elgato', 'StreamDeck', 'Plugins'));
  assert.equal(pluginsDirectory('darwin', {}, '/Users/u'), path.join('/Users/u', 'Library', 'Application Support', 'com.elgato.StreamDeck', 'Plugins'));
  assert.equal(pluginsDirectory('linux', {}, '/home/u'), null);
  assert.equal(pluginsDirectory('win32', {}, 'C:\\Users\\U'), null, 'no APPDATA means no known location');
});

test('status: not bundled, Stream Deck missing, not installed, up to date and update available', () => {
  const w = workspace();
  try {
    assert.equal(streamDeckStatus(w.options()).state, 'not-bundled');

    w.bundle('1.2.0.0');
    assert.equal(streamDeckStatus({ ...w.options(), pluginsDir: null }).state, 'streamdeck-missing');
    assert.equal(streamDeckStatus(w.options()).state, 'streamdeck-missing', 'plugins folder does not exist yet');

    fs.mkdirSync(w.plugins, { recursive: true });
    assert.deepEqual(streamDeckStatus(w.options()), { state: 'not-installed', bundledVersion: '1.2.0.0', installedVersion: null });

    w.installed('1.2.0.0');
    assert.deepEqual(streamDeckStatus(w.options()), { state: 'up-to-date', bundledVersion: '1.2.0.0', installedVersion: '1.2.0.0' });

    w.installed('1.1.0.0');
    assert.equal(streamDeckStatus(w.options()).state, 'update-available');

    w.installed('1.3.0.0');
    assert.equal(streamDeckStatus(w.options()).state, 'up-to-date', 'a newer installed copy is never "downgraded"');

    w.installed(null); // folder without a readable manifest: reinstalling repairs it
    assert.deepEqual(streamDeckStatus(w.options()), { state: 'update-available', bundledVersion: '1.2.0.0', installedVersion: null });
  } finally { w.done(); }
});

test('a damaged or hostile info.json is treated as "not bundled"', () => {
  const w = workspace();
  try {
    fs.mkdirSync(w.bundleDir, { recursive: true });
    fs.writeFileSync(path.join(w.bundleDir, FILE), 'x');
    for (const content of ['not json', JSON.stringify({ version: '1.0.0.0', file: '../../../evil.exe' }), JSON.stringify({ version: '1.0.0.0', file: 'plugin.txt' }), JSON.stringify({ file: FILE })]) {
      fs.writeFileSync(path.join(w.bundleDir, 'info.json'), content);
      assert.equal(streamDeckStatus(w.options()).state, 'not-bundled', content);
    }
  } finally { w.done(); }
});

test('install opens exactly the bundled plugin file, and refuses when nothing is bundled', async () => {
  const w = workspace();
  try {
    const opened: string[] = [];
    await assert.rejects(installStreamDeckPlugin({ ...w.options(), open: async file => { opened.push(file); } }), /nicht enthalten|not included/i);
    assert.deepEqual(opened, []);

    w.bundle('1.0.0.0');
    await installStreamDeckPlugin({ ...w.options(), open: async file => { opened.push(file); } });
    assert.deepEqual(opened, [path.join(w.bundleDir, FILE)]);
  } finally { w.done(); }
});

test('a failing opener is reported as an error instead of claiming success', async () => {
  const w = workspace();
  try {
    w.bundle('1.0.0.0');
    await assert.rejects(installStreamDeckPlugin({ ...w.options(), open: async () => { throw new Error('no handler registered'); } }), /no handler registered/);
  } finally { w.done(); }
});
