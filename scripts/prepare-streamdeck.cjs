// Puts the packaged Stream Deck plugin where the bot can offer it: <outDir>/streamdeck/.
//
//   node scripts/prepare-streamdeck.cjs            copy an already packed plugin into dist/ (fast, used by `npm run build`)
//   node scripts/prepare-streamdeck.cjs --pack     build and pack the plugin first (slow; used by the standalone build)
//   node scripts/prepare-streamdeck.cjs [--pack] <outDir>
//
// The plugin is optional: any problem is reported as a warning and never fails the bot's own build.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PLUGIN_FILE = 'com.twitchmusicbot.streamDeckPlugin';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpm(args, cwd) {
  const result = spawnSync(npm, args, { cwd, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32', env: { ...process.env, FORCE_COLOR: '0' } });
  if (result.error || result.status !== 0) throw new Error(`npm ${args.join(' ')} failed: ${result.error ? result.error.message : (result.stderr || result.stdout || '').trim().split(/\r?\n/).slice(-6).join('\n')}`);
}

/** Builds and packs the plugin (installing its dependencies first when they are missing). */
function packPlugin(pluginDir) {
  if (!fs.existsSync(path.join(pluginDir, 'node_modules'))) runNpm(['ci', '--no-audit', '--no-fund'], pluginDir);
  runNpm(['run', 'pack'], pluginDir);
}

/**
 * @param {{ root: string, outDir: string, pack?: boolean, packPlugin?: (pluginDir: string) => void, log?: (message: string) => void }} options
 * @returns {boolean} true when the plugin is now available in outDir/streamdeck
 */
function prepare({ root, outDir, pack = false, packPlugin: packer = packPlugin, log = console.warn }) {
  const pluginDir = path.join(root, 'streamdeck-plugin');
  const release = path.join(pluginDir, 'release', PLUGIN_FILE);
  const manifest = path.join(pluginDir, 'com.twitchmusicbot.sdPlugin', 'manifest.json');
  try {
    if (!fs.existsSync(pluginDir)) return false;
    if (pack) packer(pluginDir);
    if (!fs.existsSync(release) || !fs.existsSync(manifest)) return false; // not packed yet: nothing to offer
    const version = JSON.parse(fs.readFileSync(manifest, 'utf8')).Version;
    if (typeof version !== 'string' || !version) throw new Error('The plugin manifest has no version.');
    const target = path.join(outDir, 'streamdeck');
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(release, path.join(target, PLUGIN_FILE));
    fs.writeFileSync(path.join(target, 'info.json'), JSON.stringify({ version, file: PLUGIN_FILE }, null, 2) + '\n');
    return true;
  } catch (error) {
    log(`Stream-Deck-Plugin wurde nicht bereitgestellt: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

module.exports = { prepare, PLUGIN_FILE };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = path.resolve(__dirname, '..');
  const outDir = path.resolve(root, args.find(arg => !arg.startsWith('--')) || 'dist');
  const ok = prepare({ root, outDir, pack: args.includes('--pack') });
  console.log(ok ? `Stream-Deck-Plugin bereitgestellt: ${path.relative(root, path.join(outDir, 'streamdeck')) || outDir}` : 'Stream-Deck-Plugin: nicht bereitgestellt (optional).');
}
