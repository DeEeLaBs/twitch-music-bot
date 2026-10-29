import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QueueManager } from '../src/server/queueManager.ts';
import { YtmCompanionClient } from '../src/server/ytmCompanion.ts';
import { YouTubeResolver } from '../src/server/youtubeResolver.ts';
import { validateConfig } from '../src/server/validation.ts';
import { ConfigService } from '../src/server/configService.ts';
import { flushScheduledWrites } from '../src/server/atomicStore.ts';
import { SpotifyService } from '../src/server/spotifyService.ts';
import type { BotConfig, Track } from '../src/types.ts';
const config = { maxSongDurationSeconds: 420, maxActivePerViewer: 2, voteSkipThreshold: 1, autoPlayRadio: true, language: 'de' } as BotConfig;
const viewer = { username: 'viewer', displayName: 'Viewer', badge: 'viewer' as const };
const track = (id = 'abcdefghijk') => ({ videoId: id, title: 'Song ' + id, artist: 'Artist', duration: 120, thumbnailUrl: '', url: 'https://music.youtube.com/watch?v=' + id });
function makeTestConfigFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'musicbot-cfg-test-'));
  return path.join(dir, 'bot-config.json');
}
class Player {
  callback: any; calls: Track[] = []; skips = 0; pauses = 0; accept = true; confirm = true;
  subscribe(cb: any) { this.callback = cb; }
  getIsSimulation() { return false; }
  getLastCommandError() { return this.accept ? '' : 'HTTP 401'; }
  emit(id: string, progress = 0, playing = true, adPlaying = false) { this.callback({ songInfo: { id, title: 'Song ' + id, author: 'Artist' }, isConnected: true, isPlaying: playing, adPlaying, progressSeconds: progress, durationSeconds: 120, volume: 0 }); }
  async playTrack(t: Track) { this.calls.push(t); if (this.accept && this.confirm) this.emit(t.videoId!); return this.accept; }
  async skipTrack() { this.skips++; return this.accept; }
  async pause() { this.pauses++; return true; }
}
let cwd: string, temporary: string;
beforeEach(() => { cwd = process.cwd(); temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-')); process.chdir(temporary); });
afterEach(() => { process.chdir(cwd); fs.rmSync(temporary, { recursive: true, force: true }); });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
test('pending request ignores stale track updates and concurrent next calls', async () => {
 const p = new Player(); p.confirm = false; const q = new QueueManager(config, p as any);
 q.addSong(track(), viewer); const first = q.playNext(); assert.equal(q.playNext(), first);
 await tick(); q.addSong(track('lmnopqrstuv'), viewer); p.emit('oldoldold12');
 assert.equal(p.calls.length, 1); assert.equal(q.getQueue().length, 1); assert.equal(q.getCurrentTrack(), null);
 assert.equal(q.getPlaybackState().status, 'loading');
 flushScheduledWrites(); const saved = JSON.parse(fs.readFileSync('data/queue.json', 'utf8')); assert.equal(saved.queue.length, 1); assert.equal(saved.active.videoId, 'abcdefghijk');
 p.emit('abcdefghijk'); await first;
 assert.equal(q.getCurrentTrack()?.videoId, 'abcdefghijk'); assert.equal(q.getQueue().length, 1);
});
test('failed command preserves request and exposes failure', async () => {
 const p = new Player(); p.accept = false; const q = new QueueManager(config, p as any);
 q.addSong(track(), viewer); await q.playNext();
 assert.equal(q.getQueue().length, 1); assert.equal(q.getCurrentTrack(), null); assert.match(q.getPlaybackState().error!, /401/);
 flushScheduledWrites(); assert.equal(JSON.parse(fs.readFileSync('data/queue.json', 'utf8')).queue.length, 1);
});
test('unconfirmed accepted command preserves request on deadline', async () => {
 const p = new Player(); p.confirm = false; const q = new QueueManager(config, p as any);
 q.addSong(track(), viewer); const promise = q.playNext(); await tick(); (q as any).confirmStart(false); await promise;
 assert.equal(q.getQueue().length, 1); assert.match(q.getPlaybackState().error!, /nicht bestätigt/);
});
test('vote skip on final request really calls next', async () => {
 const p = new Player(); const q = new QueueManager(config, p as any);
 q.addSong(track(), viewer); await q.playNext();
 const result = await q.castVoteSkip('voter'); assert.equal(p.skips, 1); assert.equal(result.didSkip, true); assert.equal(q.getCurrentTrack(), null);
});
test('vote skip does not report success after rejected next', async () => {
 const p = new Player(); const q = new QueueManager(config, p as any);
 q.addSong(track(), viewer); await q.playNext(); p.accept = false;
 const result = await q.castVoteSkip('voter'); assert.equal(result.success, false); assert.equal(result.didSkip, false); assert.ok(q.getCurrentTrack());
});
test('vote skip accepts YouTube autoplay radio and resets votes for the next song', async () => {
 const p = new Player();
 const q = new QueueManager({ ...config, voteSkipThreshold: 2 }, p as any);
 p.emit('abcdefghijk');
 assert.equal(q.getPlaybackState().source, 'autoplay_radio');
 assert.equal((await q.castVoteSkip('first')).currentVotes, 1);
 assert.equal(q.getVoteSkipState().currentTrackId, 'ytm-abcdefghijk');
 p.emit('lmnopqrstuv');
 assert.equal(q.getVoteSkipState().votes.length, 0);
 assert.equal((await q.castVoteSkip('first')).currentVotes, 1);
 const result = await q.castVoteSkip('second');
 assert.equal(result.success, true);
 assert.equal(result.didSkip, true);
 assert.equal(p.skips, 1);
});
test('active request counts toward viewer quota and duplicates rejected', async () => {
 const p = new Player(); const q = new QueueManager(config, p as any);
 q.addSong(track(), viewer); await q.playNext();
 assert.equal(q.addSong(track(), viewer).success, false);
 assert.equal(q.addSong(track('lmnopqrstuv'), viewer).success, true);
 assert.equal(q.addSong(track('zyxwvutsrqp'), viewer).success, false);
});
test('unknown duration rejected; zero volume and backward seek preserved', async () => {
 const p = new Player(); const q = new QueueManager(config, p as any);
 assert.equal(q.addSong({ ...track(), duration: 0 }, viewer).success, false);
 q.addSong(track(), viewer); await q.playNext(); p.emit('abcdefghijk', 50); p.emit('abcdefghijk', 0);
 assert.equal(q.getPlaybackState().volume, 0); assert.equal(q.getPlaybackState().progressSeconds, 0);
});
test('different IDs with same titles cannot match', async () => {
 const p = new Player(); const q = new QueueManager(config, p as any);
 assert.equal((q as any).isSameTrack({ id: 'lmnopqrstuv', title: track().title, author: 'Artist' }, { ...track(), artist: 'Artist' }), false);
});
test('direct link confirms a YouTube Music catalog replacement with matching metadata and duration', async () => {
 const p = new Player(); p.confirm = false; const q = new QueueManager(config, p as any);
 q.addSong({ ...track(), requestSource: 'youtube' }, viewer);
 const pending = q.playNext(); await tick();
 p.callback({ songInfo: { id: 'lmnopqrstuv', title: track().title, author: 'Artist' }, isConnected: true, isPlaying: true, adPlaying: false, progressSeconds: 1, durationSeconds: 120, volume: 50 });
 await pending;
 assert.equal(q.getCurrentTrack()?.playbackId, 'lmnopqrstuv');
 assert.equal(q.getQueue().length, 0);
});
test('catalog replacement rejects a different song even when the title matches', async () => {
 const p = new Player(); p.confirm = false; const q = new QueueManager(config, p as any);
 q.addSong(track(), viewer); const pending = q.playNext(); await tick();
 p.callback({ songInfo: { id: 'lmnopqrstuv', title: track().title, author: 'Other Artist' }, isConnected: true, isPlaying: true, adPlaying: false, progressSeconds: 1, durationSeconds: 120, volume: 50 });
 assert.equal(q.getCurrentTrack(), null);
 (q as any).confirmStart(false); await pending;
 assert.equal(q.getQueue().length, 1);
});
test('old direct-link cache entries with swapped title and artist are corrected', async () => {
 const id = 'ZAt8oxY0GQo';
 (YouTubeResolver as any).cache.set(`vid:${id}`, { expiresAt: Date.now() + 60_000, value: { channel: 'Linkin Park', videoId: id, title: 'Linkin Park', artist: 'Heavy Is the Crown (Official Audio)', duration: 167, thumbnailUrl: '', url: `https://music.youtube.com/watch?v=${id}` } });
 try {
  const resolved = await YouTubeResolver.resolve(`https://music.youtube.com/watch?v=${id}`);
  assert.equal(resolved.title, 'Heavy Is the Crown (Official Audio)');
  assert.equal(resolved.artist, 'Linkin Park');
 } finally { (YouTubeResolver as any).cache.delete(`vid:${id}`); }
});
test('disabled autoplay pauses when confirmed request ends', async () => {
 const p = new Player(); const q = new QueueManager({ ...config, autoPlayRadio: false }, p as any);
 q.addSong(track(), viewer); await q.playNext(); p.emit('abcdefghijk', 120, false);
 assert.equal(p.pauses, 1); assert.equal(q.getHistory().length, 1);
});
test('configuration rejects unknown keys, bad limits and remote addresses', () => {
 assert.throws(() => validateConfig({ maxActivePerViewer: -1 }));
 assert.throws(() => validateConfig({ ytmdaCompanionUrl: 'http://evil.example:9863' }));
 assert.throws(() => validateConfig({ unknown: 1 }));
 assert.throws(() => validateConfig({ tabOrder: 'invalid' }));
 assert.deepEqual(validateConfig({ maxActivePerViewer: 2, ytmdaCompanionUrl: 'http://127.0.0.1:9863' }), { maxActivePerViewer: 2, ytmdaCompanionUrl: 'http://127.0.0.1:9863' });
 assert.deepEqual(validateConfig({ channelPointsEnabled: true, channelPointsRewardId: '', tabOrder: ['player', 'settings'] }), { channelPointsEnabled: true, channelPointsRewardId: '', tabOrder: ['player', 'settings'] });
});
test('401 sends only official command and never simulates success', async t => {
 let calls = 0;
 t.mock.method(globalThis, 'fetch', async (url: string, options: any) => { calls++; assert.match(url, /127\.0\.0\.1:9863\/api\/v1\/command$/); assert.equal(options.headers.Authorization, 'secret'); return new Response('{}', { status: 401 }); });
 const client = new YtmCompanionClient('http://localhost:9863', 'secret');
 assert.equal(await client.playPause(), false); assert.equal(calls, 1); assert.equal(client.getIsSimulation(), false); assert.equal(client.getIsConnected(), false);
});
test('setVolume sends numeric zero with official payload', async t => {
 t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => { assert.deepEqual(JSON.parse(options.body), { command: 'setVolume', data: 0 }); return new Response(null, { status: 204 }); });
 const client = new YtmCompanionClient(undefined, 'secret'); assert.equal(await client.setVolume(0), true);
});
test('failed YouTube search never fabricates a playable track', async t => {
 t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
 await assert.rejects(YouTubeResolver.resolve('my unavailable song'), /Suche fehlgeschlagen/);
 await assert.rejects(YouTubeResolver.resolve('abcdefghijk'), /Dauer nicht verfügbar/);
});
test('pairing verifies token, blocks parallel requests and exposes no token in diagnostics', async t => {
 let release: (value: Response) => void = () => {};
 t.mock.method(globalThis, 'fetch', async (url: string, options: any) => {
   if (url.endsWith('requestcode')) return Response.json({ code: '1234' });
   if (url.endsWith('/auth/request')) return new Promise<Response>(resolve => { release = resolve; });
   assert.equal(options.headers.Authorization, 'new-secret'); return Response.json({ player: { trackState: 0, volume: 30 }, video: null });
 });
 const client = new YtmCompanionClient();
 t.mock.method(client as any, 'connectRealtime', () => {});
 let saved = ''; client.onTokenAcquired(token => { saved = token; });
 assert.equal((await client.startPairing()).success, true);
 assert.equal((await client.startPairing()).success, false);
 assert.notEqual(client.getPairingState().status, 'success');
 release(Response.json({ token: 'new-secret' })); await tick();
 assert.equal(saved, 'new-secret'); assert.equal(client.getPairingState().status, 'success');
 assert.equal(JSON.stringify(client.getLastDiagnosticResult()).includes('new-secret'), false); client.disconnect();
});
test('fresh token rejected by server never yields pairing success', async t => {
 t.mock.method(globalThis, 'fetch', async (url: string) => url.endsWith('requestcode') ? Response.json({ code: '1234' }) : url.endsWith('/auth/request') ? Response.json({ token: 'bad-secret' }) : Response.json({}, { status: 401 }));
 const client = new YtmCompanionClient(); await client.startPairing(); await tick();
 assert.equal(client.getPairingState().status, 'error'); assert.equal(client.getIsConnected(), false); client.disconnect();
});

test('restart restores current requester when player still matches', async () => {
 const p = new Player(); const q = new QueueManager(config, p as any); q.addSong(track(), viewer); await q.playNext(); flushScheduledWrites();
 const p2 = new Player(); const restored = new QueueManager(config, p2 as any); p2.emit('abcdefghijk', 30);
 assert.equal(restored.getCurrentTrack()?.requester.username, 'viewer'); assert.equal(restored.getPlaybackState().progressSeconds, 30); assert.equal(p2.calls.length, 0);
});
test('restart preserves previous request if player has changed', async () => {
 const p = new Player(); const q = new QueueManager(config, p as any); q.addSong(track(), viewer); await q.playNext(); flushScheduledWrites();
 const p2 = new Player(); const restored = new QueueManager(config, p2 as any); p2.emit('lmnopqrstuv');
 assert.equal(restored.getQueue()[0].videoId, 'abcdefghijk'); assert.equal(p2.calls.length, 0); assert.match(restored.getPlaybackState().error!, /wiederhergestellt/);
});

test('text request prefers YouTube Music Songs shelf before normal YouTube video search', async t => {
 const calls: string[] = [];
 const ytmData = {
   contents: { sectionListRenderer: { contents: [{ musicShelfRenderer: {
     title: { runs: [{ text: 'Titel' }] },
     contents: [{ musicResponsiveListItemRenderer: {
       playlistItemData: { videoId: 'musicid1234' },
       flexColumns: [
         { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Real Song' }] } } },
         { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Real Artist', navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }] } } }
       ],
       fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:21' }] } } }],
       thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://example.test/cover.jpg' }] } } }
     } }]
   } }] } }
 };
 t.mock.method(globalThis, 'fetch', async (url: any) => {
   calls.push(String(url));
   if (String(url).startsWith('https://music.youtube.com/search')) return new Response(`<script>var ytInitialData = ${JSON.stringify(ytmData)};</script>`, { status: 200 });
   throw new Error('normal YouTube fallback must not run');
 });
 const result = await YouTubeResolver.resolve('Real Artist Real Song');
 assert.equal(result.videoId, 'musicid1234');
 assert.equal(result.title, 'Real Song');
 assert.equal(result.artist, 'Real Artist');
 assert.equal(result.duration, 201);
 assert.equal(calls.length, 1);
 assert.match(calls[0], /^https:\/\/music\.youtube\.com\/search/);
});

test('text request falls back to normal YouTube when YTM has no Songs shelf', async t => {
 const calls: string[] = [];
 const youtubeData = { contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [{ videoRenderer: {
   videoId: 'videoid1234', title: { runs: [{ text: 'Fallback Artist - Fallback Song (Official Video)' }] }, ownerText: { runs: [{ text: 'Fallback Artist' }] }, lengthText: { simpleText: '4:02' }, thumbnail: { thumbnails: [{ url: 'https://example.test/video.jpg' }] }
 } }] } }] } } } } };
 t.mock.method(globalThis, 'fetch', async (url: any) => {
   calls.push(String(url));
   if (String(url).startsWith('https://music.youtube.com/search')) return new Response('<script>var ytInitialData = {"contents":{}};</script>', { status: 200 });
   if (String(url).startsWith('https://www.youtube.com/results')) return new Response(`<script>var ytInitialData = ${JSON.stringify(youtubeData)};</script>`, { status: 200 });
   throw new Error('unexpected request');
 });
 const result = await YouTubeResolver.resolve('Fallback Song');
 assert.equal(result.videoId, 'videoid1234');
 assert.equal(result.title, 'Fallback Song');
 assert.equal(result.duration, 242);
 assert.equal(calls.length, 2);
 assert.match(calls[0], /^https:\/\/music\.youtube\.com\/search/);
 assert.match(calls[1], /^https:\/\/www\.youtube\.com\/results/);
});

