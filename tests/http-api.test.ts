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
import { defaultCountdown } from '../src/countdown.ts';

async function withApi(run: (baseUrl: string, sessionToken: string) => Promise<void>, greetings?: import('../src/server/greetingService.ts').GreetingService) {
  const sessionToken = 'test-session-token';
  const overlayAssetsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytm-bot-assets-'));
  const app = express();
  app.use(express.json({limit:'2mb'}));
  app.use('/api', createApiRouter({sessionToken, appVersion:'test', overlayAssetsDir, greetings}));
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

test('countdown HTTP controls validate inputs, require sessions and never disclose provider tokens', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'countdown-api-'));
  const previous = process.cwd(); process.chdir(directory);
  t.mock.method(botService, 'overlayTokenMatches', (value: string) => value === 'qa-overlay');
  try {
    await withApi(async (base, session) => {
      const post = (route: string, body: unknown, auth = true) => fetch(`${base}/api${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-Bot-Session': session } : {}) }, body: JSON.stringify(body) });
      assert.equal((await post('/countdowns/subathon/control', { action: 'start' }, false)).status, 403);
      assert.equal((await post('/countdowns/not-a-profile/control', { action: 'start' })).status, 400);
      assert.equal((await post('/countdowns/subathon/control', { action: 'execute' })).status, 400);
      const profile = defaultCountdown('subathon'); profile.initialSeconds = 100;
      assert.equal((await post('/countdowns/subathon/config', profile)).status, 200);
      assert.equal((await post('/countdowns/subathon/control', { action: 'start' })).status, 200);
      assert.equal((await post('/countdowns/subathon/control', { action: 'add', seconds: '100' })).status, 400);
      const paused = await post('/countdowns/subathon/control', { action: 'pause' });
      assert.equal((await paused.json()).runs.subathon.status, 'paused');
      assert.equal((await fetch(`${base}/api/countdowns/overlay/subathon?token=invalid`)).status, 403);
      assert.equal((await fetch(`${base}/api/countdowns/overlay/no-profile?token=qa-overlay`)).status, 400);
      const overlay = await fetch(`${base}/api/countdowns/overlay/subathon?token=qa-overlay`);
      assert.equal(overlay.status, 200); assert.equal((await overlay.json()).profile.id, 'subathon');
      const token = 'synthetic-provider-token';
      const saved = await post('/countdowns/connections/streamlabs', { enabled: false, channel: '', username: '', token });
      assert.equal(saved.status, 200); assert.doesNotMatch(await saved.text(), new RegExp(token));
      const connections = await fetch(`${base}/api/countdowns/connections`);
      const snapshot = await connections.text(); assert.doesNotMatch(snapshot, new RegExp(token));
      assert.equal(JSON.parse(snapshot).streamlabs.configured, true);
      assert.doesNotMatch(await fs.readFile(path.join(directory, 'data/secrets.json'), 'utf8'), new RegExp(token));
    });
  } finally { process.chdir(previous); await fs.rm(directory, { recursive: true, force: true }); }
});

test('multi-overlay API keeps OBS sources independent, validates input and requires a session', async t => {
  const { OverlayLibrary } = await import('../src/server/overlayLibrary.ts');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'overlays-api-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const library = new OverlayLibrary(path.join(dir, 'overlays.json'), path.join(dir, 'legacy.json'));
  t.mock.getter(botService, 'overlayLibrary', () => library);
  t.mock.method(botService, 'overlayTokenMatches', token => token === 'test-overlay-token');
  await withApi(async (base, sessionToken) => {
    const request = async (url: string, method = 'GET', body?: unknown, authorized = true) => fetch(`${base}/api${url}`, {
      method, headers: { 'Content-Type': 'application/json', ...(authorized ? { 'X-Bot-Session': sessionToken } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    assert.equal((await request('/overlays', 'POST', { name: 'Blocked' }, false)).status, 403);
    const first = library.list()[0];
    const created = await request('/overlays', 'POST', { name: 'Second' });
    assert.equal(created.status, 201);
    const second = await created.json();
    assert.equal((await request(`/overlays/${second.id}`, 'PUT', { options: { ...second.options, accent: '#123456' } })).status, 200);
    const access = (id?: string) => request(`/overlay/access?token=test-overlay-token${id === undefined ? '' : `&id=${id}`}`);
    assert.equal((await (await access(second.id)).json()).options.accent, '#123456');
    assert.notEqual((await (await access(first.id)).json()).options.accent, '#123456');
    assert.equal((await (await access()).json()).id, first.id);
    assert.equal((await request(`/overlay/access?token=wrong&id=${second.id}`)).status, 404);
    assert.equal((await request(`/overlays/${second.id}`, 'PATCH', { name: '' })).status, 400);
    assert.equal((await request(`/overlays/${second.id}`, 'PUT', { options: { scale: 'bad' } })).status, 400);
    const renamed = await (await request(`/overlays/${second.id}`, 'PATCH', { name: 'Renamed' })).json();
    assert.equal(renamed.id, second.id);
    const copy = await (await request('/overlays', 'POST', { name: 'Copy', sourceId: second.id })).json();
    assert.notEqual(copy.id, second.id); assert.equal(copy.options.accent, '#123456');
    assert.equal((await request(`/overlays/${second.id}`, 'DELETE')).status, 200);
    assert.equal((await access(second.id)).status, 404);
    assert.equal((await access(copy.id)).status, 200);
    await request(`/overlays/${first.id}`, 'DELETE');
    assert.equal((await access()).status, 404);
    assert.equal((await access(copy.id)).status, 200);
  });
});

test('Spotify playlist retry endpoint is session protected and exposes durable results', async t => {
  const { StreamPlaylistService } = await import('../src/server/streamPlaylistService.ts');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spotify-retry-api-'));
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  const store = new StreamPlaylistService(path.join(dir, 'playlist.json'));
  const target = 'spotify:playlist:1234567890123456789012';
  const spotify = { isConnected: () => true, resolvePlaylistTrack: async () => ({state:'not_found' as const}), addToPlaylist: async () => ({success:true, alreadyExists:true}) };
  t.mock.method(botService, 'getStreamPlaylistService', () => store);
  t.mock.method(botService, 'getSpotifyService', () => spotify as unknown as ReturnType<typeof botService.getSpotifyService>);
  t.mock.method(botService, 'getFullState', () => ({config:{streamPlaylistUrl:target}} as ReturnType<typeof botService.getFullState>));
  await store.addTrack({id:'retry-track', title:'Song', artist:'Artist', spotifyUri:'spotify:track:1234567890123456789012', url:'', duration:100} as import('../src/types.ts').Track, 'Viewer');
  await withApi(async (base, token) => {
    assert.equal((await fetch(`${base}/api/stream-playlist/retry-track/retry`, {method:'POST'})).status, 403);
    assert.equal((await fetch(`${base}/api/stream-playlist/retry-track/retry`, {method:'POST', headers:{'Content-Type':'application/json','X-Bot-Session':token}, body:JSON.stringify({useConfiguredPlaylist:'yes'})})).status, 400);
    const response = await fetch(`${base}/api/stream-playlist/retry-track/retry`, {method:'POST', headers:{'X-Bot-Session':token}});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).entry.spotifySync.state, 'already_present');
    assert.equal((await fetch(`${base}/api/stream-playlist/missing/retry`, {method:'POST', headers:{'X-Bot-Session':token}})).status, 404);
    assert.equal(new StreamPlaylistService(path.join(dir,'playlist.json')).getItems()[0].addedToSpotify, true);
  });
});

test('greeting administration requires sessions; OBS claims require token, selected overlay and visible widget',async t=>{
 const {GreetingService}=await import('../src/server/greetingService.ts');
 const {OverlayLibrary}=await import('../src/server/overlayLibrary.ts');
 const {placeWidget,sceneFromLegacy}=await import('../src/scene.ts');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'greeting-api-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let now=Date.now();const greetings=new GreetingService(path.join(dir,'greetings.json'),()=>now);
 const library=new OverlayLibrary(path.join(dir,'overlays.json'),path.join(dir,'old.json'));const overlay=library.get(library.legacyId);
 library.update(overlay.id,{...overlay.options,scene:placeWidget(sceneFromLegacy(overlay.options.chat),'greeting')});
 t.mock.getter(botService,'overlayLibrary',()=>library);t.mock.method(botService,'overlayTokenMatches',value=>value==='test-greeting-token');
 t.mock.method(botService,'resolveGreetingUser',async()=>({userId:'123',login:'viewer',name:'Viewer'}));
 await withApi(async(base,session)=>{
  const post=(url:string,body:unknown,auth=true)=>fetch(`${base}/api${url}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'X-Bot-Session':session}:{})},body:JSON.stringify(body)});
  assert.equal((await post('/greetings',{},false)).status,403);
  const gif=await post('/greetings/media',{kind:'gif',dataUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'});assert.equal(gif.status,200);
  const gifUrl=(await gif.json()).url;
  const settings={outputOverlayId:overlay.id,profiles:[{userId:'123',login:'viewer',name:'Viewer',enabled:true,soundEnabled:false,soundUrl:'',volume:50,gifEnabled:true,gifUrl,seconds:5}]};
  assert.equal((await post('/greetings',settings)).status,200);
  greetings.setLive({id:'1001',channelId:'99',startedAt:now-1000});greetings.accept({id:'message',userId:'123',channelId:'99',at:now});
  const claim={token:'test-greeting-token',overlayId:overlay.id,clientId:'browser-one'};
  assert.equal((await post('/greetings/output',{...claim,token:'bad'},false)).status,404);
  const first=await post('/greetings/output',claim,false);assert.equal(first.status,200);assert.ok((await first.json()).event);
  assert.equal((await (await post('/greetings/output',{...claim,clientId:'browser-two'},false)).json()).event,null);
  const widget=library.get(overlay.id).options;widget.scene!.widgets.find(w=>w.type==='greeting')!.visible=false;library.update(overlay.id,widget);
  assert.equal((await post('/greetings/output',claim,false)).status,404);
  assert.equal((await post('/greetings/media',{kind:'gif',dataUrl:'data:image/gif;base64,PGh0bWw+'})).status,400);
  const snapshot=await (await fetch(`${base}/api/greetings`)).json();assert.equal('seen' in snapshot,false);
 },greetings);
});
