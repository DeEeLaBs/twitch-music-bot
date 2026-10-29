import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { BotError } from './errors.ts';

// The Stream Deck plugin ships inside the bot (dist/streamdeck/). The Stream Deck app only loads plugins
// through its own installer, so "installing" means opening the bundled .streamDeckPlugin file with it.

const PLUGIN_FOLDER = 'com.twitchmusicbot.sdPlugin';
const BUNDLE_FILE = /^[\w.-]+\.streamDeckPlugin$/;

export type StreamDeckState = 'not-bundled' | 'streamdeck-missing' | 'not-installed' | 'update-available' | 'up-to-date';
export interface StreamDeckStatus { state: StreamDeckState; bundledVersion: string | null; installedVersion: string | null }

export interface StreamDeckOptions {
  /** Folder holding the bundled plugin and its info.json. */
  bundleDir?: string;
  /** Stream Deck's plugins folder (null when it cannot be located). */
  pluginsDir?: string | null;
  /** Opens a file with its default application. Injectable for tests. */
  open?: (file: string) => Promise<void>;
}

export function defaultBundleDir(): string { return path.join(process.cwd(), 'dist', 'streamdeck'); }

export function pluginsDirectory(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string | null {
  if (platform === 'win32') return env.APPDATA ? path.join(env.APPDATA, 'Elgato', 'StreamDeck', 'Plugins') : null;
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'com.elgato.StreamDeck', 'Plugins');
  return null; // Stream Deck has no Linux build
}

/** Numeric, segment-wise comparison ("1.10" > "1.9"). An unparsable version counts as older than any valid one. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => /^\d+(\.\d+)*$/.test(value.trim()) ? value.trim().split('.').map(Number) : null;
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return left ? 1 : right ? -1 : 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function readBundle(bundleDir: string): { file: string; version: string } | null {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(bundleDir, 'info.json'), 'utf8')) as { file?: unknown; version?: unknown };
    if (typeof info.file !== 'string' || !BUNDLE_FILE.test(info.file) || typeof info.version !== 'string' || !info.version) return null;
    const file = path.join(bundleDir, info.file);
    return fs.statSync(file).isFile() ? { file, version: info.version } : null;
  } catch { return null; }
}

function installedVersion(pluginsDir: string): string | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginsDir, PLUGIN_FOLDER, 'manifest.json'), 'utf8')) as { Version?: unknown };
    return typeof manifest.Version === 'string' ? manifest.Version : null;
  } catch { return null; }
}

export function streamDeckStatus(options: StreamDeckOptions = {}): StreamDeckStatus {
  const bundle = readBundle(options.bundleDir ?? defaultBundleDir());
  if (!bundle) return { state: 'not-bundled', bundledVersion: null, installedVersion: null };
  const pluginsDir = options.pluginsDir === undefined ? pluginsDirectory() : options.pluginsDir;
  if (!pluginsDir || !fs.existsSync(pluginsDir)) return { state: 'streamdeck-missing', bundledVersion: bundle.version, installedVersion: null };
  if (!fs.existsSync(path.join(pluginsDir, PLUGIN_FOLDER))) return { state: 'not-installed', bundledVersion: bundle.version, installedVersion: null };
  const installed = installedVersion(pluginsDir);
  const upToDate = installed !== null && compareVersions(installed, bundle.version) >= 0;
  return { state: upToDate ? 'up-to-date' : 'update-available', bundledVersion: bundle.version, installedVersion: installed };
}

function openWithDefaultApp(file: string): Promise<void> {
  const [command, args]: [string, string[]] = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', file]]
    : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

/** Hands the bundled plugin to the Stream Deck app, which shows its own "Install plugin?" prompt. */
export async function installStreamDeckPlugin(options: StreamDeckOptions = {}): Promise<void> {
  const bundle = readBundle(options.bundleDir ?? defaultBundleDir());
  if (!bundle) throw new BotError('NOT_FOUND', 'Das Stream-Deck-Plugin ist in dieser Version nicht enthalten.', 404);
  try { await (options.open ?? openWithDefaultApp)(bundle.file); }
  catch (error) { throw new BotError('UPSTREAM_UNAVAILABLE', error instanceof Error ? error.message : String(error), 502); }
}