test('YouTube Music audio tracks are preferred over videos even without a Songs shelf', async t => {
 const calls: string[] = [];
 const item = (videoId: string, videoType: string) => ({ musicResponsiveListItemRenderer: {
  playlistItemData: { videoId },
  overlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchEndpoint: { watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: videoType } } } } } } } },
  flexColumns: [
   { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Real Song' }] } } },
   { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Real Artist' }] } } }
  ],
  fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:21' }] } } }]
 } });
 const ytmData = { contents: { sectionListRenderer: { contents: [{ musicShelfRenderer: {
  title: { runs: [{ text: 'Top results' }] },
  contents: [item('videoid1234', 'MUSIC_VIDEO_TYPE_OMV'), item('audioid1234', 'MUSIC_VIDEO_TYPE_ATV')]
 } }] } } };
 t.mock.method(globalThis, 'fetch', async (url: any) => {
  calls.push(String(url));
  if (String(url).startsWith('https://music.youtube.com/search')) return new Response(`<script>var ytInitialData = ${JSON.stringify(ytmData)};</script>`, { status: 200 });
  throw new Error('normal YouTube video search must not run');
 });
 const result = await YouTubeResolver.resolve('Real Artist Real Song audio priority');
 assert.equal(result.videoId, 'audioid1234');
 assert.equal(calls.length, 1);
});

