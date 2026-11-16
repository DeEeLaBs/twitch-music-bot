import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createApiRouter } from '../src/server/apiRouter.ts';

test('Nectar mutations require a session and validate incoming state', async t => {
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({ sessionToken: 'test-session', appVersion: 'test', overlayAssetsDir: '.' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/nectar`;
  const post = (route: string, body: unknown, token = '') => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bot-Session': token }, body: JSON.stringify(body) });
  assert.equal((await post('/state', { title: 'Injected' })).status, 403);
  assert.equal((await post('/command', { action: 'next' })).status, 403);
  assert.equal((await fetch(base + '/poll-commands')).status, 403);
  assert.equal((await post('/state', { title: {} }, 'test-session')).status, 400);
  assert.equal((await post('/command', { action: 'invalid' }, 'test-session')).status, 400);
  assert.equal((await post('/state', { title: '', artist: '', isPlaying: false }, 'test-session')).status, 200);
});
