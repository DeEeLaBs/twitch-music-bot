import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, ACTION_BY_ID, ConfirmGate, VolumeController, type CommandClient } from '../src/core/commands.ts';
import { EMPTY_STATE, type BotState } from '../src/core/state.ts';
import type { BotRequestResult } from '../src/core/botClient.ts';

function recorder(result: BotRequestResult = { ok: true }) {
  const calls: Array<[string, unknown]> = [];
  const client: CommandClient = { post: async (path, body) => { calls.push([path, body]); return result; } };
  return { client, calls };
}
const state = (patch: Partial<BotState> = {}): BotState => ({ ...EMPTY_STATE, ...patch });
const run = (id: string, current: BotState, client: CommandClient, volume = new VolumeController(client, () => current.playback.volume)) => ACTION_BY_ID.get(id)!.run(client, current, { volume });

test('every action has a unique id and a tier', () => {
  assert.equal(new Set(ACTIONS.map(action => action.id)).size, ACTIONS.length);
  assert.ok(ACTIONS.every(action => [1, 2, 3].includes(action.tier)));
});

test('tier 1 actions call the matching bot endpoints', async () => {
  const expected: Record<string, string> = {
    'play-pause': '/api/playback/play-pause', next: '/api/playback/skip', previous: '/api/playback/previous',
    'start-queue': '/api/queue/start', 'clear-error': '/api/playback/clear-error', 'now-playing': '/api/playback/play-pause'
  };
  for (const [id, path] of Object.entries(expected)) {
    const { client, calls } = recorder();
    assert.deepEqual(await run(id, EMPTY_STATE, client), { ok: true });
    assert.deepEqual(calls, [[path, undefined]], id);
  }
});

test('volume keys step by 5 and stay within 0..100', async () => {
  for (const [id, volume, expected] of [['volume-up', 40, 45], ['volume-up', 98, 100], ['volume-down', 40, 35], ['volume-down', 3, 0]] as const) {
    const { client, calls } = recorder();
    await run(id, state({ playback: { ...EMPTY_STATE.playback, volume } }), client);
    assert.deepEqual(calls, [['/api/playback/volume', { volume: expected }]], `${id} from ${volume}`);
  }
});

test('failures of the bot are reported, not hidden', async () => {
  const { client } = recorder({ ok: false, error: 'Player not connected' });
  assert.deepEqual(await run('next', EMPTY_STATE, client), { ok: false, error: 'Player not connected' });
});

test('removing the next song targets the first queued track and refuses an empty queue', async () => {
  const { client, calls } = recorder();
  assert.equal((await run('veto-next', EMPTY_STATE, client)).ok, false);
  assert.deepEqual(calls, []);
  await run('veto-next', state({ queue: [{ id: 'q1', title: 'One' }, { id: 'q2', title: 'Two' }] }), client);
  assert.deepEqual(calls, [['/api/queue/veto', { trackId: 'q1' }]]);
});

test('blocking the requester uses the current song and needs a requester', async () => {
  const { client, calls } = recorder();
  assert.equal((await run('block-requester', EMPTY_STATE, client)).ok, false);
  const playing = state({ playback: { ...EMPTY_STATE.playback, currentSong: { id: 's', title: 'S', requester: { username: 'troll42' } } } });
  await run('block-requester', playing, client);
  assert.deepEqual(calls, [['/api/queue/requester/block', { username: 'troll42', blocked: true }]]);
});

test('destructive actions are flagged for confirmation and harmless ones are not', () => {
  assert.deepEqual(ACTIONS.filter(action => action.confirm).map(action => action.id).sort(), ['block-requester', 'clear-queue']);
});

test('switches flip the current value; absent settings count as on (bot default)', async () => {
  const cases: Array<[string, BotState, Record<string, boolean>]> = [
    ['toggle-requests', EMPTY_STATE, { songRequestsOpen: false }],
    ['toggle-requests', state({ config: { songRequestsOpen: false } }), { songRequestsOpen: true }],
    ['toggle-autoplay', EMPTY_STATE, { autoPlayRadio: false }],
    ['toggle-autoplay', state({ config: { autoPlayRadio: false } }), { autoPlayRadio: true }],
    ['toggle-channelpoints', state({ config: { channelPointsEnabled: true } }), { channelPointsEnabled: false }],
    ['toggle-channelpoints', state({ config: { channelPointsEnabled: false, channelPointsRewardId: 'r' } }), { channelPointsEnabled: true }]
  ];
  for (const [id, current, body] of cases) {
    const { client, calls } = recorder();
    await run(id, current, client);
    assert.deepEqual(calls, [['/api/config', body]], id);
  }
});

test('Channel Points cannot be switched on without a configured reward', async () => {
  const { client, calls } = recorder();
  const result = await run('toggle-channelpoints', EMPTY_STATE, client);
  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
});

test('the confirm gate needs a second press inside the window', () => {
  const gate = new ConfirmGate(3000);
  assert.equal(gate.check('k', 1000), false);
  assert.equal(gate.isArmed('k', 2000), true);
  assert.equal(gate.check('k', 2500), true);
  assert.equal(gate.isArmed('k', 2600), false, 'a confirmed action disarms the key');
  assert.equal(gate.check('k', 3000), false);
  assert.equal(gate.check('k', 7000), false, 'too late: arms again instead of running');
  assert.equal(gate.check('other', 7100), false, 'keys are independent');
  gate.clear('k');
  assert.equal(gate.isArmed('k', 7200), false);
});