test('ConfigService starts in English and preserves the saved language after restart', () => {
 const file = makeTestConfigFile();
 const service = new ConfigService(file);
 assert.equal(service.get().language, 'en');
 assert.equal(new ConfigService(file).get().language, 'en');
 service.update({ language: 'de' });
 assert.equal(new ConfigService(file).get().language, 'de');
 service.update({ language: 'en' });
 assert.equal(new ConfigService(file).get().language, 'en');
});

test('ConfigService preserves custom tabOrder after restart', () => {
 const file = makeTestConfigFile();
 const service = new ConfigService(file);
 const customOrder = ['commands', 'player', 'chat', 'settings'];
 service.update({ tabOrder: customOrder });
 const restarted = new ConfigService(file).get();
 assert.deepEqual(restarted.tabOrder, customOrder);
});

test('ConfigService keeps the selected channel-points reward after restart and partial updates', () => {
 const file = makeTestConfigFile();
 const service = new ConfigService(file);
 service.update({ twitchChannel: 'mychannel', twitchBotUsername: 'mybot', twitchBotOauthToken: 'oauth:abc', channelPointsEnabled: true, channelPointsRewardId: 'selected-reward' });
 service.update({ twitchChannel: 'mychannel', channelPointsEnabled: true });
 const restarted = new ConfigService(file).get();
 assert.equal(restarted.twitchChannel, 'mychannel');
 assert.equal(restarted.twitchBotUsername, 'mybot');
 assert.equal(restarted.twitchBotOauthToken, 'oauth:abc');
 assert.equal(restarted.channelPointsEnabled, true);
 assert.equal(restarted.channelPointsRewardId, 'selected-reward');
});

