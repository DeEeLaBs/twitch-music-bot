import test, { beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigService } from '../src/server/configService.ts';
import { SecureTokenStore } from '../src/server/secureTokenStore.ts';
import assert from 'node:assert/strict';
import { TwitchOAuthService } from '../src/server/twitchOAuthService.ts';
import type { BotConfig } from '../src/types.ts';

let originalCwd: string;
let testDirectory: string;
beforeEach(() => {
  originalCwd = process.cwd();
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'twitch-login-test-'));
  process.chdir(testDirectory);
});
afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('Twitch device login requests the required permissions and never a client secret', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = '';
  globalThis.fetch = async (_url, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ device_code:'device-secret', user_code:'ABCD1234', verification_uri:'https://www.twitch.tv/activate', expires_in:1800, interval:5 }), { status:200 });
  };
  try {
    const service = new TwitchOAuthService(() => ({}) as BotConfig, () => {});
    const status = await service.start('abcdefghijklmnop');
    assert.equal(status.state, 'pending');
    assert.equal(status.userCode, 'ABCD1234');
    assert.match(requestBody, /channel%3Aread%3Aredemptions/);
    assert.match(requestBody, /chat%3Aread/);
    assert.doesNotMatch(requestBody, /client_secret/);
    assert.equal(JSON.stringify(status).includes('device-secret'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('Twitch device login rejects an unexpected confirmation origin', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ device_code:'x', user_code:'ABCD1234', verification_uri:'https://evil.example/activate' }), { status:200 });
  try {
    const service = new TwitchOAuthService(() => ({}) as BotConfig, () => {});
    await assert.rejects(service.start('abcdefghijklmnop'), /ungültige Bestätigungsadresse/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Twitch device login retries a transient network failure', async t => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    if (attempts === 1) throw new TypeError('fetch failed');
    return Response.json({ device_code:'device-secret', user_code:'ABCD1234', verification_uri:'https://www.twitch.tv/activate', expires_in:1800, interval:5 });
  });
  const service = new TwitchOAuthService(() => ({ language:'en' }) as BotConfig, () => {});
  assert.equal((await service.start('abcdefghijklmnop')).state, 'pending');
  assert.equal(attempts, 2);
});

test('Twitch device login reports repeated network failures in the selected language', async t => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => { attempts++; throw new TypeError('fetch failed'); });
  const service = new TwitchOAuthService(() => ({ language:'de' }) as BotConfig, () => {});
  await assert.rejects(service.start('abcdefghijklmnop'), /Twitch ist nicht erreichbar/);
  assert.equal(attempts, 2);
});

test('TwitchOAuthService reports connected status when credentials are configured', async () => {
  const service = new TwitchOAuthService(() => ({ twitchBotUsername: 'streamer_bot' }) as BotConfig, () => {});
  (service as any).secrets.set('twitchBotOauthToken', 'oauth:sampletoken12345');
  try {
    const status = service.status();
    assert.equal(status.state, 'connected');
    assert.equal(status.login, 'streamer_bot');
  } finally {
    (service as any).secrets.set('twitchBotOauthToken', '');
  }
});

test('TwitchOAuthService updates state to error when token refresh fails', async t => {
  t.mock.method(globalThis, 'fetch', async () => {
    return Response.json({ status: 400, message: 'missing client secret' }, { status: 400 });
  });
  const service = new TwitchOAuthService(() => ({ twitchClientId: 'client12345', language: 'de' }) as BotConfig, () => {});
  (service as any).secrets.set('twitchRefreshToken', 'refresh12345');
  try {
    await assert.rejects(service.forceRefresh(), /Client-Secret/);
    assert.equal(service.status().state, 'error');
    assert.match(service.status().error || '', /Client-Secret/);
  } finally {
    (service as any).secrets.set('twitchRefreshToken', '');
  }
});


test('separate token stores preserve Twitch credentials when another provider saves', () => {
  const twitch = new SecureTokenStore();
  const spotify = new SecureTokenStore();
  assert.equal(spotify.get('spotifyRefreshToken'), '');
  twitch.set('twitchRefreshToken', 'twitch-refresh');
  twitch.set('twitchBotOauthToken', 'twitch-access');
  spotify.set('spotifyRefreshToken', 'spotify-refresh');
  const restarted = new SecureTokenStore();
  assert.equal(restarted.get('twitchRefreshToken'), 'twitch-refresh');
  assert.equal(restarted.get('twitchBotOauthToken'), 'twitch-access');
  assert.equal(twitch.get('spotifyRefreshToken'), 'spotify-refresh');
  spotify.set('spotifyRefreshToken', '');
  assert.equal(new SecureTokenStore().get('twitchRefreshToken'), 'twitch-refresh');
});

