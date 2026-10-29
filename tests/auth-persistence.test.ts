import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'auth-launch.ts');
const SYNTHETIC = /synthetic-(access|refresh)-\d+|synthetic-client-secret/;
const TEST_SECRET = 'synthetic-client-secret';

type Launch = {
  cwd: string; events: Array<{ t: string; valid?: boolean }>; unexpected: string[]; refreshCalls: number;
  oauth: { state: string; login?: string; error?: string }; tokenConfigured?: boolean; authError: string;
  crashed?: boolean; error?: string; saved?: boolean; saveError?: string;
};
type Options = { mode?: string; expiresIn?: number; secret?: string; omitRefresh?: boolean; cwd?: string };
type Workspace = { root: string; stateFile: string; data: string; cleanup: () => void };

function workspace(appType: 'public' | 'confidential' = 'public'): Workspace {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'auth-persistence-')));
  const stateFile = path.join(root, 'fake-twitch-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ appType, clientSecret: TEST_SECRET, seq: 0, access: {}, refresh: {}, refreshCalls: 0 }));
  fs.mkdirSync(path.join(root, 'app'));
  return { root, stateFile, data: path.join(root, 'app', 'data'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function childEnvironment(ws: Workspace, command: string, options: Options): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (/^(TWITCH_|YTMDA_|SPOTIFY_)/.test(key)) delete env[key];
  Object.assign(env, { AUTH_CMD: command, FAKE_TWITCH_STATE: ws.stateFile, FAKE_MODE: options.mode || 'ok', FAKE_EXPIRES_IN: String(options.expiresIn ?? 14400) });
  if (options.secret) env.LOGIN_SECRET = options.secret;
  if (options.omitRefresh) env.FAKE_OMIT_REFRESH = '1';
  return env;
}

function parse(output: string, stderr: string): Launch {
  const line = output.split(/\r?\n/).find(item => item.startsWith('RESULT:'));
  assert.ok(line, `launch produced no result\n${stderr.slice(-800)}`);
  return JSON.parse(line.slice('RESULT:'.length)) as Launch;
}

// Every launch is a separate OS process with its own working directory,
// like the application being quit and started again.
function launch(ws: Workspace, command: string, options: Options = {}): Launch {
  const result = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', fixture], {
    cwd: options.cwd || path.join(ws.root, 'app'), env: childEnvironment(ws, command, options), encoding: 'utf8', timeout: 90_000
  });
  const parsed = parse(result.stdout || '', result.stderr || '');
  assert.equal(parsed.crashed, undefined, `launch crashed: ${parsed.error}`);
  assert.deepEqual(parsed.unexpected, [], 'unexpected network call');
  assert.doesNotMatch(JSON.stringify(parsed), SYNTHETIC, 'launch output must not contain credentials');
  return parsed;
}

const sha = (file: string) => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'missing';
const authFiles = (ws: Workspace) => ({ secrets: sha(path.join(ws.data, 'secrets.json')), backup: sha(path.join(ws.data, 'secrets.json.backup')), key: sha(path.join(ws.data, '.secret-key')) });
const connects = (result: Launch) => result.events.filter(event => event.t === 'connect');
const siblings = (ws: Workspace, prefix: string) => fs.readdirSync(ws.data).filter(name => name.startsWith(prefix));

test('A: a stored, unexpired token is restored after a restart without contacting Twitch', () => {
  const ws = workspace();
  try {
    assert.equal(launch(ws, 'login').oauth.state, 'connected');
    launch(ws, 'settings');
    const boot = launch(ws, 'boot');
    assert.equal(boot.refreshCalls, 0);
    assert.equal(boot.oauth.state, 'connected');
    assert.equal(boot.oauth.login, 'synthetic_bot');
    assert.equal(boot.tokenConfigured, true);
    assert.equal(boot.authError, '');
    assert.deepEqual(connects(boot), [{ t: 'connect', valid: true }]);
    assert.equal(launch(ws, 'boot').refreshCalls, 0);
  } finally { ws.cleanup(); }
});

test('B/E: an expiring token is renewed before the single chat connection is made', () => {
  const ws = workspace();
  try {
    launch(ws, 'login', { expiresIn: 60 });
    const boot = launch(ws, 'boot');
    assert.deepEqual(boot.events, [{ t: 'refresh' }, { t: 'connect', valid: true }]);
    assert.equal(boot.oauth.state, 'connected');
  } finally { ws.cleanup(); }
});

