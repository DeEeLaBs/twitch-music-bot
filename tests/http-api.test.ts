import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createApiRouter } from '../src/server/apiRouter.ts';
import { errorPayload } from '../src/server/errors.ts';
import { botService } from '../src/server/botService.ts';

async function withApi(run: (baseUrl: string, sessionToken: string) => Promise<void>) {
  const sessionToken = 'test-session-token';
  const overlayAssetsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytm-bot-assets-'));
  const app = express();
  app.use(express.json({limit:'2mb'}));
  app.use('/api', createApiRouter({sessionToken, appVersion:'test', overlayAssetsDir}));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const payload = errorPayload(error);
    res.status(payload.status).json(payload.body);
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`, sessionToken);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fs.rm(overlayAssetsDir, {recursive:true,force:true});
  }
}

test('HTTP API exposes health and stable auth error codes', async () => {
  await withApi(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    const healthJson = await health.json() as {status:string;version:string};
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.version, 'test');

    const denied = await fetch(`${baseUrl}/api/playback/volume`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({volume:50})
    });
    assert.equal(denied.status, 403);
    const deniedJson = await denied.json() as {success:boolean;code:string};
    assert.equal(deniedJson.success, false);
    assert.equal(deniedJson.code, 'AUTH_REQUIRED');
  });
});

test('Twitch login without a typed Client ID uses the bundled/saved app', async t => {
  const started: Array<string | undefined> = [];
  t.mock.method(botService, 'getTwitchClientId', () => 'builtinclientid0123456789abcdef');
  t.mock.method(botService, 'startTwitchOAuth', async (clientId: string) => { started.push(clientId); return { state: 'pending' } as never; });
  await withApi(async (baseUrl, sessionToken) => {
    const start = await fetch(`${baseUrl}/api/twitch/oauth/start`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Bot-Session':sessionToken}, body:JSON.stringify({})
    });
    assert.equal(start.status, 200);
    assert.deepEqual(started, ['builtinclientid0123456789abcdef']);
  });
});

test('HTTP API exposes the Twitch OAuth device-login routes', async t => {
  t.mock.method(botService, 'getTwitchClientId', () => '');
  await withApi(async (baseUrl, sessionToken) => {
    const status = await fetch(`${baseUrl}/api/twitch/oauth/status`);
    assert.equal(status.status, 200);
    const statusJson = await status.json() as { state:string };
    assert.ok(['idle', 'pending', 'connected', 'error'].includes(statusJson.state));

    const start = await fetch(`${baseUrl}/api/twitch/oauth/start`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Bot-Session':sessionToken},
      body:JSON.stringify({clientId:''})
    });
    assert.equal(start.status, 400);
    const startJson = await start.json() as { code:string; error:string };
    assert.equal(startJson.code, 'VALIDATION');
    assert.match(startJson.error, /Client-ID|Twitch-Anwendung/);
  });
});

test('Channel Points reward failures expose the actionable Twitch authentication error', async t => {
  t.mock.method(botService, 'getTwitchChannelPointRewards', async () => {
    throw new Error('The stored Twitch token is invalid or expired. Use “Connect with Twitch” in Setup to sign in again.');
  });
  await withApi(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/twitch/channel-point-rewards`);
    const payload = await response.json() as { success: boolean; code: string; error: string };
    assert.equal(response.status, 401);
    assert.equal(payload.code, 'AUTH_REQUIRED');
    assert.match(payload.error, /Connect with Twitch/);
  });
});

test('HTTP API validates mutation payloads through central error middleware', async () => {
  await withApi(async (baseUrl, sessionToken) => {
    const response = await fetch(`${baseUrl}/api/playback/volume`, {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Bot-Session':sessionToken},
      body:JSON.stringify({volume:101})
    });
    assert.equal(response.status, 400);
    const payload = await response.json() as {success:boolean;code:string;error:string};
    assert.equal(payload.success, false);
    assert.equal(payload.code, 'VALIDATION');
    assert.match(payload.error, /0 und 100/);
  });
});

