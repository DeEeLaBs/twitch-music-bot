// Builds the plugin: bundles src/plugin.ts and generates manifest.json and icons from the action catalog.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brandPng } from './tools/brandPng.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.join(root, 'com.twitchmusicbot.sdPlugin');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const PLUGIN_UUID = 'com.twitchmusicbot';

// 1. Bundle the plugin (Stream Deck runs it with its own Node.js 20).
await build({
  entryPoints: [path.join(root, 'src', 'plugin.ts')],
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  outfile: path.join(pluginDir, 'bin', 'plugin.js'),
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning'
});

// 2. Load the catalog (bundled to a temp file so no TypeScript runtime is needed).
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-catalog-'));
const catalogFile = path.join(temp, 'catalog.mjs');
await build({ entryPoints: [path.join(root, 'src', 'core', 'catalog.ts')], bundle: true, platform: 'node', format: 'esm', outfile: catalogFile, logLevel: 'warning' });
const { ACTIONS, renderKey, EMPTY_STATE } = await import(pathToFileURL(catalogFile).href);
fs.rmSync(temp, { recursive: true, force: true });

// 3. Icons.
const sampleState = { ...EMPTY_STATE, queue: [{ id: 'a', title: 'A' }], playback: { ...EMPTY_STATE.playback, volume: 50, currentSong: { id: 's', title: 'Song title', artist: 'Artist', requester: { username: 'viewer' } } } };
const imgs = path.join(pluginDir, 'imgs');
fs.rmSync(imgs, { recursive: true, force: true });
fs.mkdirSync(path.join(imgs, 'actions'), { recursive: true });
const write = (file, content) => fs.writeFileSync(path.join(imgs, file), content);
for (const action of ACTIONS) write(`actions/${action.id}.svg`, renderKey(action.id, sampleState, { online: true }));
write('actions/volume-dial.svg', renderKey('volume-up', sampleState, { online: true }));
// Stream Deck requires PNG for these two (with @2x variants).
for (const [name, size] of [['plugin-icon', 256], ['category-icon', 28]]) {
  write(`${name}.png`, brandPng(size));
  write(`${name}@2x.png`, brandPng(size * 2));
}

// 4. Manifest.
const keyAction = action => ({
  Name: action.name,
  UUID: `${PLUGIN_UUID}.${action.id}`,
  Icon: `imgs/actions/${action.id}`,
  Tooltip: action.name,
  Controllers: ['Keypad'],
  UserTitleEnabled: false,
  States: [{ Image: `imgs/actions/${action.id}`, ShowTitle: false }]
});
const manifest = {
  $schema: 'https://schemas.elgato.com/streamdeck/plugins/manifest.json',
  Name: 'Twitch Music Bot',
  Version: `${pkg.version}.0`,
  Author: 'Twitch Music Bot',
  Description: 'Control the Twitch song-request music bot: playback, queue moderation and request switches.',
  UUID: PLUGIN_UUID,
  Icon: 'imgs/plugin-icon',
  Category: 'Twitch Music Bot',
  CategoryIcon: 'imgs/category-icon',
  CodePath: 'bin/plugin.js',
  Nodejs: { Version: '20', Debug: 'enabled' },
  OS: [{ Platform: 'windows', MinimumVersion: '10' }, { Platform: 'mac', MinimumVersion: '12' }],
  SDKVersion: 3,
  // The SDK's default settings behavior needs 7.1; with a lower value the plugin crashes while connecting.
  Software: { MinimumVersion: '7.1' },
  Actions: [
    ...ACTIONS.map(keyAction),
    {
      Name: 'Volume dial',
      UUID: `${PLUGIN_UUID}.volume-dial`,
      Icon: 'imgs/actions/volume-dial',
      Tooltip: 'Turn to change the volume, press to mute (Stream Deck +)',
      Controllers: ['Encoder'],
      Encoder: { layout: '$B1', TriggerDescription: { Rotate: 'Volume', Push: 'Mute / unmute' } },
      States: [{ Image: 'imgs/actions/volume-dial' }]
    }
  ]
};
fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${manifest.Actions.length} actions into ${path.relative(process.cwd(), pluginDir) || pluginDir}`);