test('shutdown save preserves settings without replacing the last useful backup', () => {
 const file = makeTestConfigFile();
 const service = new ConfigService(file);
 service.update({ language: 'de', voteSkipThreshold: 5, channelPointsEnabled: true, channelPointsRewardId: 'reward-42' });
 service.update({ maxQueueSize: 75 });
 const backupBefore = fs.readFileSync(file + '.backup', 'utf8');
 service.save();
 assert.equal(fs.readFileSync(file + '.backup', 'utf8'), backupBefore);
 const restored = new ConfigService(file).get();
 assert.equal(restored.language, 'de');
 assert.equal(restored.voteSkipThreshold, 5);
 assert.equal(restored.maxQueueSize, 75);
 assert.equal(restored.channelPointsRewardId, 'reward-42');
 fs.writeFileSync(file, '{broken json');
 service.save();
 assert.equal(fs.readFileSync(file + '.backup', 'utf8'), backupBefore);
 assert.equal(new ConfigService(file).get().channelPointsRewardId, 'reward-42');
});

test('YouTube Music ranking prefers exact artist/title over noisy alternatives', async t => {
 const ytmData = {
   contents: { sectionListRenderer: { contents: [{ musicShelfRenderer: {
     title: { runs: [{ text: 'Songs' }] },
     contents: [
       { musicResponsiveListItemRenderer: {
         playlistItemData: { videoId: 'coverid12345' },
         flexColumns: [
           { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Numb Live Cover' }] } } },
           { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Cover Band', navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }] } } }
         ],
         fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:10' }] } } }]
       } },
       { musicResponsiveListItemRenderer: {
         playlistItemData: { videoId: 'exactid1234' },
         flexColumns: [
           { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Numb' }] } } },
           { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Linkin Park', navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }] } } }
         ],
         fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:07' }] } } }]
       } }
     ]
   } }] } }
 };
 t.mock.method(globalThis, 'fetch', async (url: any) => {
   if (String(url).startsWith('https://music.youtube.com/search')) return new Response(`<script>var ytInitialData = ${JSON.stringify(ytmData)};</script>`, { status: 200 });
   throw new Error('fallback not expected');
 });
 const result = await YouTubeResolver.resolve('Linkin Park Numb');
 assert.equal(result.videoId, 'exactid1234');
});

test('resolver caches repeated text searches', async t => {
 let calls = 0;
 const ytmData = {
   contents: { sectionListRenderer: { contents: [{ musicShelfRenderer: {
     title: { runs: [{ text: 'Songs' }] },
     contents: [{ musicResponsiveListItemRenderer: {
       playlistItemData: { videoId: 'cacheid1234' },
       flexColumns: [
         { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Cache Song' }] } } },
         { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Cache Artist', navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }] } } }
       ],
       fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '2:59' }] } } }]
     } }]
   } }] } }
 };
 t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(`<script>var ytInitialData = ${JSON.stringify(ytmData)};</script>`, { status: 200 }); });
 await YouTubeResolver.resolve('Cache Artist Cache Song unique');
 await YouTubeResolver.resolve('Cache Artist Cache Song unique');
 assert.equal(calls, 1);
});