test('C: a rotated refresh token survives further restarts and is never stored in plaintext', () => {
  const ws = workspace();
  try {
    launch(ws, 'login', { expiresIn: 60 });
    assert.equal(launch(ws, 'boot', { expiresIn: 60 }).oauth.state, 'connected');
    assert.equal(launch(ws, 'boot', { expiresIn: 14400 }).oauth.state, 'connected');
    const last = launch(ws, 'boot');
    assert.equal(last.refreshCalls, 2);
    assert.deepEqual(connects(last), [{ t: 'connect', valid: true }]);
    for (const file of fs.readdirSync(ws.data)) {
      const full = path.join(ws.data, file);
      if (fs.statSync(full).isFile()) assert.doesNotMatch(fs.readFileSync(full, 'latin1'), SYNTHETIC, `${file} leaks a credential`);
    }
  } finally { ws.cleanup(); }
});

test('C: a renewal response without a new refresh token keeps the stored refresh token', () => {
  const ws = workspace();
  try {
    launch(ws, 'login', { expiresIn: 60 });
    assert.equal(launch(ws, 'boot', { expiresIn: 60, omitRefresh: true }).oauth.state, 'connected');
    const again = launch(ws, 'boot', { expiresIn: 60, omitRefresh: true });
    assert.equal(again.oauth.state, 'connected');
    assert.deepEqual(again.events, [{ t: 'refresh' }, { t: 'connect', valid: true }]);
  } finally { ws.cleanup(); }
});

test('D: a confidential app keeps its client secret across restarts and uses it for every renewal', () => {
  const ws = workspace('confidential');
  try {
    launch(ws, 'login', { expiresIn: 60, secret: TEST_SECRET });
    assert.equal(launch(ws, 'boot', { expiresIn: 60 }).oauth.state, 'connected');
    const second = launch(ws, 'boot', { expiresIn: 60 });
    assert.equal(second.oauth.state, 'connected');
    assert.deepEqual(second.events, [{ t: 'refresh' }, { t: 'connect', valid: true }]);
  } finally { ws.cleanup(); }
});

test('D: a confidential login without a secret is recoverable and the later secret persists', () => {
  const ws = workspace('confidential');
  try {
    launch(ws, 'login', { expiresIn: 60 });
    const before = authFiles(ws);
    const failed = launch(ws, 'boot', { expiresIn: 60 });
    assert.equal(failed.oauth.state, 'error');
    assert.match(failed.oauth.error || '', /Client Secret/i);
    assert.deepEqual(authFiles(ws), before, 'the stored credentials must not change');
    assert.equal(launch(ws, 'resume', { expiresIn: 60, secret: TEST_SECRET }).oauth.state, 'connected');
    const restored = launch(ws, 'boot', { expiresIn: 60 });
    assert.equal(restored.oauth.state, 'connected');
    assert.deepEqual(connects(restored), [{ t: 'connect', valid: true }]);
  } finally { ws.cleanup(); }
});

test('E: an expired token is never used for chat while renewal is failing, and chat connects once renewal works', () => {
  const ws = workspace();
  try {
    launch(ws, 'login');
    launch(ws, 'expire');
    const result = launch(ws, 'recover', { mode: 'unavailable' });
    assert.deepEqual(result.events, [{ t: 'refresh' }, { t: 'refresh' }, { t: 'connect', valid: true }]);
  } finally { ws.cleanup(); }
});

for (const mode of ['network', 'unavailable']) {
  test(`G: a temporary Twitch failure (${mode}) keeps the stored credentials and does not demand a new login`, () => {
    const ws = workspace();
    try {
      launch(ws, 'login', { expiresIn: 60 });
      const before = authFiles(ws);
      const failed = launch(ws, 'boot', { mode, expiresIn: 60 });
      assert.notEqual(failed.oauth.state, 'error');
      assert.equal(failed.tokenConfigured, true);
      assert.deepEqual(authFiles(ws), before);
      assert.deepEqual(connects(failed), [{ t: 'connect', valid: true }]);
      const healed = launch(ws, 'boot');
      assert.equal(healed.oauth.state, 'connected');
      assert.deepEqual(connects(healed), [{ t: 'connect', valid: true }]);
    } finally { ws.cleanup(); }
  });
}

