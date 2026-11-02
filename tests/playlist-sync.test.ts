import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StreamPlaylistService, type PlaylistSpotifyClient } from '../src/server/streamPlaylistService.ts';
import type { Track } from '../src/types.ts';
const target = 'spotify:playlist:1234567890123456789012';
const uri = 'spotify:track:1234567890123456789012';
const track = { id: 'one', title: 'Song', artist: 'Artist', duration: 180, url: '', spotifyUri: uri } as Track;
function setup(t: { after: (fn: () => void) => void }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playlist-sync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'playlist.json');
  return { file, service: new StreamPlaylistService(file) };
}
function client(patch: Partial<PlaylistSpotifyClient> = {}): PlaylistSpotifyClient {
  return { isConnected: () => true, resolvePlaylistTrack: async () => ({ state: 'matched', uri }), addToPlaylist: async () => ({ success: true }), ...patch };
}
test('local entry and pending state exist before Spotify; success survives restart', async t => {
  const w = setup(t);
  const result = await w.service.addTrack(track, 'Viewer', client({ addToPlaylist: async () => {
    assert.equal(JSON.parse(fs.readFileSync(w.file, 'utf8'))[0].spotifySync.state, 'pending');
    return { success: true };
  } }), target);
  assert.equal(result.success, true);
  assert.equal(new StreamPlaylistService(w.file).getItems()[0].spotifySync?.state, 'added');
});
test('failed/ambiguous transfers preserve local entries and can retry without duplicates', async t => {
  const w = setup(t); let writes = 0;
  const spotify = client({ addToPlaylist: async () => { writes++; return { success: false, uncertain: false, error: 'synthetic private token' }; } });
  await w.service.addTrack(track, 'Viewer', spotify, target);
  assert.equal(w.service.getItems()[0].spotifySync?.state, 'failed');
  assert.doesNotMatch(fs.readFileSync(w.file, 'utf8'), /synthetic private token/);
  const restarted = new StreamPlaylistService(w.file);
  const retryClient = client({ addToPlaylist: async () => { writes++; return { success: true, alreadyExists: true }; } });
  await Promise.all([restarted.retrySpotify(track.id, retryClient, target), restarted.retrySpotify(track.id, retryClient, target)]);
  assert.equal(restarted.getItems()[0].spotifySync?.state, 'already_present');
  assert.equal(writes, 2);
  await restarted.addTrack({ ...track, id: 'two', title: 'Another', spotifyUri: undefined }, 'Viewer', client({ resolvePlaylistTrack: async () => ({ state: 'ambiguous' }) }), target);
  assert.equal(restarted.getItems()[1].spotifySync?.state, 'needs_match');
});
test('duplicate chat additions serialize, missing config stays visible, historical entries are untouched', async t => {
  const w = setup(t); let writes = 0;
  const spotify = client({ addToPlaylist: async () => { writes++; return { success: true }; } });
  await Promise.all([w.service.addTrack(track, 'A', spotify, target), w.service.addTrack(track, 'B', spotify, target)]);
  assert.equal(writes, 1);
  await w.service.addTrack({ ...track, id: 'other', title: 'Other', spotifyUri: undefined }, 'A', spotify);
  assert.equal(w.service.getItems()[1].spotifySync?.state, 'pending');
  assert.equal(w.service.getItems()[1].addedToSpotify, false);
});

import { SpotifyService } from '../src/server/spotifyService.ts';
test('Spotify scans later pages, uses /items and serializes membership checks with writes', async () => {
  const spotify = Object.create(SpotifyService.prototype) as SpotifyService;
  let present = false, posts = 0;
  Object.assign(spotify, { playlistWrites: Promise.resolve(), api: async (endpoint: string, init?: RequestInit) => {
    assert.match(endpoint, /^\/playlists\/1234567890123456789012\/items/);
    if (init?.method === 'POST') { present = true; posts++; return Response.json({ snapshot_id: 'saved' }, { status: 201 }); }
    const offset = Number(new URL('https://test' + endpoint).searchParams.get('offset'));
    return Response.json(offset === 0 ? { items: Array.from({length:50}, () => ({item:{uri:'other'}})), next: 'next-page' } : {items: present ? [{ item: { uri } }] : [], next: null});
  }});
  const results = await Promise.all([spotify.addToPlaylist(target, uri), spotify.addToPlaylist(target, uri)]);
  assert.equal(posts, 1); assert.equal(results[1].alreadyExists, true);
});
test('uncertain write results are checked again before retrying and never blindly posted twice', async () => {
  const spotify = Object.create(SpotifyService.prototype) as SpotifyService;
  let present = false, posts = 0;
  Object.assign(spotify, { playlistWrites: Promise.resolve(), api: async (_endpoint: string, init?: RequestInit) => {
    if (init?.method === 'POST') { present = true; posts++; throw new Error('synthetic access token'); }
    return Response.json({items: present ? [{item:{uri}}] : [], next:null});
  }});
  const first = await spotify.addToPlaylist(target, uri);
  assert.equal(first.success, false); assert.equal(first.uncertain, true);
  assert.doesNotMatch(first.error!, /synthetic access token/);
  assert.equal((await spotify.addToPlaylist(target, uri)).alreadyExists, true);
  assert.equal(posts, 1);
});
test('matching rejects alternate versions, artist mismatches and ambiguous exact matches', async () => {
  const spotify = Object.create(SpotifyService.prototype) as SpotifyService;
  let catalog = [{uri, name:'Song', artists:[{name:'Artist'}], duration_ms:180000}];
  Object.assign(spotify, { searchSpotifyCatalog: async () => catalog });
  assert.equal((await spotify.resolvePlaylistTrack(track)).state, 'matched');
  catalog = [...catalog, {...catalog[0], uri:'spotify:track:abcdefghijklmnopqrstuv'}];
  assert.equal((await spotify.resolvePlaylistTrack(track)).state, 'ambiguous');
  catalog = [{...catalog[0], name:'Song (Live)'}];
  assert.equal((await spotify.resolvePlaylistTrack(track)).state, 'ambiguous');
  catalog = [{...catalog[0], name:'Song', artists:[{name:'Wrong artist'}]}];
  assert.equal((await spotify.resolvePlaylistTrack(track)).state, 'ambiguous');
  catalog = [];
  assert.equal((await spotify.resolvePlaylistTrack(track)).state, 'not_found');
});
test('uncertain transfers persist a retry delay and keep their original target across configuration changes', async t => {
  const w = setup(t); let calls = 0;
  const spotify = client({ addToPlaylist: async () => { calls++; return {success:false, uncertain:true}; } });
  await w.service.addTrack(track, 'Viewer', spotify, target);
  const restarted = new StreamPlaylistService(w.file);
  await restarted.retrySpotify(track.id, spotify, 'spotify:playlist:abcdefghijklmnopqrstuv');
  assert.equal(calls, 1);
  assert.equal(restarted.getItems()[0].spotifySync?.playlist, target);
});