test('ConfigService notifies subscribers once and migrates legacy channel-points config', () => {
 const file = makeTestConfigFile();
 fs.mkdirSync(path.dirname(file), { recursive: true });
 fs.writeFileSync(file, JSON.stringify({ twitchChannel: 'legacy', channelPointsRewardId: 'reward-1' }));
 const service = new ConfigService(file);
 assert.equal(service.get().channelPointsEnabled, true);
 let calls = 0; let changed: string[] = [];
 service.onChange((_cfg, keys) => { calls++; changed = keys as string[]; });
 service.update({ twitchChannel: 'newchannel' });
 assert.equal(calls, 1); assert.ok(changed.includes('twitchChannel'));
 service.update({ twitchChannel: 'newchannel' });
 assert.equal(calls, 1);
 const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
 assert.equal(persisted.configVersion, 5);
});

test('IRC parser preserves channel-points tags and decodes display-name escapes', async () => {
 const { parsePrivmsg } = await import('../src/server/twitchIrc.ts');
 const parsed = parsePrivmsg('@badges=subscriber/1;display-name=Some\\sUser;custom-reward-id=abc :someuser!x@x PRIVMSG #chan :Daft Punk - One More Time');
 assert.ok(parsed);
 assert.equal(parsed!.sender, 'someuser');
 assert.equal(parsed!.tags['display-name'], 'Some User');
 assert.equal(parsed!.tags['custom-reward-id'], 'abc');
 assert.equal(parsed!.message, 'Daft Punk - One More Time');
});


test('v1.4 stores OAuth secrets outside bot-config.json', () => {
 const file = makeTestConfigFile();
 const service = new ConfigService(file);
 service.update({ twitchBotOauthToken: 'oauth:super-secret', ytmdaAuthToken: 'ytm-secret' });
 const persisted = fs.readFileSync(file, 'utf8');
 assert.equal(persisted.includes('super-secret'), false);
 assert.equal(persisted.includes('ytm-secret'), false);
 assert.equal(fs.existsSync(path.join(path.dirname(file), 'secrets.json')), true);
 const restarted = new ConfigService(file).get();
 assert.equal(restarted.twitchBotOauthToken, 'oauth:super-secret');
 assert.equal(restarted.ytmdaAuthToken, 'ytm-secret');
});

test('queue supports configurable size, minimum duration and drag reorder backend', () => {
 const p=new Player(); const q=new QueueManager({...config,maxQueueSize:2,minSongDurationSeconds:30,preventRecentDuplicates:0},p as any);
 assert.equal(q.addSong({...track('shortid1234'),duration:10},viewer).success,false);
 assert.equal(q.addSong(track('firstid1234'),viewer).success,true);
 assert.equal(q.addSong(track('secondid123'),{...viewer,username:'other'}).success,true);
 assert.equal(q.addSong(track('thirdid1234'),{...viewer,username:'third'}).success,false);
 const second=q.getQueue()[1]; assert.equal(q.moveTrack(second.id,0),true); assert.equal(q.getQueue()[0].id,second.id);
});

test('config backup is written before replacement', () => {
 const file = makeTestConfigFile();
 const service = new ConfigService(file);
 service.update({ twitchChannel: 'first' });
 service.update({ twitchChannel: 'second' });
 assert.equal(fs.existsSync(file + '.backup'), true);
 const backup = JSON.parse(fs.readFileSync(file + '.backup', 'utf8'));
 assert.equal(backup.twitchChannel, 'first');
});

test('ConfigService restores a corrupted main config from backup and preserves zero cooldowns', () => {
 const file = makeTestConfigFile();
 const service = new ConfigService(file);
 service.update({ twitchChannel: 'backupchannel', requestCooldownSeconds: 0, globalRequestCooldownSeconds: 0, minSongDurationSeconds: 0 });
 service.update({ twitchChannel: 'newerchannel' });
 fs.writeFileSync(file, '{broken json');
 const recovered = new ConfigService(file).get();
 assert.equal(recovered.twitchChannel, 'backupchannel');
 assert.equal(recovered.requestCooldownSeconds, 0);
 assert.equal(recovered.globalRequestCooldownSeconds, 0);
 assert.equal(recovered.minSongDurationSeconds, 0);
 assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')));
 assert.equal(JSON.parse(fs.readFileSync(file + '.backup', 'utf8')).twitchChannel, 'backupchannel');
});

test('runtime config sanitizes malformed persisted command controls', () => {
 const file = makeTestConfigFile();
 fs.mkdirSync(path.dirname(file), { recursive: true });
 fs.writeFileSync(file, JSON.stringify({ configVersion: 4, commandPermissions: { sr: ['viewer', 'admin'], skip: 'moderator' }, commandCooldowns: { sr: 9999, skip: 'bad' } }));
 const loaded = new ConfigService(file).get();
 assert.deepEqual(loaded.commandPermissions?.sr, ['viewer']);
 assert.deepEqual(loaded.commandPermissions?.skip, ['moderator', 'broadcaster']);
 assert.equal(loaded.commandCooldowns?.sr, 600);
 assert.equal(typeof loaded.commandCooldowns?.skip, 'number');
});

