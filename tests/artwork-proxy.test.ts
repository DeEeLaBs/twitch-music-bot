import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createArtworkProxyRouter } from '../src/server/artworkProxy.ts';

async function withProxy(run: (request: () => Promise<number>) => Promise<void>) {
  const app = express();
  app.use(createArtworkProxyRouter());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const request = () => new Promise<number>((resolve, reject) => {
    http.get(`http://127.0.0.1:${address.port}/artwork-proxy?url=https%3A%2F%2Fi.scdn.co%2Fimage%2Ftest`, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode!));
    }).on('error', reject);
  });
  try { await run(request); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('failed artwork downloads return 502 without unhandled rejection and can retry', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('upstream unavailable'); });
  await withProxy(async request => {
    assert.equal(await request(), 502);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await request(), 502);
    assert.equal(calls, 2);
  });
});

for (const length of [null, '1']) {
  test(`oversized artwork stops and cancels the stream with content-length ${length}`, async t => {
    let canceled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024 * 1024)); if (pulls === 12) controller.close(); },
      cancel() { canceled = true; }
    }, { highWaterMark: 0 });
    const response = new Response(body, { headers: { 'content-type': 'image/png', ...(length ? {'content-length': length} : {}) } });
    Object.defineProperty(response, 'url', {value: 'https://i.scdn.co/image/test'});
    t.mock.method(globalThis, 'fetch', async () => response);
    await withProxy(async request => {
      assert.equal(await request(), 502);
      assert.equal(canceled, true);
      assert.equal(pulls, 9);
    });
  });
}

test('artwork exactly at the size limit is accepted and cached', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    const response = new Response(new Uint8Array(8 * 1024 * 1024), {headers: {'content-type':'image/png'}});
    Object.defineProperty(response, 'url', {value: 'https://i.scdn.co/image/test'});
    return response;
  });
  await withProxy(async request => {
    assert.equal(await request(), 200);
    assert.equal(await request(), 200);
    assert.equal(calls, 1);
  });
});

test('advertised oversized artwork is canceled without reading the body', async t => {
  let canceled = false;
  let pulls = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull() { pulls++; },
    cancel() { canceled = true; }
  }, {highWaterMark: 0}), {headers: {'content-type':'image/png', 'content-length': String(8 * 1024 * 1024 + 1)}});
  Object.defineProperty(response, 'url', {value: 'https://i.scdn.co/image/test'});
  t.mock.method(globalThis, 'fetch', async () => response);
  await withProxy(async request => {
    assert.equal(await request(), 502);
    assert.equal(canceled, true);
    assert.equal(pulls, 0);
  });
});
