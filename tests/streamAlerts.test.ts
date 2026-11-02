import assert from 'node:assert/strict';
import test from 'node:test';
import { EventSubClient } from '../src/server/eventSubClient.ts';
import type { WebSocket } from 'ws';
import { alertFromNotification, alertText, eventSubSubscriptions, pushAlert, type StreamAlert } from '../src/streamAlerts.ts';
import { applyAlert, emptyStats, noteRequester, setGoal } from '../src/streamStats.ts';

const alert = (kind: StreamAlert['kind'], at: number): StreamAlert => ({ id: `${kind}-${at}`, kind, user: kind, amount: 1, createdAt: at, message: '', months: 0, tier: '', currency: '', viewers: 0 });

test('countdown storage failures do not suppress Twitch alerts and statistics', async () => {
  const alerts: StreamAlert[] = [], logs: string[] = [];
  let stats = emptyStats(Date.now());
  const client = new EventSubClient(value => { alerts.push(value); stats = applyAlert(stats, value); },
    message => logs.push(message), () => { throw new Error('private storage details'); });
  const socket = {} as WebSocket;
  const handler = client as unknown as { socket: WebSocket; onMessage: (raw: string, auth: object, subscribe: boolean, socket: WebSocket) => Promise<void> };
  handler.socket = socket;
  for (const type of ['channel.cheer', 'channel.subscribe', 'channel.subscription.gift']) {
    await handler.onMessage(JSON.stringify({ metadata: { message_type: 'notification', message_id: type },
      payload: { subscription: { type }, event: { user_name: 'Viewer', bits: 100, total: 5, tier: '1000', is_gift: false } } }), {}, false, socket);
  }
  assert.deepEqual(alerts.map(value => value.kind), ['cheer', 'subscription', 'communitygift']);
  assert.equal(stats.cheers[0].value, 100);
  assert.equal(logs.length, 3);
  assert.doesNotMatch(logs.join(' '), /private storage details/);
});

test('alerts keep raids ahead of follows and drop the oldest follow when full', () => {
  let queue = [alert('follow', 1), alert('cheer', 2)];
  queue = pushAlert(queue, alert('raid', 3));
  assert.equal(queue[0].kind, 'raid');
  queue = Array.from({ length: 30 }, (_, index) => alert('follow', index));
  queue = pushAlert(queue, alert('raid', 100));
  assert.equal(queue.length, 30);
  assert.equal(queue[0].kind, 'raid');
  assert.equal(queue.filter(item => item.kind === 'follow').length, 29);
});

test('EventSub notifications become alerts and skip unknown types', () => {
  const follow = alertFromNotification({ payload: { subscription: { type: 'channel.follow' }, event: { user_name: 'Nova' } } }, 5);
  assert.equal(follow?.kind, 'follow');
  assert.equal(follow?.user, 'Nova');
  assert.equal(alertFromNotification({ payload: { subscription: { type: 'channel.tip' }, event: {} } }), null);
  assert.match(alertText({ id: '1', kind: 'raid', user: 'Mika', amount: 40, createdAt: 1, message: '', months: 0, tier: '', currency: '', viewers: 40 }, 'de'), /Mika/);
});

test('subscriptions follow the granted scopes and never include tips', () => {
  const all = eventSubSubscriptions('123', 'session', ['moderator:read:followers', 'channel:read:subscriptions', 'bits:read']);
  const types = all.map(item => item.type);
  assert.deepEqual(types.sort(), ['channel.cheer', 'channel.follow', 'channel.raid', 'channel.subscribe', 'channel.subscription.gift', 'channel.subscription.message'].sort());
  const raidOnly = eventSubSubscriptions('123', 'session', []);
  assert.deepEqual(raidOnly.map(item => item.type), ['channel.raid']);
});

test('stats count follows, cheers, and song requesters without a tip field', () => {
  const fields = { message: '', months: 0, tier: '' as const, currency: '', viewers: 0 };
  let stats = applyAlert(emptyStats(1_000), { id: 'f', kind: 'follow', user: 'Nova', amount: 0, createdAt: 1_000, ...fields });
  stats = applyAlert(stats, { id: 'c', kind: 'cheer', user: 'Ari', amount: 100, createdAt: 2_000, ...fields });
  stats = noteRequester(stats, 'Mika');
  stats = setGoal(stats, 'follower', 50);
  assert.equal(stats.session.follows, 1);
  assert.equal(stats.latest.follower?.user, 'Nova');
  assert.equal(stats.cheers[0].value, 100);
  assert.equal(stats.requesters[0].user, 'Mika');
  assert.equal(stats.goals.follower.target, 50);
  assert.equal('tips' in stats, false);
});
