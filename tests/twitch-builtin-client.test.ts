import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigService } from '../src/server/configService.ts';
import { ChannelPointsService } from '../src/server/channelPointsService.ts';
import { builtInTwitchClientId, isBuiltInTwitchClientId } from '../src/server/twitchApp.ts';
import type { BotConfig } from '../src/types.ts';

const BUILT_IN = 'builtinclientid0123456789abcdef';
const CUSTOM = 'customclientid0123456789abcdefgh';
let directory = '';
let originalCwd = '';
let originalEnv: string | undefined;

beforeEach(() => {
  originalCwd = process.cwd();
  originalEnv = process.env.MUSICBOT_TWITCH_CLIENT_ID;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-client-'));
  process.chdir(directory);
});
afterEach(() => {
  process.chdir(originalCwd);
  if (originalEnv === undefined) delete process.env.MUSICBOT_TWITCH_CLIENT_ID; else process.env.MUSICBOT_TWITCH_CLIENT_ID = originalEnv;
  fs.rmSync(directory, { recursive: true, force: true });
});

const savedConfig = () => fs.readFileSync(path.join(directory, 'data', 'bot-config.json'), 'utf8');

test('the bundled Client ID is used without an environment override', () => {
  delete process.env.MUSICBOT_TWITCH_CLIENT_ID;
  const config = new ConfigService();
  assert.equal(config.get().twitchClientId, builtInTwitchClientId());
  assert.equal(isBuiltInTwitchClientId(''), false);
});

test('the built-in Client ID is used when none is configured, and stays pinned once saved', () => {
  process.env.MUSICBOT_TWITCH_CLIENT_ID = BUILT_IN;
  const config = new ConfigService();
  assert.equal(config.get().twitchClientId, BUILT_IN);
  assert.equal(isBuiltInTwitchClientId(config.get().twitchClientId), true);
  config.update({ language: 'de' });
  // Twitch refresh tokens belong to the app that issued them, so a later release changing the
  // built-in ID must not silently switch an existing installation to a different app.
  process.env.MUSICBOT_TWITCH_CLIENT_ID = 'anotherbuiltin0123456789abcdefgh';
  assert.equal(new ConfigService().get().twitchClientId, BUILT_IN);
  assert.equal(isBuiltInTwitchClientId(BUILT_IN), false);
  assert.match(savedConfig(), new RegExp(BUILT_IN));
});

test('a personal Twitch app still wins, survives restarts, and clearing it returns to the built-in app', () => {
  process.env.MUSICBOT_TWITCH_CLIENT_ID = BUILT_IN;
  const config = new ConfigService();
  config.update({ twitchClientId: CUSTOM });
  assert.equal(new ConfigService().get().twitchClientId, CUSTOM);
  assert.match(savedConfig(), new RegExp(CUSTOM));
  const restarted = new ConfigService();
  restarted.update({ twitchClientId: '' });
  assert.equal(restarted.get().twitchClientId, BUILT_IN);
  assert.equal(new ConfigService().get().twitchClientId, BUILT_IN);
});

test('an invalid built-in value is ignored instead of breaking logins', () => {
  process.env.MUSICBOT_TWITCH_CLIENT_ID = 'not valid!';
  assert.equal(builtInTwitchClientId(), '');
  assert.equal(new ConfigService().get().twitchClientId, '');
});

test('channel point requests use the Client ID of the token itself, not the configured default', async t => {
  const seen: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    const address = String(url);
    if (address.endsWith('/oauth2/validate')) return Response.json({ client_id: CUSTOM, user_id: '1', scopes: ['channel:read:redemptions'] });
    seen.push(String((init?.headers as Record<string, string>)['Client-Id']));
    if (address.includes('/helix/users')) return Response.json({ data: [{ id: '1', login: 'streamer', display_name: 'Streamer' }] });
    return Response.json({ data: [] });
  });
  await ChannelPointsService.listRewards({ twitchBotOauthToken: 'synthetic-token', twitchChannel: 'streamer', twitchClientId: BUILT_IN, language: 'en' } as BotConfig);
  assert.ok(seen.length >= 2);
  assert.deepEqual([...new Set(seen)], [CUSTOM]);
});

test('channel point loading retries a dropped Twitch connection', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    calls += 1;
    if (calls <= 2) {
      const error = new TypeError('fetch failed');
      (error as TypeError & { cause?: unknown }).cause = { code: 'ECONNRESET' };
      throw error;
    }
    const address = String(url);
    if (address.endsWith('/oauth2/validate')) return Response.json({ client_id: CUSTOM, user_id: '1', scopes: ['channel:read:redemptions'] });
    if (address.includes('/helix/users')) return Response.json({ data: [{ id: '1', login: 'streamer', display_name: 'Streamer' }] });
    return Response.json({ data: [{ id: 'reward', title: 'Song', cost: 100, is_enabled: true, is_user_input_required: true }] });
  });
  const result = await ChannelPointsService.listRewards({ twitchBotOauthToken: 'synthetic-token', twitchChannel: 'streamer', twitchClientId: BUILT_IN, language: 'de' } as BotConfig);
  assert.equal(result.rewards[0]?.id, 'reward');
  assert.equal(calls, 5);
});