test('HTTP API rejects malformed and oversized JSON without leaking request content', async () => {
  await withApi(async (baseUrl, sessionToken) => {
    for (const [body, status] of [['{"secret":"private",', 400], [JSON.stringify({ value: 'x'.repeat(2 * 1024 * 1024) }), 413]] as const) {
      const response = await fetch(`${baseUrl}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bot-Session': sessionToken },
        body
      });
      assert.equal(response.status, status);
      const payload = await response.json() as { code: string; error: string };
      assert.equal(payload.code, 'VALIDATION');
      assert.equal(JSON.stringify(payload).includes('private'), false);
    }
  });
});

test('HTTP API disables caching of session and live state', async () => {
  await withApi(async (baseUrl) => {
    for (const route of ['/session', '/state']) {
      const response = await fetch(`${baseUrl}/api${route}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      await response.arrayBuffer();
    }
  });
});

test('Spotify skip returns its own error and connection instead of YouTube state', async t => {
  t.mock.method(botService, 'getFullState', () => ({ config: { playbackProvider: 'spotify' } }) as any);
  t.mock.method(botService, 'getSpotifyService', () => ({ isConnected: () => true }) as any);
  t.mock.method(botService, 'getYtmCompanion', () => { throw new Error('Inactive YouTube must not be consulted'); });
  t.mock.method(botService, 'getQueueManager', () => ({
    skipCurrent: async () => ({ success: false, nextTrack: null }),
    getPlaybackState: () => ({ error: 'Spotify playlist unavailable' })
  }) as any);
  await withApi(async (base, token) => {
    const response = await fetch(base + '/api/playback/skip', { method: 'POST', headers: { 'X-Bot-Session': token } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.isConnected, true);
    assert.equal(body.error, 'Spotify playlist unavailable');
  });
});

 test('stream playlist API lists entries and protects deletion with session authentication', async () => {
   const {StreamPlaylistService}=await import('../src/server/streamPlaylistService.ts');
   const directory=await fs.mkdtemp(path.join(os.tmpdir(),'stream-playlist-api-'));
   const store=new StreamPlaylistService(path.join(directory,'playlist.json'));
   const original=botService.getStreamPlaylistService;
   botService.getStreamPlaylistService=() => store;
   try {
     await store.addTrack({id:'api-track',title:'API track',artist:'Artist',albumArtUrl:'',duration:180,url:'https://music.youtube.com/watch?v=abcdefghijk',requestedAt:Date.now(),requester:{username:'viewer',displayName:'Viewer',badge:'viewer'}},'Viewer');
     await withApi(async (baseUrl,sessionToken) => {
       const listed=await fetch(`${baseUrl}/api/stream-playlist`);
       assert.equal(listed.status,200);
       const body=await listed.json() as {items:{id:string}[]};
       assert.equal(body.items[0].id,'api-track');
       assert.equal((await fetch(`${baseUrl}/api/stream-playlist/api-track`,{method:'DELETE'})).status,403);
       assert.equal(store.getItems().length,1);
       assert.equal((await fetch(`${baseUrl}/api/stream-playlist/api-track`,{method:'DELETE',headers:{'X-Bot-Session':sessionToken}})).status,200);
       assert.deepEqual(new StreamPlaylistService(path.join(directory,'playlist.json')).getItems(),[]);
       assert.equal((await fetch(`${baseUrl}/api/stream-playlist/api-track`,{method:'DELETE',headers:{'X-Bot-Session':sessionToken}})).status,404);
     });
   } finally {botService.getStreamPlaylistService=original;await fs.rm(directory,{recursive:true,force:true});}
 });

test('Stream Deck routes report status and refuse installs without a valid session', async () => {
  await withApi(async baseUrl => {
    const status = await fetch(`${baseUrl}/api/streamdeck/status`);
    assert.equal(status.status, 200);
    const body = await status.json() as { success: boolean; state: string; bundledVersion: string | null };
    assert.equal(body.success, true);
    assert.ok(['not-bundled', 'streamdeck-missing', 'not-installed', 'update-available', 'up-to-date'].includes(body.state));
    // Never call the real install here: with a valid session it would launch the Stream Deck installer.
    const denied = await fetch(`${baseUrl}/api/streamdeck/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json() as { code: string }).code, 'AUTH_REQUIRED');
  });
});
