import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CountdownService } from '../src/server/countdownService.ts';
import { bonusSeconds, defaultCountdown, formatCountdown, remainingCountdown, validateCountdownProfile, type CountdownBonus } from '../src/countdown.ts';
import { CountdownDonations, donationEvents } from '../src/server/countdownDonations.ts';
import { SecureTokenStore } from '../src/server/secureTokenStore.ts';
import { WebSocket, WebSocketServer } from 'ws';
import { once } from 'node:events';
import { cssFontFamily, alertFontFaceCss } from '../src/alertFonts.ts';
import { countdownBonusFromNotification, eventSubSubscriptions } from '../src/streamAlerts.ts';

function workspace(t: { after: (fn: () => void) => void }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'countdown-test-'));
  const file = path.join(dir, 'countdowns.json');
  let now = 1000000;
  const service = new CountdownService(file, () => now);
  t.after(() => { service.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const profile = defaultCountdown('subathon');
  profile.initialSeconds = 100;
  profile.bonuses = { ...profile.bonuses, subsEnabled: true, giftsEnabled: true, bitsEnabled: true, tipsEnabled: true, rewards: { reward: 45 } };
  service.update('subathon', profile);
  return { service, file, profile, advance: (ms: number) => { now += ms; }, now: () => now,
    remaining: () => { const s = service.snapshot(); return remainingCountdown(s.profiles.subathon, s.runs.subathon, now); } };
}
const event = (at: number, patch: Partial<CountdownBonus> = {}): CountdownBonus => ({ id: 'event', at, source: 'tip', user: 'Viewer', amount: 2.5, currency: 'EUR', ...patch });

test('running time survives restart; paused time freezes and still accepts fractional bonuses', t => {
  const w = workspace(t);
  w.service.command('subathon', 'start');
  w.advance(10000);
  const restarted = new CountdownService(w.file, w.now);
  assert.equal(remainingCountdown(restarted.snapshot().profiles.subathon, restarted.snapshot().runs.subathon, w.now()), 90000);
  w.service.command('subathon', 'pause');
  w.advance(20000);
  w.service.accept(event(w.now()));
  assert.equal(w.remaining(), 240000);
  assert.equal(w.service.snapshot().runs.subathon.totalAddedMs, 150000);
  w.advance(20000);
  const paused = new CountdownService(w.file, w.now);
  assert.equal(remainingCountdown(paused.snapshot().profiles.subathon, paused.snapshot().runs.subathon, w.now()), 240000);
  paused.command('subathon', 'resume');
  w.advance(5000);
  assert.equal(remainingCountdown(paused.snapshot().profiles.subathon, paused.snapshot().runs.subathon, w.now()), 235000);
});

test('duplicate events stay deduplicated across process restarts and resets', t => {
  const w = workspace(t); w.service.command('subathon', 'start');
  assert.equal(w.service.accept(event(w.now())), true);
  const restarted = new CountdownService(w.file, w.now);
  assert.equal(restarted.accept(event(w.now())), false);
  assert.equal(restarted.snapshot().runs.subathon.totalAddedMs, 150000);
  restarted.command('subathon', 'reset'); restarted.command('subathon', 'start');
  assert.equal(restarted.accept(event(w.now())), false);
  assert.equal(restarted.snapshot().runs.subathon.totalAddedMs, 0);
});

test('an elapsed timer finishes once before a late donation and never revives', t => {
  const w = workspace(t); let completions = 0;
  w.service.start(() => { completions++; }); w.service.command('subathon', 'start');
  w.advance(100000);
  w.service.accept(event(w.now()));
  w.service.tick();
  assert.equal(completions, 1);
  assert.equal(w.service.snapshot().runs.subathon.status, 'finished');
  assert.equal(w.remaining(), 0);
  assert.throws(() => w.service.command('subathon', 'add', 30));
  const restarted = new CountdownService(w.file, w.now);
  restarted.start(() => { completions++; }); restarted.stop();
  assert.equal(completions, 1);
});

test('remaining cap credits only the actual bonus and rejects older-than-run events', t => {
  const w = workspace(t); w.profile.limit = 'remaining'; w.profile.maxSeconds = 120;
  w.service.update('subathon', w.profile); w.service.command('subathon', 'start');
  w.service.accept(event(w.now()));
  assert.equal(w.remaining(), 120000);
  assert.equal(w.service.snapshot().runs.subathon.totalAddedMs, 20000);
  w.service.accept(event(w.now() - 1, { id: 'old' }));
  assert.equal(w.service.snapshot().runs.subathon.lastBonus?.text, 'Viewer · Spende');
  assert.equal(w.remaining(), 120000);
  w.advance(30000); w.service.accept(event(w.now(), { id: 'new' }));
  assert.equal(w.remaining(), 120000);
  assert.equal(w.service.snapshot().runs.subathon.totalAddedMs, 50000);
});

test('hard deadline caps start and bonuses, including during pauses', t => {
  const w = workspace(t); w.profile.limit = 'deadline'; w.profile.deadline = w.now() + 60000;
  w.service.update('subathon', w.profile); w.service.command('subathon', 'start');
  assert.equal(w.remaining(), 60000);
  w.service.command('subathon', 'pause'); w.advance(20000); w.service.accept(event(w.now()));
  assert.equal(w.remaining(), 40000);
  w.advance(40000); w.service.tick();
  assert.equal(w.service.snapshot().runs.subathon.status, 'finished');
  assert.throws(() => w.service.command('subathon', 'start'), /Vergangenheit/);
});

test('finish chains to an inactive profile, does not interrupt an active one, and rejects cycles', t => {
  const w = workspace(t); w.profile.finish.next = 'streamstart'; w.service.update('subathon', w.profile);
  const other = defaultCountdown('streamstart'); other.finish.next = 'subathon';
  assert.throws(() => w.service.update('streamstart', other), /Kreis/);
  w.service.command('subathon', 'start'); w.advance(100000); w.service.tick();
  const next = w.service.snapshot().runs.streamstart;
  assert.equal(next.status, 'running');
  w.service.command('subathon', 'start'); w.advance(100000); w.service.tick();
  assert.equal(w.service.snapshot().runs.streamstart.runId, next.runId);
});

test('manual subtraction reaches zero once and reset returns to idle', t => {
  const w = workspace(t); w.service.command('subathon', 'start');
  w.service.command('subathon', 'add', 15);
  assert.equal(w.service.snapshot().runs.subathon.totalAddedMs, 15000);
  w.service.command('subathon', 'add', -500);
  assert.equal(w.service.snapshot().runs.subathon.status, 'finished');
  w.service.command('subathon', 'reset');
  assert.equal(w.service.snapshot().runs.subathon.status, 'idle');
  assert.equal(w.remaining(), 100000);
});

test('invalid settings and commands do not mutate persisted state', t => {
  const w = workspace(t); const before = fs.readFileSync(w.file, 'utf8');
  assert.throws(() => w.service.update('subathon', { ...w.profile, initialSeconds: NaN }));
  assert.throws(() => w.service.command('subathon', 'resume'));
  assert.equal(fs.readFileSync(w.file, 'utf8'), before);
  const invalid = structuredClone(w.profile); invalid.finish.soundUrl = 'https://evil.example/sound.mp3';
  assert.throws(() => validateCountdownProfile(invalid, 'subathon'));
  assert.throws(() => validateCountdownProfile({ ...w.profile, look: { ...w.profile.look, color: 'url(evil)' } }, 'subathon'));
  assert.throws(() => w.service.command('subathon', 'add', Infinity));
});

test('custom countdown fonts survive saving and restarting, and remote font sources are filtered', t => {
  const w = workspace(t);
  const asset = { id: 'custom', family: 'Meine Schrift', url: '/overlay-assets/custom.woff2', format: 'woff2' as const };
  w.profile.look.font = cssFontFamily(asset.family);
  w.profile.look.fonts = [asset, { ...asset, id: 'remote', url: 'https://example.com/font.woff2' }];
  w.service.update('subathon', w.profile);
  const saved = new CountdownService(w.file, w.now).snapshot().profiles.subathon;
  assert.equal(saved.look.font, '"Meine Schrift", sans-serif');
  assert.deepEqual(saved.look.fonts, [asset]);
  assert.match(alertFontFaceCss(saved.look.fonts!), /url\("\/overlay-assets\/custom.woff2"\)/);
  const legacy = defaultCountdown('streamstart'); delete legacy.look.fonts;
  assert.deepEqual(validateCountdownProfile(legacy, 'streamstart').look.fonts, []);
  assert.throws(() => validateCountdownProfile({ ...w.profile, look: { ...w.profile.look, font: '</style><script>' } }, 'subathon'));
});

test('corrupt countdown JSON recovers from valid backup without overwriting it', t => {
  const w = workspace(t); w.service.command('subathon', 'start');
  const saved = fs.readFileSync(w.file, 'utf8');
  fs.writeFileSync(w.file + '.backup', saved); fs.writeFileSync(w.file, '{broken');
  const recovered = new CountdownService(w.file, w.now);
  assert.equal(recovered.snapshot().runs.subathon.status, 'running');
  assert.equal(fs.readFileSync(w.file + '.backup', 'utf8'), saved);
});

test('two corrupt stores block writes instead of replacing potentially recoverable data', t => {
  const w = workspace(t);
  fs.writeFileSync(w.file, '{broken'); fs.writeFileSync(w.file + '.backup', '{also broken');
  const broken = new CountdownService(w.file, w.now);
  assert.match(broken.snapshot().storageError, /unlesbar/);
  assert.throws(() => broken.command('streamstart', 'start'), /unlesbar/);
  assert.equal(fs.readFileSync(w.file, 'utf8'), '{broken');
  assert.equal(fs.readFileSync(w.file + '.backup', 'utf8'), '{also broken');
});

test('tier, gift count, bits, rewards and currencies produce the agreed proportional bonuses', () => {
  const p = defaultCountdown('subathon');
  Object.assign(p.bonuses, { subsEnabled: true, giftsEnabled: true, bitsEnabled: true, tipsEnabled: true, rewards: { reward: 45 } });
  assert.equal(bonusSeconds(p, event(0, { source: 'sub', tier: '2000', amount: 12 })), 600);
  assert.equal(bonusSeconds(p, event(0, { source: 'gift', tier: '3000', amount: 3 })), 4500);
  assert.equal(bonusSeconds(p, event(0, { source: 'bits', amount: 50 })), 30);
  assert.equal(bonusSeconds(p, event(0)), 150);
  assert.equal(bonusSeconds(p, event(0, { currency: 'XYZ' })), 0);
  assert.equal(bonusSeconds(p, event(0, { source: 'reward', rewardId: 'reward' })), 45);
  assert.equal(bonusSeconds(p, event(0, { amount: -3 })), 0);
  assert.equal(formatCountdown(90061000), '25:01:01');
});

test('chat moderation is enforced and unsupported syntax does not execute', t => {
  const w = workspace(t);
  assert.match(w.service.chat('!timer subathon start', false)!, /Moderatoren/);
  assert.equal(w.service.snapshot().runs.subathon.status, 'idle');
  assert.match(w.service.chat('!timer subathon start', true)!, /running/);
  assert.match(w.service.chat('!timer subathon add 30', true)!, /00:02:10/);
  assert.match(w.service.chat('!timer subathon reset unexpected', true)!, /!timer/);
  assert.equal(w.service.snapshot().runs.subathon.status, 'running');
});

test('all donation adapters accept only valid monetary events with stable IDs', () => {
  const se = { type: 'message', topic: 'channel.tips', data: { _id: 'tip-id', transactionId: 'payment-id', status: 'success', donation: { user: { username: 'A' }, amount: 2.5, currency: 'EUR' } } };
  const sl = { type: 'donation', for: 'streamlabs', message: [{ id: 123, name: 'B', amount: '2.50', currency: 'EUR' }] };
  const ts = { event: { id: 124, type: 'donation', parameters: { username: 'C', amount: 2.5, currency: 'EUR' } } };
  for (const [provider, raw] of [['streamelements', se], ['streamlabs', sl], ['tipeeestream', ts]] as const) {
    const result = donationEvents(provider, raw, 100);
    assert.equal(result.length, 1); assert.equal(result[0].amount, 2.5); assert.equal(result[0].at, 100);
    assert.deepEqual(donationEvents(provider, {}, 100), []);
  }
  assert.deepEqual(donationEvents('streamelements', { ...se, data: { ...se.data, status: 'failed' } }), []);
  assert.deepEqual(donationEvents('streamlabs', { ...sl, type: 'subscription' }), []);
  assert.deepEqual(donationEvents('tipeeestream', { event: { ...ts.event, deleted_at: 'today' } }), []);
  assert.deepEqual(donationEvents('streamlabs', { ...sl, message: [{ amount: 99, currency: 'EUR' }] }), []);
});

test('Twitch bonus normalization skips gift recipients, counts gift bundles once and subscribes to redemptions', () => {
  const notification = (type: string, event: Record<string, unknown>) => ({ metadata: { message_id: 'stable-id', message_timestamp: '2026-10-29T12:00:00Z' }, payload: { subscription: { type }, event } });
  assert.equal(countdownBonusFromNotification(notification('channel.subscribe', { is_gift: true })), null);
  const gift = countdownBonusFromNotification(notification('channel.subscription.gift', { total: 5, user_name: 'A', tier: '2000' }));
  assert.equal(gift?.amount, 5); assert.equal(gift?.tier, '2000'); assert.equal(gift?.id, 'twitch:stable-id');
  const redemption = countdownBonusFromNotification(notification('channel.channel_points_custom_reward_redemption.add', { id: 'redemption', user_name: 'B', reward: { id: 'reward' }, status: 'UNFULFILLED' }));
  assert.equal(redemption?.rewardId, 'reward'); assert.equal(redemption?.id, 'twitch:reward:redemption');
  assert.ok(eventSubSubscriptions('broadcaster', 'session', ['channel:read:redemptions']).some(item => item.type === 'channel.channel_points_custom_reward_redemption.add'));
});

test('all three donor connections authenticate and consume real WebSocket frames without exposing tokens', async t => {
  const w = workspace(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ datas: { host: 'https://sso-cf.tipeeestream.com', port: '443' } }));
  for (const provider of ['streamelements', 'streamlabs', 'tipeeestream'] as const) {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const accepted: CountdownBonus[] = [];
    let finish: () => void = () => {}, fail: (error: unknown) => void = () => {};
    const done = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
    server.on('connection', socket => {
      socket.on('message', raw => {
        try {
          const text = String(raw);
          if (provider === 'streamelements') {
            const message = JSON.parse(text);
            assert.equal(message.type, 'subscribe'); assert.equal(message.data.token, 'synthetic-donation-token');
            assert.equal(message.data.topic, 'channel.tips');
            socket.send(JSON.stringify({ type: 'response', nonce: 'countdown-tips', data: { topic: 'channel.tips' } }));
            socket.send(JSON.stringify({ type: 'message', topic: 'channel.tips', data: { _id: 'se-tip', status: 'success', donation: { amount: 2.5, currency: 'EUR', user: { username: 'Donor' } } } }));
          } else if (text === '2') { socket.send('3'); if (accepted.length) finish(); }
          else if (provider === 'tipeeestream') {
            const [name, payload] = JSON.parse(text.slice(2));
            assert.equal(name, 'join-room'); assert.equal(payload.room, 'synthetic-donation-token'); assert.equal(payload.username, 'streamer');
            socket.send(`42${JSON.stringify(['new-event', { event: { id: 'ts-tip', type: 'donation', parameters: { amount: 2.5, currency: 'EUR', username: 'Donor' } } }])}`);
          }
        } catch (error) { fail(error); }
      });
      if (provider === 'streamelements') socket.send(JSON.stringify({ type: 'welcome' }));
      else {
        socket.send(`0${JSON.stringify({ sid: 'test', pingInterval: 1000, pingTimeout: 2000 })}`); socket.send('40');
        if (provider === 'streamlabs') socket.send(`42${JSON.stringify(['event', { type: 'donation', for: 'streamlabs', message: [{ id: 'sl-tip', amount: '2.50', currency: 'EUR', name: 'Donor' }] }])}`);
      }
    });
    const secrets = new SecureTokenStore(path.join(path.dirname(w.file), `${provider}-secrets.json`), path.join(path.dirname(w.file), `${provider}-key`));
    const connectionsFile = path.join(path.dirname(w.file), `${provider}-connections.json`);
    const connections = new CountdownDonations(connectionsFile, secrets, url => {
      assert.equal(url.protocol, 'wss:');
      if (provider !== 'streamelements') assert.equal(url.searchParams.get(provider === 'streamlabs' ? 'token' : 'access_token'), 'synthetic-donation-token');
      return new WebSocket(`ws://127.0.0.1:${address.port}`);
    }, bonus => { accepted.push(bonus); if (provider === 'streamelements') finish(); });
    let timeout: ReturnType<typeof setTimeout>;
    try {
      connections.update(provider, { enabled: true, channel: '0123456789abcdef01234567', username: 'streamer', token: 'synthetic-donation-token' });
      connections.start();
      await Promise.race([done, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`${provider}: no donation frame received`)), 5000); })]);
      assert.equal(accepted.length, 1); assert.equal(accepted[0].amount, 2.5);
      assert.equal(connections.snapshot()[provider].state, 'connected');
      assert.doesNotMatch(JSON.stringify(connections.snapshot()) + fs.readFileSync(connectionsFile, 'utf8') + fs.readFileSync(path.join(path.dirname(w.file), `${provider}-secrets.json`), 'utf8'), /synthetic-donation-token/);
    } finally {
      clearTimeout(timeout!); connections.stop(); for (const socket of server.clients) socket.terminate();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
});