test('legacy plaintext token migration leaves no plaintext config backup behind', () => {
 const file = makeTestConfigFile();
 fs.mkdirSync(path.dirname(file), { recursive: true });
 fs.writeFileSync(file, JSON.stringify({ configVersion: 3, twitchBotOauthToken: 'oauth:legacy-secret', ytmdaAuthToken: 'legacy-ytm' }));
 const service = new ConfigService(file);
 assert.equal(service.get().twitchBotOauthToken, 'oauth:legacy-secret');
 assert.equal(fs.readFileSync(file, 'utf8').includes('legacy-secret'), false);
 const backup = file + '.backup';
 if (fs.existsSync(backup)) assert.equal(fs.readFileSync(backup, 'utf8').includes('legacy-secret'), false);
});

test('no-result searches use negative cache without opening upstream circuit breaker', async t => {
 let calls=0;
 t.mock.method(globalThis,'fetch',async (url:any)=>{calls++; if(String(url).includes('music.youtube.com/search')) return new Response('<script>var ytInitialData = {"contents":{}};</script>',{status:200}); return new Response('<script>var ytInitialData = {"contents":{"twoColumnSearchResultsRenderer":{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[]}}]}}}}};</script>',{status:200});});
 for(let i=0;i<5;i++) await assert.rejects(YouTubeResolver.resolve(`definitely-no-result-${i}`));
 assert.equal(YouTubeResolver.getDiagnostics().circuitBreaker.open,false);
 const before=calls; await assert.rejects(YouTubeResolver.resolve('definitely-no-result-4')); assert.equal(calls,before);
});

test('YTM connection listeners report connect and disconnect transitions', () => {
 const client = new YtmCompanionClient();
 const states: boolean[] = [];
 client.onConnectionChange((connected) => states.push(connected));
 const parsed = (client as any).parseState({ player: { trackState: 0, volume: 50, videoProgress: 0 }, video: null });
 assert.equal(parsed, true);
 assert.deepEqual(states, [true]);
 client.disconnect();
 assert.deepEqual(states, [true, false]);
});

test('YTM playback survives two transient empty frames and clears on a stable idle state', () => {
 const client = new YtmCompanionClient();
 const snapshots: any[] = [];
 client.subscribe(state => snapshots.push(state));
 const active = { player: { hasSong: true, trackState: 1, isPaused: false, volume: 50, videoProgress: 15, duration: 200 }, video: { id: 'abcdefghijk', title: 'Stable song', author: 'Artist', duration: 200 } };
 const idle = { player: { hasSong: false, trackState: 2, isPaused: true, volume: 50, videoProgress: 0, duration: 0 }, video: null };
 (client as any).parseState(active);
 (client as any).parseState(idle);
 (client as any).parseState(idle);
 assert.equal(snapshots.at(-1)?.songInfo?.title, 'Stable song');
 (client as any).parseState(idle);
 assert.equal(snapshots.at(-1)?.songInfo, null);
});

test('YTM connection ignores two transient transport failures but disconnects on the third', () => {
 const client = new YtmCompanionClient();
 const transitions: boolean[] = [];
 client.onConnectionChange(connected => transitions.push(connected));
 (client as any).parseState({ player: { hasSong: true, trackState: 1, volume: 50, videoProgress: 1 }, video: { id: 'abcdefghijk', title: 'Stable song' } });
 (client as any).failure();
 (client as any).failure();
 assert.equal(client.getIsConnected(), true);
 assert.deepEqual(transitions, [true]);
 (client as any).failure();
 assert.equal(client.getIsConnected(), false);
 assert.deepEqual(transitions, [true, false]);
});