test('rapid dial turns are coalesced: one request in flight, only the newest target follows', async () => {
  const sent: number[] = [];
  let release: () => void = () => {};
  let first = true;
  const client: CommandClient = {
    post: async (_path, body) => {
      sent.push((body as { volume: number }).volume);
      if (first) { first = false; await new Promise<void>(resolve => { release = resolve; }); }
      return { ok: true };
    }
  };
  const controller = new VolumeController(client, () => 50);
  const pending = controller.nudge(2);
  await controller.nudge(2);
  await controller.nudge(2);
  assert.deepEqual(sent, [52], 'later turns wait for the request in flight');
  release();
  await pending;
  assert.deepEqual(sent, [52, 56]);
});

test('the dial press mutes and restores the previous level; volume is clamped', async () => {
  const sent: number[] = [];
  let volume = 30;
  const client: CommandClient = { post: async (_path, body) => { volume = (body as { volume: number }).volume; sent.push(volume); return { ok: true }; } };
  const controller = new VolumeController(client, () => volume);
  await controller.toggleMute();
  await controller.toggleMute();
  await controller.nudge(500);
  await controller.nudge(-500);
  assert.deepEqual(sent, [0, 30, 100, 0]);
});

test('a failed volume request does not leave the controller stuck', async () => {
  let ok = false;
  const sent: number[] = [];
  const client: CommandClient = { post: async (_path, body) => { sent.push((body as { volume: number }).volume); return { ok }; } };
  const controller = new VolumeController(client, () => 20);
  await controller.nudge(10);
  ok = true;
  await controller.nudge(10);
  assert.deepEqual(sent, [30, 30]);
});

test('quick volume key presses build on each other and never wait for the bot', async () => {
  const sent: number[] = [];
  let release: () => void = () => {};
  let first = true;
  const client: CommandClient = {
    post: async (_path, body) => {
      sent.push((body as { volume: number }).volume);
      if (first) { first = false; await new Promise<void>(resolve => { release = resolve; }); }
      return { ok: true };
    }
  };
  // The bot's reported volume stays at 40 while the requests are in flight (it only updates after the round trip).
  const current = state({ playback: { ...EMPTY_STATE.playback, volume: 40 } });
  const controller = new VolumeController(client, () => current.playback.volume);
  const pending = run('volume-up', current, client, controller);
  // These return immediately instead of queueing behind the request in flight.
  assert.deepEqual(await run('volume-up', current, client, controller), { ok: true });
  assert.deepEqual(await run('volume-up', current, client, controller), { ok: true });
  assert.deepEqual(await run('volume-down', current, client, controller), { ok: true });
  assert.deepEqual(await run('volume-up', current, client, controller), { ok: true });
  assert.deepEqual(sent, [45]);
  release();
  assert.deepEqual(await pending, { ok: true });
  assert.deepEqual(sent, [45, 55], 'four more presses net +10 (3 up, 1 down) from 45, not 40 +- 5');
});

test('a volume key reports a failed request instead of pretending it worked', async () => {
  const { client } = recorder({ ok: false, error: 'Player not connected' });
  assert.deepEqual(await run('volume-up', EMPTY_STATE, client), { ok: false, error: 'Player not connected' });
});
function clock(start = 1000) { const time = { now: start }; return { time, now: () => time.now }; }

test('the shown volume is what the user asked for, even while the bot still reports an older value', async () => {
  const { time, now } = clock();
  let release: () => void = () => {};
  let first = true;
  const client: CommandClient = { post: async () => { if (first) { first = false; await new Promise<void>(resolve => { release = resolve; }); } return { ok: true }; } };
  let reported = 40;
  const controller = new VolumeController(client, () => reported, { now, holdMs: 1000 });
  assert.equal(controller.shownVolume(), null, 'nothing requested yet: show the reported volume');
  const pending = controller.nudge(5);
  assert.equal(controller.shownVolume(), 45);
  reported = 40; // the player echoes the old volume while the request is in flight
  await controller.nudge(5);
  assert.equal(controller.shownVolume(), 50);
  release();
  await pending;
  time.now += 999;
  assert.equal(controller.shownVolume(), 50, 'held briefly after the request so late echoes cannot make it jump back');
  time.now += 2;
  assert.equal(controller.shownVolume(), null, 'afterwards the bot is the source of truth again');
});

test('the next press builds on the shown volume, not on a stale report', async () => {
  const { time, now } = clock();
  const sent: number[] = [];
  const client: CommandClient = { post: async (_path, body) => { sent.push((body as { volume: number }).volume); return { ok: true }; } };
  const controller = new VolumeController(client, () => 40, { now, holdMs: 1000 }); // the report never catches up
  await controller.nudge(5);
  time.now += 300;
  await controller.nudge(5);
  time.now += 300;
  await controller.nudge(-5);
  assert.deepEqual(sent, [45, 50, 45]);
});

test('after a failed request the shown volume falls back to what the bot reports', async () => {
  const { now } = clock();
  const client: CommandClient = { post: async () => ({ ok: false, error: 'Player not connected' }) };
  const controller = new VolumeController(client, () => 40, { now, holdMs: 1000 });
  assert.deepEqual(await controller.nudge(5), { ok: false, error: 'Player not connected' });
  assert.equal(controller.shownVolume(), null);
});

test('only the volume keys flash instantly; everything else waits for the bot to confirm', () => {
  assert.deepEqual(ACTIONS.filter(action => action.instant).map(action => action.id).sort(), ['volume-down', 'volume-up']);
});