test('a failed final disk write never advertises unpersisted Spotify success', async t => {
  const w = setup(t);
  await w.service.addTrack(track, 'Viewer', client({addToPlaylist: async () => {
    fs.renameSync(w.file, w.file + '.saved'); fs.mkdirSync(w.file);
    return {success:true};
  }}), target);
  assert.equal(w.service.getItems()[0].spotifySync?.state, 'pending');
  assert.equal(w.service.getItems()[0].addedToSpotify, false);
});
test('rate-limit waits from adding and searching are durable and enforced on retry', async t => {
  const w = setup(t); let calls = 0;
  const limited = client({addToPlaylist: async () => { calls++; return {success:false, uncertain:false, error:'Spotify-Anfragelimit: nach 120 Sekunden erneut versuchen.'}; }});
  await w.service.addTrack(track, 'Viewer', limited, target);
  const restarted = new StreamPlaylistService(w.file);
  assert.ok(restarted.getItems()[0].spotifySync!.retryAfter! >= Date.now() + 119000);
  await restarted.retrySpotify(track.id, limited, target);
  assert.equal(calls, 1);
  await w.service.addTrack({...track, id:'search', title:'Search', spotifyUri:undefined}, 'Viewer', client({ resolvePlaylistTrack: async () => { throw new Error('Spotify Rate Limit aktiv. Erneut in 120s versuchen.'); } }), target);
  assert.ok(w.service.getItems()[1].spotifySync!.retryAfter! >= Date.now() + 119000);
});

test('an inaccessible Spotify playlist has an actionable error and no uncertain-write cooldown',async t=>{
 const w=setup(t);
 const spotify=Object.create(SpotifyService.prototype) as SpotifyService;
 Object.assign(spotify,{playlistWrites:Promise.resolve(),api:async()=>Response.json({error:{message:'Resource not found'}},{status:404})});
 const result=await spotify.addToPlaylist(target,uri);
 assert.equal(result.success,false);assert.equal(result.uncertain,false);
 await w.service.addTrack(track,'Viewer',client({addToPlaylist:async()=>result}),target);
 const sync=w.service.getItems()[0].spotifySync;
 assert.match(sync?.message||'',/nicht gefunden|nicht zugänglich/);
 assert.equal(sync?.retryAfter,undefined);
});

test('changing a failed transfer target requires an explicit retry choice',async t=>{
 const w=setup(t),newTarget='spotify:playlist:abcdefghijklmnopqrstuv',destinations:string[]=[];
 await w.service.addTrack(track,'Viewer',client({addToPlaylist:async()=>({success:false,uncertain:false,error:'HTTP 404'})}),target);
 const spotify=client({addToPlaylist:async value=>{destinations.push(value);return {success:false,uncertain:false,error:'HTTP 404'};}});
 await w.service.retrySpotify(track.id,spotify,newTarget);
 assert.deepEqual(destinations,[target]);
 await w.service.retrySpotify(track.id,client({addToPlaylist:async value=>{destinations.push(value);return {success:true};}}),newTarget,true);
 assert.deepEqual(destinations,[target,newTarget]);
 assert.equal(w.service.getItems()[0].spotifySync?.state,'added');
});

test('source Spotify IDs are used directly by !playlist for YouTube playback',async t=>{
 const w=setup(t);let matched=0,transferred='';
 const spotify=client({resolvePlaylistTrack:async()=>{matched++;return {state:'not_found'};},addToPlaylist:async(_target,value)=>{transferred=value;return {success:true};}});
 await w.service.addTrack({...track,spotifyUri:undefined,sourceSpotifyUri:uri,playbackProvider:'youtube_music'},'Viewer',spotify,target);
 assert.equal(matched,0);assert.equal(transferred,uri);assert.equal(w.service.getItems()[0].playbackProvider,'youtube_music');
});