test('Spotify track links resolve public metadata and enqueue a matching YouTube Music song', async t => {
 const spotifyId = '4uLU6hMCjMI75M1A2tKUQC';
 const calls: string[] = [];
 const ytmData = {
   contents: { sectionListRenderer: { contents: [{ musicShelfRenderer: {
     title: { runs: [{ text: 'Songs' }] },
     contents: [{ musicResponsiveListItemRenderer: {
       playlistItemData: { videoId: 'spotytm0001' },
       flexColumns: [
         { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Never Gonna Give You Up' }] } } },
         { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Rick Astley', navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }] } } }
       ],
       fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:33' }] } } }],
       thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://example.test/ytm-cover.jpg' }] } } }
     } }]
   } }] } }
 };
 t.mock.method(globalThis, 'fetch', async (url: any) => {
   const value = String(url); calls.push(value);
   if (value.startsWith('https://open.spotify.com/oembed')) return Response.json({ title: 'Never Gonna Give You Up', thumbnail_url: 'https://example.test/spotify-cover.jpg', provider_name: 'Spotify' });
   if (value === `https://open.spotify.com/embed/track/${spotifyId}`) return new Response('<html><head><title>Never Gonna Give You Up - song and lyrics by Rick Astley | Spotify</title><meta property="og:description" content="Listen to Never Gonna Give You Up on Spotify. Rick Astley · Song · 1987."></head></html>', { status: 200 });
   if (value.startsWith('https://music.youtube.com/search')) return new Response(`<script>var ytInitialData = ${JSON.stringify(ytmData)};</script>`, { status: 200 });
   throw new Error(`unexpected request ${value}`);
 });
 const result = await YouTubeResolver.resolve(`https://open.spotify.com/track/${spotifyId}?si=test`);
 assert.equal(result.videoId, 'spotytm0001');
 assert.equal(result.title, 'Never Gonna Give You Up');
 assert.equal(result.artist, 'Rick Astley');
 assert.equal(result.requestSource, 'spotify');
 assert.equal(result.originalRequestUrl, `https://open.spotify.com/track/${spotifyId}`);
 assert.equal(result.sourceTitle, 'Never Gonna Give You Up');
 assert.equal(result.sourceArtist, 'Rick Astley');
 assert.ok(calls.some(url => url.startsWith('https://open.spotify.com/oembed')));
 assert.ok(calls.some(url => url.startsWith('https://music.youtube.com/search')));
});

test('Spotify embed extracts artists array and duration from Next.js payload', async t => {
  const spotifyId = '2fMZnyKZe2EN0czkRqeMc8';
  const nextData = {
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              type: 'track',
              id: spotifyId,
              title: 'Riot',
              artists: [{ name: 'Jaden', uri: 'spotify:artist:0xOeVMOz2fVg5BJY3N6akT' }],
              duration: 274986
            }
          }
        }
      }
    }
  };
  const ytmData = {
    contents: { sectionListRenderer: { contents: [{ musicShelfRenderer: {
      title: { runs: [{ text: 'Songs' }] },
      contents: [{ musicResponsiveListItemRenderer: {
        playlistItemData: { videoId: 'XmbnSnYneWE' },
        flexColumns: [
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Riot' }] } } },
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Jaden', navigationEndpoint: { browseEndpoint: { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } }] } } }
        ],
        fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '4:35' }] } } }],
        thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://example.test/ytm-cover.jpg' }] } } }
      } }]
    } }] } }
  };
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    const value = String(url);
    if (value.startsWith('https://open.spotify.com/oembed')) return Response.json({ title: 'Riot', thumbnail_url: 'https://example.test/riot.jpg', provider_name: 'Spotify' });
    if (value === `https://open.spotify.com/embed/track/${spotifyId}`) {
      return new Response(`<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head><body><h2 data-testid="subtitle"><a href="#">Jaden</a></h2></body></html>`, { status: 200 });
    }
    if (value.startsWith('https://music.youtube.com/search')) return new Response(`<script>var ytInitialData = ${JSON.stringify(ytmData)};</script>`, { status: 200 });
    throw new Error(`unexpected request ${value}`);
  });
  const result = await YouTubeResolver.resolve(`https://open.spotify.com/track/${spotifyId}`);
  assert.equal(result.videoId, 'XmbnSnYneWE');
  assert.equal(result.title, 'Riot');
  assert.equal(result.artist, 'Jaden');
  assert.equal(result.sourceArtist, 'Jaden');
  assert.equal(result.sourceTitle, 'Riot');
  assert.equal(result.requestSource, 'spotify');
});

test('Spotify URI and localized Spotify track URL are recognized', () => {
 const id = '4uLU6hMCjMI75M1A2tKUQC';
 assert.equal(YouTubeResolver.extractSpotifyTrackId(`spotify:track:${id}`), id);
 assert.equal(YouTubeResolver.extractSpotifyTrackId(`https://open.spotify.com/intl-de/track/${id}?si=abc`), id);
 assert.equal(YouTubeResolver.extractSpotifyTrackId('https://open.spotify.com/album/1234567890123456789012'), null);
});

test('SpotifyService status reflects configuration and falls back gracefully when preferred device is offline', async () => {
  const service = new SpotifyService('test-client-id', 'offline-device');
  const status = service.getStatus();
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.equal(status.preferredDeviceId, 'offline-device');

  (service as any).devices = async () => [
    { id: 'active-device-1', name: 'Desktop App', type: 'Computer', is_active: true }
  ];
  const target = await (service as any).targetDeviceId();
  assert.equal(target, 'active-device-1');

  service.stop();
});

test('adPlaying suppresses archiving and keeps current track synchronized', async () => {
  const p = new Player(); const q = new QueueManager(config, p as any);
  q.addSong(track('track000001'), viewer);
  q.addSong(track('track000002'), viewer);
  await q.playNext();
  assert.equal(q.getCurrentTrack()?.videoId, 'track000001');
  assert.equal(q.getQueue().length, 1);
  assert.equal(q.getHistory().length, 0);

  // Emit an ad event with foreign video id and adPlaying: true
  p.emit('advert12345', 5, true, true);

  // Verify that currentTrack was NOT archived and queue did NOT advance
  assert.equal(q.getCurrentTrack()?.videoId, 'track000001');
  assert.equal(q.getQueue().length, 1);
  assert.equal(q.getHistory().length, 0);

  // Emit actual track progress update after ad
  p.emit('track000001', 10, true, false);
  assert.equal(q.getCurrentTrack()?.videoId, 'track000001');
  assert.equal(q.getPlaybackState().progressSeconds, 10);
});

test('startNext synchronizes loading playbackState before confirmation', async () => {
  const p = new Player(); p.confirm = false; const q = new QueueManager(config, p as any);
  q.addSong(track('track000001'), viewer);
  const nextPromise = q.playNext();
  await tick();

  // In-flight track should already be reflected in playback state with status loading
  const state = q.getPlaybackState();
  assert.equal(state.currentSong?.videoId, 'track000001');
  assert.equal(state.status, 'loading');
  assert.equal(state.isPlaying, false);
  assert.equal(state.progressSeconds, 0);

  // Now companion confirms the track
  p.emit('track000001', 0, true, false);
  await nextPromise;

  const confirmedState = q.getPlaybackState();
  assert.equal(confirmedState.currentSong?.videoId, 'track000001');
  assert.equal(confirmedState.status, 'playing');
});

