import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BotClient, type SocketLike } from '../src/core/botClient.ts';

class FakeSocket extends EventEmitter implements SocketLike {
  closed = false;
  close() { this.closed = true; this.emit('close'); }
}

function harness(fetchImpl: typeof fetch) {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ callback: () => void; ms: number }> = [];
  const client = new BotClient({
    baseUrl: 'http://127.0.0.1:3000/',
    fetchImpl,
    createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    setTimer: (callback, ms) => { const handle = { callback, ms }; timers.push(handle); return handle; },
    clearTimer: handle => { const index = timers.indexOf(handle as { callback: () => void; ms: number }); if (index >= 0) timers.splice(index, 1); }
  });
  return { client, sockets, timers };
}

const noFetch = (async () => { throw new Error('unexpected fetch'); }) as unknown as typeof fetch;
const stateMessage = (volume: number) => JSON.stringify({ type: 'state', data: { playback: { currentSong: null, isPlaying: false, volume }, queue: [], config: {} } });

test('the first message from the bot marks the link as live and later messages update the state', () => {
  const { client, sockets } = harness(noFetch);
  const seen: Array<[number, boolean]> = [];
  client.onChange((state, online) => seen.push([state.playback.volume, online]));
  client.start();
  assert.equal(client.connected, false);
  sockets[0].emit('open');
  sockets[0].emit('message', Buffer.from(stateMessage(30)));
  sockets[0].emit('message', JSON.stringify({ type: 'patch', data: { playback: { volume: 55 } } }));
  assert.equal(client.connected, true);
  assert.deepEqual(seen, [[30, true], [55, true]]);
  sockets[0].emit('message', 'not json');
  assert.equal(seen.length, 2, 'garbage is ignored');
});

test('losing the socket goes offline and reconnects with a growing, capped delay', () => {
  const { client, sockets, timers } = harness(noFetch);
  const online: boolean[] = [];
  client.onChange((_state, isOnline) => online.push(isOnline));
  client.start();
  sockets[0].emit('message', stateMessage(1));
  sockets[0].emit('close');
  assert.equal(client.connected, false);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1000);
  timers.shift()!.callback();
  assert.equal(sockets.length, 2);
  sockets[1].emit('error'); // never opened
  assert.equal(timers[0].ms, 2000);
  for (let i = 0; i < 6; i++) { timers.shift()!.callback(); sockets.at(-1)!.emit('close'); }
  assert.equal(timers[0].ms, 10000, 'delay is capped');
  timers.shift()!.callback();
  sockets.at(-1)!.emit('open');
  sockets.at(-1)!.emit('message', stateMessage(2));
  sockets.at(-1)!.emit('close');
  assert.equal(timers[0].ms, 1000, 'a successful connection resets the delay');
  assert.deepEqual(online, [true, false, true, false]);
});

test('stop closes the socket, cancels reconnects and never reconnects afterwards', () => {
  const { client, sockets, timers } = harness(noFetch);
  client.start();
  sockets[0].emit('close');
  assert.equal(timers.length, 1);
  client.stop();
  assert.equal(timers.length, 0);
  assert.equal(sockets.length, 1);
});

test('post sends the session token, and a stale token (bot restarted) is refreshed once', async () => {
  const calls: Array<{ url: string; token?: string }> = [];
  let sessions = 0;
  let botRestarted = false; // after a restart the bot no longer accepts token-1
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    calls.push({ url, token: headers['X-Bot-Session'] });
    if (url.endsWith('/api/session')) return Response.json({ token: `token-${++sessions}` });
    if (botRestarted && headers['X-Bot-Session'] === 'token-1') return Response.json({ code: 'AUTH_REQUIRED', error: 'stale' }, { status: 403 });
    return Response.json({ success: true });
  }) as unknown as typeof fetch;
  const { client } = harness(fetchImpl);
  assert.deepEqual(await client.post('/api/playback/play-pause'), { ok: true, data: { success: true } });
  assert.deepEqual(await client.post('/api/playback/skip'), { ok: true, data: { success: true } });
  botRestarted = true;
  const result = await client.post('/api/playback/skip');
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(c => [c.url.replace('http://127.0.0.1:3000', ''), c.token]), [
    ['/api/session', undefined], ['/api/playback/play-pause', 'token-1'], ['/api/playback/skip', 'token-1'],
    ['/api/playback/skip', 'token-1'], ['/api/session', undefined], ['/api/playback/skip', 'token-2']
  ]);
});

test('post reports bot-side failures and network errors without throwing', async () => {
  const responses = [
    () => Response.json({ token: 't' }),
    () => Response.json({ success: false, error: 'Player not connected' }),
    () => Response.json({ code: 'VALIDATION', error: 'Bad value' }, { status: 400 }),
    () => { throw new Error('connect ECONNREFUSED'); }
  ];
  const fetchImpl = (async () => responses.shift()!()) as unknown as typeof fetch;
  const { client } = harness(fetchImpl);
  assert.deepEqual(await client.post('/api/x'), { ok: false, error: 'Player not connected', data: { success: false, error: 'Player not connected' } });
  const bad = await client.post('/api/x');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'Bad value');
  const down = await client.post('/api/x');
  assert.equal(down.ok, false);
  assert.match(down.error || '', /ECONNREFUSED/);
});

test('concurrent posts share one session request', async () => {
  let sessionCalls = 0;
  const fetchImpl = (async (url: string) => {
    if (url.endsWith('/api/session')) { sessionCalls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ token: 't' }); }
    return Response.json({ success: true });
  }) as unknown as typeof fetch;
  const { client } = harness(fetchImpl);
  const results = await Promise.all([client.post('/a'), client.post('/b'), client.post('/c')]);
  assert.ok(results.every(result => result.ok));
  assert.equal(sessionCalls, 1);
});

test('artwork is fetched through the bot proxy and only accepted when it is a small supported image', async () => {
  const requested: string[] = [];
  const images: Record<string, Response> = {
    jpg: new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
    webp: new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/webp' } }),
    html: new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    huge: new Response(new Uint8Array(3 * 1024 * 1024), { headers: { 'content-type': 'image/png' } })
  };
  const fetchImpl = (async (url: string) => { requested.push(url); return images[new URL(url).searchParams.get('url')!.split('/').pop()!] || new Response('', { status: 404 }); }) as unknown as typeof fetch;
  const { client } = harness(fetchImpl);
  assert.equal(await client.fetchArtwork('https://i.ytimg.com/vi/x/jpg'), 'data:image/jpeg;base64,AQID');
  assert.equal(await client.fetchArtwork('https://i.ytimg.com/vi/x/webp'), null);
  assert.equal(await client.fetchArtwork('https://i.ytimg.com/vi/x/html'), null);
  assert.equal(await client.fetchArtwork('https://i.ytimg.com/vi/x/huge'), null);
  assert.equal(await client.fetchArtwork('https://i.ytimg.com/vi/x/missing'), null);
  assert.ok(requested[0].startsWith('http://127.0.0.1:3000/artwork-proxy?url=https%3A%2F%2Fi.ytimg.com'));
});