test('G: an expired token plus a temporary failure keeps the credentials and renews on the next launch', () => {
  const ws = workspace();
  try {
    launch(ws, 'login');
    launch(ws, 'expire');
    const before = authFiles(ws);
    const failed = launch(ws, 'boot', { mode: 'network' });
    assert.notEqual(failed.oauth.state, 'error');
    assert.deepEqual(connects(failed), []);
    assert.deepEqual(authFiles(ws), before);
    const healed = launch(ws, 'boot');
    assert.deepEqual(healed.events, [{ t: 'refresh' }, { t: 'connect', valid: true }]);
  } finally { ws.cleanup(); }
});

test('G: a definitively rejected refresh token is reported but the stored files are left alone', () => {
  const ws = workspace();
  try {
    launch(ws, 'login', { expiresIn: 60 });
    const state = JSON.parse(fs.readFileSync(ws.stateFile, 'utf8'));
    state.refresh = {};
    fs.writeFileSync(ws.stateFile, JSON.stringify(state));
    const before = authFiles(ws);
    const failed = launch(ws, 'boot', { expiresIn: 60 });
    assert.equal(failed.oauth.state, 'error');
    assert.ok(failed.oauth.error);
    assert.deepEqual(authFiles(ws), before);
  } finally { ws.cleanup(); }
});

function assertExplicitStorageError(result: Launch) {
  assert.equal(result.oauth.state, 'error');
  assert.match(result.oauth.error || '', /secret-key|encryption key|decrypt|read|Schlüssel/i);
  assert.deepEqual(connects(result), []);
}

const damages: Array<[string, (ws: Workspace) => void]> = [
  ['the encryption key is missing', ws => fs.rmSync(path.join(ws.data, '.secret-key'))],
  ['the encryption key is truncated', ws => fs.writeFileSync(path.join(ws.data, '.secret-key'), crypto.randomBytes(10))],
  ['the encryption key belongs to a different store', ws => fs.writeFileSync(path.join(ws.data, '.secret-key'), crypto.randomBytes(32))]
];
for (const [name, damage] of damages) {
  test(`F: when ${name} the failure is explicit and the original files are not modified`, () => {
    const ws = workspace();
    try {
      launch(ws, 'login');
      damage(ws);
      const before = authFiles(ws);
      assertExplicitStorageError(launch(ws, 'boot'));
      assertExplicitStorageError(launch(ws, 'boot'));
      assert.deepEqual(authFiles(ws), before);
      const saved = launch(ws, 'save-secret');
      assert.equal(saved.saved, false);
      assert.deepEqual(authFiles(ws), before);
    } finally { ws.cleanup(); }
  });
}

test('F: a damaged secrets.json is recovered from its backup without touching the damaged original', () => {
  const ws = workspace();
  try {
    launch(ws, 'login');
    const file = path.join(ws.data, 'secrets.json');
    fs.writeFileSync(file, fs.readFileSync(file).subarray(0, 40));
    const damaged = sha(file);
    const boot = launch(ws, 'boot');
    assert.equal(boot.oauth.state, 'connected');
    assert.deepEqual(boot.events, [{ t: 'refresh' }, { t: 'connect', valid: true }]);
    const preserved = siblings(ws, 'secrets.json.corrupt-');
    assert.equal(preserved.length, 1);
    assert.equal(sha(path.join(ws.data, preserved[0])), damaged);
    assert.equal(launch(ws, 'boot').oauth.state, 'connected');
  } finally { ws.cleanup(); }
});

test('F: unreadable credentials block silent overwrites and only an explicit new login archives them', () => {
  const ws = workspace();
  try {
    launch(ws, 'login');
    fs.writeFileSync(path.join(ws.data, 'secrets.json'), '{ not json');
    fs.writeFileSync(path.join(ws.data, 'secrets.json.backup'), '{ not json either');
    const before = authFiles(ws);
    assertExplicitStorageError(launch(ws, 'boot'));
    assert.equal(launch(ws, 'save-secret').saved, false);
    assert.deepEqual(authFiles(ws), before);
    assert.equal(launch(ws, 'login').oauth.state, 'connected');
    const archived = siblings(ws, 'secrets.json.unrecoverable-');
    assert.equal(archived.length, 1);
    assert.equal(sha(path.join(ws.data, archived[0])), before.secrets);
    assert.equal(launch(ws, 'boot').oauth.state, 'connected');
  } finally { ws.cleanup(); }
});

test('F: a first start without any stored credentials is idle, creates no key and raises no error', () => {
  const ws = workspace();
  try {
    const boot = launch(ws, 'boot');
    assert.equal(boot.oauth.state, 'idle');
    assert.equal(boot.authError, '');
    assert.equal(fs.existsSync(path.join(ws.data, '.secret-key')), false);
  } finally { ws.cleanup(); }
});

