import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { prepare, PLUGIN_FILE } = createRequire(import.meta.url)('../scripts/prepare-streamdeck.cjs') as {
  prepare: (options: { root: string; outDir: string; pack?: boolean; packPlugin?: (pluginDir: string) => void; log?: (message: string) => void }) => boolean;
  PLUGIN_FILE: string;
};

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-sd-'));
  const pluginDir = path.join(root, 'streamdeck-plugin');
  const outDir = path.join(root, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const packed = (version: string) => {
    fs.mkdirSync(path.join(pluginDir, 'release'), { recursive: true });
    fs.mkdirSync(path.join(pluginDir, 'com.twitchmusicbot.sdPlugin'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'release', PLUGIN_FILE), `archive ${version}`);
    fs.writeFileSync(path.join(pluginDir, 'com.twitchmusicbot.sdPlugin', 'manifest.json'), JSON.stringify({ Version: version }));
  };
  return { root, pluginDir, outDir, packed, done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('an already packed plugin is copied into dist/streamdeck together with its version', () => {
  const p = project();
  try {
    p.packed('1.4.0.0');
    assert.equal(prepare({ root: p.root, outDir: p.outDir }), true);
    assert.equal(fs.readFileSync(path.join(p.outDir, 'streamdeck', PLUGIN_FILE), 'utf8'), 'archive 1.4.0.0');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.outDir, 'streamdeck', 'info.json'), 'utf8')), { version: '1.4.0.0', file: PLUGIN_FILE });
  } finally { p.done(); }
});

test('without a packed plugin nothing is offered, silently, and stale output is not left behind', () => {
  const p = project();
  try {
    const logs: string[] = [];
    fs.mkdirSync(path.join(p.pluginDir), { recursive: true });
    fs.mkdirSync(path.join(p.outDir, 'streamdeck'), { recursive: true });
    assert.equal(prepare({ root: p.root, outDir: p.outDir, log: m => logs.push(m) }), false);
    assert.deepEqual(logs, []);
    p.packed('1.0.0.0');
    assert.equal(prepare({ root: p.root, outDir: p.outDir }), true);
    fs.rmSync(path.join(p.pluginDir, 'release'), { recursive: true });
    assert.equal(prepare({ root: p.root, outDir: p.outDir }), false);
  } finally { p.done(); }
});

test('a project without the plugin folder is fine', () => {
  const p = project();
  try { assert.equal(prepare({ root: p.root, outDir: p.outDir }), false); } finally { p.done(); }
});

test('--pack builds first, and a failing pack only warns instead of breaking the bot build', () => {
  const p = project();
  try {
    fs.mkdirSync(p.pluginDir, { recursive: true });
    const packedWith: string[] = [];
    assert.equal(prepare({ root: p.root, outDir: p.outDir, pack: true, packPlugin: dir => { packedWith.push(dir); p.packed('2.0.0.0'); } }), true);
    assert.deepEqual(packedWith, [p.pluginDir]);

    const logs: string[] = [];
    assert.equal(prepare({ root: p.root, outDir: p.outDir, pack: true, packPlugin: () => { throw new Error('npm ci failed: offline'); }, log: m => logs.push(m) }), false);
    assert.match(logs[0], /offline/);
  } finally { p.done(); }
});

test('a manifest without a version is rejected', () => {
  const p = project();
  try {
    p.packed('1.0.0.0');
    fs.writeFileSync(path.join(p.pluginDir, 'com.twitchmusicbot.sdPlugin', 'manifest.json'), '{}');
    const logs: string[] = [];
    assert.equal(prepare({ root: p.root, outDir: p.outDir, log: m => logs.push(m) }), false);
    assert.match(logs[0], /no version/);
  } finally { p.done(); }
});