test('placeholder metadata never confirms a pending YouTube request', async () => {
  const p = new Player(); p.confirm = false; const q = new QueueManager(config, p as any);
  q.addSong(track('track000001'), viewer);
  const nextPromise = q.playNext();
  await tick();
  p.callback({
    songInfo: { id: 'track000001', title: 'Laden...', author: '' },
    isConnected: true, isPlaying: true, adPlaying: false,
    progressSeconds: 0, durationSeconds: 0, volume: 50
  });
  await tick();
  assert.equal(q.getCurrentTrack(), null);
  assert.equal(q.getPlaybackState().status, 'loading');

  p.emit('track000001');
  await nextPromise;
  assert.equal(q.getCurrentTrack()?.videoId, 'track000001');
  assert.equal(q.getPlaybackState().currentSong?.title, 'Song track000001');
});

test('YouTube Music catalog replacement confirms through the original radio seed id', async () => {
  const p = new Player(); p.confirm = false; const q = new QueueManager(config, p as any);
  q.addSong(track('fJ9rUzIMcZQ'), viewer);
  const nextPromise = q.playNext();
  await tick();
  p.callback({
    songInfo: {
      id: 'BSTsnWoslP4',
      requestedId: 'fJ9rUzIMcZQ',
      title: 'Bohemian Rhapsody',
      author: 'Queen'
    },
    isConnected: true, isPlaying: true, adPlaying: false,
    progressSeconds: 2, durationSeconds: 354, volume: 50
  });
  await nextPromise;
  assert.equal(q.getCurrentTrack()?.videoId, 'fJ9rUzIMcZQ');
  assert.equal(q.getCurrentTrack()?.playbackId, 'BSTsnWoslP4');
  assert.equal(q.getPlaybackState().status, 'playing');
  assert.equal(q.getQueue().length, 0);

  p.callback({
    songInfo: {
      id: '9X_ViIPA-Gc',
      requestedId: 'fJ9rUzIMcZQ',
      title: "I'd Do Anything For Love",
      author: 'Meat Loaf'
    },
    isConnected: true, isPlaying: true, adPlaying: false,
    progressSeconds: 4, durationSeconds: 452, volume: 50
  });
  assert.equal(q.getCurrentTrack(), null);
  assert.equal(q.getPlaybackState().currentSong?.title, "I'd Do Anything For Love");
  assert.equal(q.getPlaybackState().currentSong?.videoId, '9X_ViIPA-Gc');
  assert.equal(q.getPlaybackState().source, 'autoplay_radio');
  assert.equal(q.getHistory()[0]?.videoId, 'fJ9rUzIMcZQ');
});

test('seeking and companion buffer inflation preserves canonical duration', async () => {
  const p = new Player();
  const q = new QueueManager(config, p as any);
  q.addSong({ ...track('canonical123'), duration: 120 }, viewer);
  await q.playNext();

  // Initial playback update
  p.callback({
    songInfo: { id: 'canonical123', title: 'Song canonical123', author: 'Artist' },
    isConnected: true, isPlaying: true, adPlaying: false,
    progressSeconds: 10, durationSeconds: 120, volume: 50
  });
  assert.equal(q.getPlaybackState().durationSeconds, 120);
  assert.equal(q.getPlaybackState().currentSong?.duration, 120);

  // Companion reports inflated duration due to MSE buffer during seeking
  p.callback({
    songInfo: { id: 'canonical123', title: 'Song canonical123', author: 'Artist' },
    isConnected: true, isPlaying: true, adPlaying: false,
    progressSeconds: 118, durationSeconds: 389, volume: 50
  });
  // Canonical duration must remain 120, not inflated to 389!
  assert.equal(q.getPlaybackState().durationSeconds, 120);
  assert.equal(q.getPlaybackState().currentSong?.duration, 120);
  assert.equal(q.getPlaybackState().progressSeconds, 118);

  // Reaching near end of track advances and archives cleanly
  p.callback({
    songInfo: { id: 'canonical123', title: 'Song canonical123', author: 'Artist' },
    isConnected: true, isPlaying: true, adPlaying: false,
    progressSeconds: 119.6, durationSeconds: 389, volume: 50
  });
  assert.equal(q.getCurrentTrack(), null);
  assert.equal(q.getHistory()[0]?.videoId, 'canonical123');
});

test('blacklist filters respect keyword, artist, and channel rule types', async () => {
  const p = new Player();
  const q = new QueueManager(config, p as any);

  q.addBlacklistRule('earrape', 'mod', 'keyword');
  q.addBlacklistRule('bannedartist', 'mod', 'artist');
  q.addBlacklistRule('trollchannel', 'mod', 'channel');

  // Keyword match on title
  const kwRes = q.addSong({ ...track('kw1'), title: 'Song With Earrape Effect', artist: 'Good Artist', channel: 'Music Channel' }, viewer);
  assert.equal(kwRes.success, false);
  assert.match(kwRes.error!, /earrape/i);

  // Artist match
  const artRes = q.addSong({ ...track('art1'), title: 'Normal Title', artist: 'The BannedArtist Band', channel: 'Music Channel' }, viewer);
  assert.equal(artRes.success, false);
  assert.match(artRes.error!, /bannedartist/i);

  // Channel match
  const chRes = q.addSong({ ...track('ch1'), title: 'Another Title', artist: 'Clean Artist', channel: 'TrollChannel Official' }, viewer);
  assert.equal(chRes.success, false);
  assert.match(chRes.error!, /trollchannel/i);

  // Allowed song passes cleanly
  const okRes = q.addSong({ ...track('ok1'), title: 'Super Clean Song', artist: 'Clean Artist', channel: 'Legit Channel' }, viewer);
  assert.equal(okRes.success, true);
});