test('Twitch device login survives config saves, restart and automatic token renewal', async t => {
  const config = new ConfigService();
  const makeService = (currentConfig: ConfigService) => new TwitchOAuthService(
    () => currentConfig.get(),
    (token, clientId, login) => { currentConfig.update({ twitchBotOauthToken: token, twitchClientId: clientId, twitchBotUsername: login }); }
  );
  const service = makeService(config);
  // An existing provider instance has already read the shared secrets file.
  const otherProvider = new SecureTokenStore();
  otherProvider.get('spotifyRefreshToken');
  const scopes = ['chat:read', 'chat:edit', 'channel:read:redemptions', 'channel:manage:redemptions', 'moderator:read:followers', 'channel:read:subscriptions', 'bits:read'];
  let refreshes = 0;
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    if (String(url).endsWith('/device')) return Response.json({ device_code: 'device', user_code: 'CODE', verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 5 });
    if (String(url).endsWith('/validate')) return Response.json({ client_id: 'abcdefghijklmnop', login: 'remembered_bot', scopes });
    const body = new URLSearchParams(init.body);
    if (body.get('grant_type') === 'refresh_token') {
      refreshes++;
      assert.equal(body.get('refresh_token'), 'refresh-original');
      return Response.json({ access_token: 'access-renewed', refresh_token: 'refresh-renewed', expires_in: 3600 });
    }
    return Response.json({ access_token: 'access-original', refresh_token: 'refresh-original', expires_in: 60 });
  });
  await service.start('abcdefghijklmnop');
  (service as any).nextPollAt = 0;
  assert.equal((await service.poll()).state, 'connected');
  otherProvider.set('spotifyRefreshToken', 'spotify-token');
  const restartedConfig = new ConfigService();
  const restartedService = makeService(restartedConfig);
  assert.equal(restartedConfig.get().twitchBotOauthToken, 'access-original');
  assert.equal(restartedService.status().state, 'connected');
  await restartedService.refreshIfNeeded();
  assert.equal(refreshes, 1);
  const restoredConfig = new ConfigService();
  assert.equal(restoredConfig.get().twitchBotOauthToken, 'access-renewed');
  assert.equal(new SecureTokenStore().get('twitchRefreshToken'), 'refresh-renewed');
  assert.equal(new SecureTokenStore().get('spotifyRefreshToken'), 'spotify-token');
  assert.equal(makeService(restoredConfig).status().login, 'remembered_bot');
});

test('successful Twitch renewal clears a previous refresh error', async t => {
  const service = new TwitchOAuthService(() => ({ twitchClientId: 'abcdefghijklmnop', twitchBotUsername: 'remembered_bot' }) as BotConfig, () => {});
  (service as any).secrets.set('twitchRefreshToken', 'renewable-token');
  let reject = true;
  t.mock.method(globalThis, 'fetch', async () => reject
    ? Response.json({ message: 'temporarily unavailable' }, { status: 400 })
    : Response.json({ access_token: 'renewed-access', refresh_token: 'renewed-refresh', expires_in: 3600 }));
  await assert.rejects(service.forceRefresh(), /temporarily unavailable/);
  assert.equal(service.status().state, 'error');
  reject = false;
  await service.forceRefresh();
  assert.equal(service.status().state, 'connected');
  assert.equal(service.status().login, 'remembered_bot');
  assert.equal(service.status().error, undefined);
});

test('confidential Twitch login can recover with a secret without reauthorization and survives restart', async t => {
  const config = new ConfigService();
  config.update({ twitchClientId: 'abcdefghijklmnop', twitchBotUsername: 'saved_bot', twitchBotOauthToken: 'old-access' });
  new SecureTokenStore().set('twitchRefreshToken', 'saved-refresh');
  const make = (cfg: ConfigService) => new TwitchOAuthService(() => cfg.get(), (token, clientId, login) => { cfg.update({ twitchBotOauthToken: token, twitchClientId: clientId, twitchBotUsername: login }); });
  const service = make(config);
  service.setAuthError('missing client secret');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    assert.equal(String(url), 'https://id.twitch.tv/oauth2/token');
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('client_secret'), 'private-secret');
    assert.equal(body.get('refresh_token'), calls++ === 0 ? 'saved-refresh' : 'rotated-refresh');
    return Response.json({ access_token: 'new-access', refresh_token: 'rotated-refresh', expires_in: 3600 });
  });
  assert.equal((await service.resume(' private-secret ')).state, 'connected');
  const restored = new ConfigService();
  assert.equal(restored.get().twitchClientSecret, 'private-secret');
  await make(restored).forceRefresh();
  assert.equal(calls, 2);
});

test('resuming Twitch without renewable credentials does not claim success or store a secret', async () => {
  const service = new TwitchOAuthService(() => ({ twitchClientId: 'abcdefghijklmnop' }) as BotConfig, () => {});
  await assert.rejects(service.resume('private-secret'), /erneut|again/);
  assert.equal(new SecureTokenStore().get('twitchClientSecret'), '');
});
