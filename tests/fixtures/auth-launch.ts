import fs from 'node:fs';
import { botService } from '../../src/server/botService.ts';
import { SecureTokenStore } from '../../src/server/secureTokenStore.ts';
import { TwitchBot } from '../../src/server/twitchBot.ts';
import { YtmCompanionClient } from '../../src/server/ytmCompanion.ts';
import { SpotifyService } from '../../src/server/spotifyService.ts';

// One simulated application launch. The parent test chooses the working
// directory, so every launch is a real process with its own memory.
// Twitch is a mocked fetch whose state lives in a file shared between launches,
// and chat connections are recorded instead of opened. All credentials are synthetic.

type FakeState = {
  appType: 'public' | 'confidential';
  clientSecret: string;
  seq: number;
  access: Record<string, number>;
  refresh: Record<string, true>;
  refreshCalls: number;
};

const stateFile = String(process.env.FAKE_TWITCH_STATE);
const fake: FakeState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const saveFake = () => fs.writeFileSync(stateFile, JSON.stringify(fake));
const events: Array<Record<string, unknown>> = [];
const unexpected: string[] = [];
let mode = process.env.FAKE_MODE || 'ok';
const expiresIn = Number(process.env.FAKE_EXPIRES_IN || 14400);
const SCOPES = ['chat:read', 'chat:edit', 'channel:read:redemptions', 'channel:manage:redemptions', 'moderator:read:followers', 'channel:read:subscriptions', 'bits:read'];
const json = (body: unknown, status = 200) => Response.json(body, { status });

function issue() {
  const n = ++fake.seq;
  const access = `synthetic-access-${n}`;
  const refresh = `synthetic-refresh-${n}`;
  fake.access[access] = Date.now() + expiresIn * 1000;
  fake.refresh[refresh] = true;
  return { access, refresh };
}

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = String(input);
  const body = new URLSearchParams(String(init?.body || ''));
  // Dashboard decoration is unrelated to the authentication contract.
  if (url === 'https://7tv.io/v3/emote-sets/global' ||
      url === 'https://api.betterttv.net/3/cached/emotes/global' ||
      url === 'https://api.frankerfacez.com/v1/set/global') return json({});
  if (url.startsWith('https://api.twitch.tv/helix/users?')) return json({ data: [] });
  if (url.endsWith('/oauth2/device')) {
    return json({ device_code: 'synthetic-device', user_code: 'ABCD1234', verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 5 });
  }
  if (url.endsWith('/oauth2/validate')) {
    const token = String((init?.headers as Record<string, string>)?.Authorization || '').replace('OAuth ', '');
    if (!(fake.access[token] > Date.now())) return json({ status: 401, message: 'invalid access token' }, 401);
    return json({ client_id: 'abcdefghijklmnop', login: 'synthetic_bot', scopes: SCOPES });
  }
  if (url.endsWith('/oauth2/token')) {
    if (body.get('grant_type') === 'refresh_token') {
      fake.refreshCalls++;
      events.push({ t: 'refresh' });
      saveFake();
      if (mode === 'network') throw new TypeError('fetch failed');
      if (mode === 'unavailable') return json({ status: 503, message: 'service unavailable' }, 503);
      if (fake.appType === 'confidential' && body.get('client_secret') !== fake.clientSecret) {
        return json({ status: 400, message: 'missing client secret' }, 400);
      }
      const presented = String(body.get('refresh_token'));
      if (!fake.refresh[presented]) return json({ status: 400, message: 'Invalid refresh token' }, 400);
      if (!process.env.FAKE_OMIT_REFRESH) delete fake.refresh[presented];
      const next = issue();
      saveFake();
      return json({ access_token: next.access, ...(process.env.FAKE_OMIT_REFRESH ? { } : { refresh_token: next.refresh }), expires_in: expiresIn });
    }
    const next = issue();
    saveFake();
    return json({ access_token: next.access, refresh_token: next.refresh, expires_in: expiresIn });
  }
  unexpected.push(url.replace(/\?.*/, ''));
  throw new TypeError('unexpected network call');
}) as typeof fetch;

(TwitchBot.prototype as any).connect = function recordConnect(this: TwitchBot) {
  const config = (this as any).config;
  const token = String(config.twitchBotOauthToken || '');
  // The real connect() does nothing without a channel, bot name and token.
  if (!config.twitchChannel || !config.twitchBotUsername || !token) return;
  events.push({ t: 'connect', valid: fake.access[token] > Date.now() });
};
(YtmCompanionClient.prototype as any).start = () => {};
(SpotifyService.prototype as any).start = () => {};

const clientId = 'abcdefghijklmnop';
const service = () => (botService as any).twitchOAuth;
const report = (extra: Record<string, unknown> = {}) => {
  const config = botService.getFullState().config;
  console.log('RESULT:' + JSON.stringify({
    cwd: process.cwd(), events, unexpected, refreshCalls: fake.refreshCalls,
    oauth: botService.getTwitchOAuthStatus(),
    tokenConfigured: config.twitchTokenConfigured, authError: config.twitchAuthError || '',
    ...extra
  }));
};

async function main() {
  const command = process.env.AUTH_CMD;
  const secret = process.env.LOGIN_SECRET || undefined;
  if (command === 'login') {
    botService.updateConfig({ twitchChannel: 'syntheticchannel', twitchClientId: clientId, ...(secret ? { twitchClientSecret: secret } : {}) });
    await botService.startTwitchOAuth(clientId, secret);
    service().nextPollAt = 0;
    await botService.pollTwitchOAuth();
    report();
  } else if (command === 'boot') {
    await botService.start();
    await new Promise(resolve => setImmediate(resolve));
    report();
  } else if (command === 'recover') {
    await botService.start();
    mode = 'ok';
    await service().refreshIfNeeded();
    await new Promise(resolve => setImmediate(resolve));
    report();
  } else if (command === 'resume') {
    await botService.resumeTwitchOAuth(secret);
    report();
  } else if (command === 'settings') {
    botService.updateConfig({ language: 'de', maxQueueSize: 50 });
    report();
  } else if (command === 'expire') {
    const store = new SecureTokenStore();
    store.set('twitchTokenExpiresAt', String(Date.now() - 1000));
    for (const token of Object.keys(fake.access)) fake.access[token] = Date.now() - 1000;
    saveFake();
    console.log('RESULT:' + JSON.stringify({ expired: true, events, unexpected }));
  } else if (command === 'save-secret') {
    try { botService.updateConfig({ ytmdaAuthToken: 'synthetic-ytm' }); report({ saved: true }); }
    catch (error) { report({ saved: false, saveError: error instanceof Error ? error.message : String(error) }); }
  }
}

main().then(() => process.exit(0), error => {
  console.log('RESULT:' + JSON.stringify({ crashed: true, error: error instanceof Error ? error.message : String(error) }));
  process.exit(0);
});