// The Windows standalone build starts the server through scripts/start.cjs and
// the desktop through resources/app/bootstrap.cjs. The scripts below are the
// exact strings the build writes into the package.
function portablePackage(ws: Workspace) {
  const { PORTABLE_START_SCRIPT, PORTABLE_BOOTSTRAP_SCRIPT } = require('../scripts/build-standalone.cjs');
  const portable = path.join(ws.root, 'Portable');
  fs.mkdirSync(path.join(portable, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(portable, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(portable, 'resources', 'app'), { recursive: true });
  fs.writeFileSync(path.join(portable, 'scripts', 'start.cjs'), PORTABLE_START_SCRIPT);
  fs.writeFileSync(path.join(portable, 'resources', 'app', 'bootstrap.cjs'), PORTABLE_BOOTSTRAP_SCRIPT);
  buildSync({ absWorkingDir: repoRoot, entryPoints: [fixture], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: path.join(portable, 'dist', 'server.cjs'), logLevel: 'silent' });
  return portable;
}

function standaloneLaunch(ws: Workspace, portable: string, command: string, options: Options & { viaLauncherOptions?: boolean }): Launch {
  const { launchOptions } = require('../scripts/portable-launcher.cjs');
  const real = launchOptions(portable, {});
  const env = { ...real.env, ...childEnvironment(ws, command, options), NODE_PATH: path.join(repoRoot, 'node_modules') };
  const cwd = options.viaLauncherOptions ? real.cwd : options.cwd;
  const result = spawnSync(process.execPath, ['--no-warnings', ...real.args], { cwd, env, encoding: 'utf8', timeout: 90_000 });
  return parse(result.stdout || '', result.stderr || '');
}

test('standalone: server launches from the launcher contract and from an unrelated directory share one data directory', () => {
  const ws = workspace();
  try {
    const portable = portablePackage(ws);
    const elsewhere = path.join(ws.root, 'somewhere-else');
    const elsewhereToo = path.join(ws.root, 'another-place');
    fs.mkdirSync(elsewhere); fs.mkdirSync(elsewhereToo);
    const first = standaloneLaunch(ws, portable, 'login', { viaLauncherOptions: true, expiresIn: 60 });
    assert.equal(first.oauth.state, 'connected');
    const second = standaloneLaunch(ws, portable, 'boot', { cwd: elsewhere, expiresIn: 60 });
    const third = standaloneLaunch(ws, portable, 'boot', { cwd: elsewhereToo, expiresIn: 14400 });
    for (const result of [first, second, third]) assert.equal(fs.realpathSync.native(result.cwd), fs.realpathSync.native(portable));
    assert.deepEqual(second.events, [{ t: 'refresh' }, { t: 'connect', valid: true }]);
    assert.equal(third.oauth.state, 'connected');
    assert.deepEqual(connects(third), [{ t: 'connect', valid: true }]);
    assert.ok(fs.existsSync(path.join(portable, 'data', 'secrets.json')));
    assert.ok(fs.existsSync(path.join(portable, 'data', '.secret-key')));
    assert.equal(fs.existsSync(path.join(elsewhere, 'data')), false);
    assert.equal(fs.existsSync(path.join(elsewhereToo, 'data')), false);
  } finally { ws.cleanup(); }
});

test('standalone: the desktop bootstrap pins the working directory to the package folder', () => {
  const ws = workspace();
  try {
    const portable = portablePackage(ws);
    const probe = path.join(ws.root, 'cwd-probe.txt');
    fs.writeFileSync(path.join(portable, 'scripts', 'portable-launcher.cjs'), `module.exports = { startPortable(root) { require('node:fs').writeFileSync(${JSON.stringify(probe)}, process.cwd() + '\\n' + root); } };`);
    const elsewhere = path.join(ws.root, 'desktop-shortcut-start-in');
    fs.mkdirSync(elsewhere);
    const result = spawnSync(process.execPath, [path.join(portable, 'resources', 'app', 'bootstrap.cjs')], { cwd: elsewhere, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const [cwd, root] = fs.readFileSync(probe, 'utf8').split('\n');
    assert.equal(fs.realpathSync.native(cwd), fs.realpathSync.native(portable));
    assert.equal(fs.realpathSync.native(root), fs.realpathSync.native(portable));
  } finally { ws.cleanup(); }
});
