import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { TwitchBot } from '../src/server/twitchBot.ts';
import { YouTubeResolver } from '../src/server/youtubeResolver.ts';
import { StreamPlaylistService } from '../src/server/streamPlaylistService.ts';
import { QueueManager } from '../src/server/queueManager.ts';
import type { YtmCompanionClient } from '../src/server/ytmCompanion.ts';
import type { BotConfig, Requester, Track } from '../src/types.ts';
import { CountdownService } from '../src/server/countdownService.ts';

const viewer: Requester = { username: 'viewer', displayName: 'Viewer', badge: 'viewer' };
const mod: Requester = { username: 'mod', displayName: 'Mod', badge: 'moderator' };

test('timer dispatch respects menu permissions, disabled state and cooldown without granting viewers access', async t => {
  let dispatched = 0;
  t.mock.method(CountdownService.prototype, 'chat', () => { dispatched++; return 'Timer updated'; });
  const { bot } = harness();
  const config = (bot as unknown as { config: BotConfig }).config;
  config.commandPermissions = { timer: [] };
  await bot.processCommandOrChat(mod, '!timer subathon pause');
  assert.equal(dispatched, 0);
  config.commandPermissions = { timer: ['viewer'] };
  await bot.processCommandOrChat(viewer, '!timer subathon pause');
  assert.equal(dispatched, 0);
  config.commandPermissions = { timer: ['broadcaster'] };
  await bot.processCommandOrChat(mod, '!timer subathon pause');
  assert.equal(dispatched, 0);
  config.commandPermissions = { timer: ['moderator', 'broadcaster'] };
  config.commandCooldowns = { timer: 60 };
  await bot.processCommandOrChat(mod, '!timer subathon pause');
  await bot.processCommandOrChat(mod, '!timer subathon resume');
  assert.equal(dispatched, 1);
});

function harness(playbackProvider: 'youtube_music' | 'spotify' = 'youtube_music') {
  const messages: string[] = [];
  const calls: string[] = [];
  const songs = [
    { id: 'one', title: 'First song', artist: 'Artist', requester: viewer, url: 'https://music.youtube.com/watch?v=abcdefghijk' },
    { id: 'two', title: 'Second song', artist: 'Artist', requester: viewer, url: 'https://music.youtube.com/watch?v=lmnopqrstuv' }
  ] as unknown as Track[];
  const queue = {
    getPlaybackState: () => ({ currentSong: songs[0], error: '' }),
    getQueue: () => songs,
    setVolume: async (volume: number) => { calls.push(`vol:${volume}`); return true; },
    castVoteSkip: async (username: string, isPrivileged?: boolean) => {
      calls.push(`vote:${username}${isPrivileged ? ':privileged' : ''}`);
      if (isPrivileged) return { success: true, alreadyVoted: false, currentVotes: 3, requiredVotes: 3, didSkip: true };
      return { success: true, alreadyVoted: false, currentVotes: 1, requiredVotes: 3, didSkip: false };
    },
    skipCurrent: async () => { calls.push('skip'); return { success: true, nextTrack: null }; },
    vetoTrack: (target: string | number) => { calls.push(`veto:${target}`); return songs[0]; },
    clearQueue: () => { calls.push('clear'); return 2; },
    pause: async () => { calls.push('pause'); return true; },
    play: async () => { calls.push('resume'); return true; },
    addBlacklistRule: (term: string) => { calls.push(`blacklist-add:${term}`); return {}; },
    removeBlacklistRule: (term: string) => { calls.push(`blacklist-remove:${term}`); return true; },
    addSong: (_resolved?: unknown, _requester?: Requester): { success: boolean; position?: number; error?: string } => { calls.push('addSong'); return { success: true, position: 1 }; },
    spotifyService: {
      isReadyForPlayback: () => true,
      searchTrack: async (q: string) => ({
        videoId: 'spotify-123',
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        duration: 213,
        thumbnailUrl: '',
        url: q,
        requestSource: 'spotify',
        spotifyUri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT'
      })
    }
  };
  const config = {
    language: 'en',
    twitchChannel: 'channel',
    twitchBotUsername: 'bot',
    twitchBotOauthToken: '',
    nowPlayingCooldownSeconds: 0,
    playbackProvider
  } as BotConfig;
  const companionMock = { getLastCommandError: () => '' };
  const tempFile = path.join(os.tmpdir(), `test-stream-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
  const streamPlaylistService = new StreamPlaylistService(tempFile);
  const bot = new TwitchBot(config, queue as unknown as QueueManager, companionMock as unknown as YtmCompanionClient, streamPlaylistService);
  bot.sendMessage = (message: string) => { messages.push(message); };
  return { bot, queue, calls, messages, streamPlaylistService };
}

test('public chat commands and aliases dispatch to the intended actions', async () => {
  const { bot, calls, messages } = harness();
  await bot.processCommandOrChat(viewer, '!help');
  await bot.processCommandOrChat(viewer, '!np');
  await bot.processCommandOrChat(viewer, '!queue');
  await bot.processCommandOrChat(viewer, '!voteskip');
  await bot.processCommandOrChat(viewer, '!sr');
  assert.match(messages[0], /Commands/);
  assert.match(messages[1], /First song/);
  assert.match(messages[2], /2 songs/);
  assert.match(messages[3], /1\/3/);
  assert.match(messages[4], /Usage: !sr/);
  assert.deepEqual(calls, ['vote:viewer']);
});

test('moderator chat commands act on their explicit targets and reject viewer access', async () => {
  const { bot, calls, messages } = harness();
  await bot.processCommandOrChat(viewer, '!skip');
  await bot.processCommandOrChat(viewer, '!clearqueue');
  assert.deepEqual(calls, []);
  assert.match(messages[0], /moderator command/);
  await bot.processCommandOrChat(mod, '!vol 0');
  await bot.processCommandOrChat(mod, '!skip');
  await bot.processCommandOrChat(mod, '!veto');
  assert.match(messages.at(-1) || '', /Usage: !veto/);
  await bot.processCommandOrChat(mod, '!veto 2');
  await bot.processCommandOrChat(mod, '!clearqueue');
  await bot.processCommandOrChat(mod, '!pause');
  await bot.processCommandOrChat(mod, '!resume');
  await bot.processCommandOrChat(mod, '!blacklist   add   noisy song');
  await bot.processCommandOrChat(mod, '!blacklist remove   noisy song');
  await bot.processCommandOrChat(mod, '!blacklist');
  assert.match(messages.at(-1) || '', /Usage: !blacklist/);
  assert.deepEqual(calls, ['vol:0', 'skip', 'veto:1', 'clear', 'pause', 'resume', 'blacklist-add:noisy song', 'blacklist-remove:noisy song']);
});

test('chat veto accepts only a queue position', async () => {
  const { bot, calls, messages } = harness();
  await bot.processCommandOrChat(mod, '!veto never gonna');
  assert.deepEqual(calls, []);
  assert.match(messages.at(-1) || '', /Usage: !veto <position>/);
});

test('a request removed before playback refunds its channel points', async () => {
  const { bot } = harness();
  const { ChannelPointsService } = await import('../src/server/channelPointsService.ts');
  const { botEvents } = await import('../src/server/eventBus.ts');
  const statuses: string[] = [];
  const original = ChannelPointsService.updateRedemptionStatus;
  ChannelPointsService.updateRedemptionStatus = async (_config, _reward, _id, status) => { statuses.push(status); return true; };
  try {
    const track = { id: 'dropped', title: 'Dropped', redemptionId: 'redemption', rewardId: 'reward', requestedAt: Date.now() } as Track;
    (bot as any).scheduleRedemption(track);
    botEvents.emit('queue:request_removed', { track });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(statuses, ['CANCELED']);
    assert.equal((bot as any).redemptionTimers.has('dropped'), false);
  } finally {
    ChannelPointsService.updateRedemptionStatus = original;
  }
});

test('the bot does not copy its own chat lines into the overlay', async () => {
  const { bot } = harness();
  const { botEvents } = await import('../src/server/eventBus.ts');
  const lines: string[] = [];
  const off = botEvents.on('chat:message', line => lines.push(line.text));
  try {
    (bot as any).handleRawIrc(':bot!bot@bot.tmi.twitch.tv PRIVMSG #channel :from the bot\r\n:viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :from a viewer\r\n');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(lines, ['from a viewer']);
  } finally {
    off();
  }
});

test('broadcaster chat commands run when the bot login is the channel owner', async () => {
  const { bot, messages } = harness();
  bot.updateConfig({ twitchBotUsername: 'channel' });
  (bot as any).ws = { readyState: WebSocket.OPEN, send() {} };
  TwitchBot.prototype.sendMessage.call(bot, 'from the bot');
  const { botEvents } = await import('../src/server/eventBus.ts');
  const lines: string[] = [];
  const off = botEvents.on('chat:message', line => lines.push(line.text));
  try {
    (bot as any).handleRawIrc([
      '@badges=;mod=0;user-type= :channel!channel@channel.tmi.twitch.tv PRIVMSG #channel :from the bot',
      '@badge-info=;badges=broadcaster/1;mod=0;display-name=Channel;user-type= :channel!channel@channel.tmi.twitch.tv PRIVMSG #channel :!help'
    ].join('\r\n') + '\r\n');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(lines, ['!help']);
    assert.match(messages.at(-1) || '', /Commands/);
  } finally {
    off();
  }
});

test('failed player commands always report a useful chat error', async () => {
  const { bot, queue, messages } = harness();
  queue.setVolume = async () => false;
  queue.pause = async () => false;
  queue.play = async () => false;
  await bot.processCommandOrChat(mod, '!vol 40');
  await bot.processCommandOrChat(mod, '!pause');
  await bot.processCommandOrChat(mod, '!resume');
  assert.equal(messages.length, 3);
  for (const message of messages) assert.match(message, /Player command failed/);
});

test('Spotify chat responses do not report YouTube playback or stale YouTube errors', async () => {
  const { bot, queue, messages } = harness('spotify');
  queue.getPlaybackState = () => ({ currentSong: null, error: '' });
  queue.castVoteSkip = async () => ({ success: false, alreadyVoted: false, currentVotes: 0, requiredVotes: 3, didSkip: false });
  await bot.processCommandOrChat(viewer, '!song');
  await bot.processCommandOrChat(viewer, '!voteskip');
  await bot.processCommandOrChat(mod, '!skip');
  assert.match(messages[0], /Spotify/);
  assert.match(messages[1], /No song/);
  assert.match(messages[2], /Spotify/);
});

test('custom command permissions allow restricting or disabling commands', async () => {
  const { bot, calls } = harness();
  bot.updateConfig({
    commandPermissions: {
      sr: ['subscriber', 'moderator', 'broadcaster'],
      vol: [] // completely disabled
    }
  });

  // Viewer cannot use !sr now
  await bot.processCommandOrChat(viewer, '!sr test query');
  assert.equal(calls.length, 0);

  // Moderator can use !sr
  await bot.processCommandOrChat(mod, '!sr test query');
  // !sr will invoke handleSongRequest

  // Mod cannot use !vol because it's disabled via []
  await bot.processCommandOrChat(mod, '!vol 50');
  assert.equal(calls.filter(c => c.startsWith('vol:')).length, 0);
});

test('songrequest confirmation does not mention fallback disclaimer when Spotify is the active player', async () => {
  const { bot: spotifyBot, messages: spotifyMessages, queue: spotifyQueue } = harness('spotify');
  spotifyQueue.addSong = () => ({
    success: true,
    position: 1,
    track: { title: 'Never Gonna Give You Up', artist: 'Rick Astley', requestSource: 'spotify' }
  });

  await spotifyBot.processCommandOrChat(viewer, '!sr https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(spotifyMessages.length, 1);
  assert.match(spotifyMessages[0], /Spotify request recognized/);
  assert.ok(!spotifyMessages[0].includes('Spotify Premium if enabled; otherwise YouTube Music'), 'Should not mention fallback disclaimer');

  const { bot: ytmBot, messages: ytmMessages, queue: ytmQueue } = harness('youtube_music');
  ytmQueue.addSong = () => ({
    success: true,
    position: 1,
    track: { title: 'Never Gonna Give You Up', artist: 'Rick Astley', requestSource: 'spotify' }
  });

  const originalResolve = YouTubeResolver.resolve;
  YouTubeResolver.resolve = async () => ({
    videoId: 'abcdefghijk',
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    duration: 213,
    thumbnailUrl: '',
    url: 'https://music.youtube.com/watch?v=abcdefghijk',
    requestSource: 'spotify'
  });

  try {
    await ytmBot.processCommandOrChat(viewer, '!sr https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    assert.equal(ytmMessages.length, 1);
    assert.ok(ytmMessages[0].includes('Spotify Premium if enabled; otherwise YouTube Music'), 'Should mention fallback when provider is YTM');
  } finally {
    YouTubeResolver.resolve = originalResolve;
  }
});

test('songrequest resolution error does not mention YouTube Music when Spotify is the active player', async () => {
  const { bot: spotifyBot, messages: spotifyMessages, queue: spotifyQueue } = harness('spotify');
  spotifyQueue.spotifyService.searchTrack = async () => {
    throw new Error('Track not found on Spotify');
  };

  await spotifyBot.processCommandOrChat(viewer, '!sr https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(spotifyMessages.length, 1);
  assert.ok(!spotifyMessages[0].includes('YouTube Music'), 'Should not mention YouTube Music on Spotify resolution error');
  assert.match(spotifyMessages[0], /Could not find or resolve song/i);
});

test('voteskip allows broadcaster, moderator, and VIP to instant skip', async () => {
  const { bot, calls, messages } = harness();
  const vip: Requester = { username: 'vipuser', displayName: 'VipUser', badge: 'vip' };

  await bot.processCommandOrChat(vip, '!voteskip');
  assert.ok(calls.includes('vote:vipuser:privileged'));
  assert.match(messages[0], /Instant skip by VIP @VipUser/i);

  await bot.processCommandOrChat(mod, '!voteskip');
  assert.ok(calls.includes('vote:mod:privileged'));
  assert.match(messages[1], /Instant skip by Mod @Mod/i);
});

test('channel points redemption refunds points when song request cannot be resolved', async () => {
  const { bot, messages, queue } = harness();
  const { ChannelPointsService } = await import('../src/server/channelPointsService.ts');
  const originalUpdate = ChannelPointsService.updateRedemptionStatus;
  let statusUpdated: string | null = null;
  ChannelPointsService.updateRedemptionStatus = async (_config, _rewardId, _redemptionId, status) => {
    statusUpdated = status;
    return true;
  };

  try {
    queue.addSong = () => ({
      success: false,
      error: 'Song contains blacklisted term'
    });

    await bot.processCommandOrChat(
      viewer,
      'banned song query',
      true,
      { rewardId: 'reward-123', redemptionId: 'redemption-456' }
    );

    assert.equal(statusUpdated, 'CANCELED');
    assert.match(messages[0], /refunded/i);
  } finally {
    ChannelPointsService.updateRedemptionStatus = originalUpdate;
  }
});

test('streamplaylist command adds currently playing song to stream playlist', async () => {
  const { bot, messages, queue } = harness();
  
  // Viewer without permission should be rejected (default is mods)
  await bot.processCommandOrChat(viewer, '!playlist');
  assert.equal(messages.length, 0);

  // Moderator should succeed
  await bot.processCommandOrChat(mod, '!playlist');
  assert.equal(messages.length, 1);
  assert.match(messages[0], /was added to the stream playlist/i);
  assert.match(messages[0], /First song/i);

  // Trying to add the same song again reports already exists
  await bot.processCommandOrChat(mod, '!spl');
  assert.equal(messages.length, 2);
  assert.match(messages[1], /already in the stream playlist/i);

  // When no song is playing
  const emptyQueueState: { currentSong: Track | null; error: string } = { currentSong: null, error: '' };
  queue.getPlaybackState = () => emptyQueueState as any;
  await bot.processCommandOrChat(mod, '!playlist');
  assert.equal(messages.length, 3);
  assert.match(messages[2], /No song is currently playing/i);
});

test('ConfigService preserves empty command permissions to allow disabling commands', async () => {
  const { ConfigService } = await import('../src/server/configService.ts');
  const tempFile = path.join(os.tmpdir(), `test-config-perms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
  const service = new ConfigService(tempFile);
  const updated = service.update({
    commandPermissions: {
      vol: []
    }
  });
  assert.deepEqual(updated.config.commandPermissions?.vol, []);
  assert.deepEqual(service.get().commandPermissions?.vol, []);
});




 test('playlist link is public and reports missing configuration', async () => {
  const { bot, messages } = harness();
  await bot.processCommandOrChat(viewer, '!spl link');
  assert.match(messages[0], /no.*link/i);
 });
 test('wrongsong aliases report no pending request', async () => {
  for (const alias of ['wrongsong', 'undo', 'oops']) {
    const { bot, queue, messages } = harness();
    Object.assign(queue, { withdrawLatestRequest: () => ({ reason: 'missing' }) });
    await bot.processCommandOrChat(viewer, `!${alias}`);
    assert.match(messages[0], /no.*pending/i);
  }
 });

 test('playlist link prefers stream playlist and falls back to Spotify URI', async () => {
  const {bot, messages} = harness();
  bot.updateConfig({streamPlaylistUrl:'https://music.youtube.com/playlist?list=PLstream', spotifyFallbackPlaylist:'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'});
  await bot.processCommandOrChat(viewer, '!playlist link');
  assert.match(messages[0], /PLstream/);
  bot.updateConfig({streamPlaylistUrl:''});
  await bot.processCommandOrChat(viewer, '!streamplaylist link');
  assert.match(messages[1], /https:\/\/open.spotify.com\/playlist\/37i9dQZF1DXcBWIGoYBM5M/);
 });

 test('playlist add emits exactly one event and uses the independent Spotify playlist', async () => {
  const {bot, queue, streamPlaylistService} = harness('spotify');
  const {botEvents} = await import('../src/server/eventBus.ts');
  const events: string[] = [];
  const off = botEvents.on('playlist:track_added', entry => events.push(entry.title));
  const destinations: string[] = [];
  Object.assign(queue.spotifyService, {isConnected: () => true, addToPlaylist: async (playlist: string) => {destinations.push(playlist); return {success:true};}});
  bot.updateConfig({streamPlaylistUrl:'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', spotifyFallbackPlaylist:'spotify:playlist:0000000000000000000000'});
  try {
    await bot.processCommandOrChat(mod, '!playlist');
    await bot.processCommandOrChat(mod, '!playlist');
    assert.deepEqual(destinations,['spotify:playlist:37i9dQZF1DXcBWIGoYBM5M']);
    assert.deepEqual(events,['First song']);
    assert.equal(streamPlaylistService.getItems().length,1);
  } finally {off();}
 });

 test('withdrawal removes latest own pending request at the 60 second boundary', () => {
   const now = 100000;
   const song = (id: string, username: string, requestedAt: number) => ({id, title:id, artist:'A', requester:{username}, requestedAt});
   const songs = [song('older','Viewer',now-60001),song('latest','VIEWER',now-60000),song('other','someone',now)];
   let saves=0, notifications=0;
   const state = {queue:songs, history:[], persistence:{saveQueue: () => saves++}, notify: () => notifications++};
   const result = QueueManager.prototype.withdrawLatestRequest.call(state as unknown as QueueManager,'viewer',now);
   assert.equal(result.track?.id,'latest');
   assert.deepEqual(songs.map(item => item.id),['older','other']);
   assert.equal(saves,1); assert.equal(notifications,1);
   assert.equal(QueueManager.prototype.withdrawLatestRequest.call(state as unknown as QueueManager,'viewer',now).reason,'expired');
   assert.equal(QueueManager.prototype.withdrawLatestRequest.call(state as unknown as QueueManager,'absent',now).reason,'missing');
 });

 test('withdrawal restores the request when atomic persistence fails', () => {
   const track={id:'keep',title:'Keep',requester:viewer,requestedAt:Date.now()};
   const state={queue:[track], history:[], persistence:{saveQueue: () => {throw new Error('disk full');}},notify: () => assert.fail('must not notify')};
   assert.throws(() => QueueManager.prototype.withdrawLatestRequest.call(state as unknown as QueueManager,'viewer'), /disk full/);
   assert.deepEqual(state.queue,[track]);
 });

 test('wrongsong refunds channel points and reports refund failures honestly', async () => {
   const {ChannelPointsService} = await import('../src/server/channelPointsService.ts');
   const original=ChannelPointsService.updateRedemptionStatus;
   try {
     for (const success of [true,false]) {
       const {bot,queue,messages}=harness();
       Object.assign(queue,{withdrawLatestRequest: () => ({track:{id:'redeemed',title:'Redeemed',redemptionId:'redemption',rewardId:'reward'}})});
       ChannelPointsService.updateRedemptionStatus=async (_config,reward,id,status) => {assert.equal(reward,'reward');assert.equal(id,'redemption');assert.equal(status,'CANCELED');return success;};
       await bot.processCommandOrChat(viewer,'!oops');
       assert.match(messages[0],/Redeemed.*withdrawn/);
       assert.match(messages[1], success ? /were refunded/ : /could not be refunded/);
     }
   } finally {ChannelPointsService.updateRedemptionStatus=original;}
 });

 test('expired requests produce a friendly response', async () => {
   const {bot,queue,messages}=harness();
   Object.assign(queue,{withdrawLatestRequest: () => ({reason:'expired'})});
   await bot.processCommandOrChat(viewer,'!undo');
   assert.match(messages[0],/60 seconds/);
 });

 test('stream playlist serializes duplicate additions and persists deletion', async () => {
   const {streamPlaylistService,queue}=harness();
   const track=queue.getPlaybackState().currentSong!;
   const results=await Promise.all([streamPlaylistService.addTrack(track as unknown as import('../src/types.ts').Track,'one'),streamPlaylistService.addTrack(track as unknown as import('../src/types.ts').Track,'two')]);
   assert.equal(results.filter(item => item.success).length,1);
   assert.equal(results.filter(item => item.alreadyExists).length,1);
   assert.equal(streamPlaylistService.removeTrack(track.id),true);
   assert.equal(streamPlaylistService.removeTrack(track.id),false);
   assert.deepEqual(streamPlaylistService.getItems(),[]);
 });

 test('stream playlist URL validation accepts supported playlists and rejects unsafe URLs', async () => {
   const {validateConfig}=await import('../src/server/validation.ts');
   for (const url of ['', 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M','https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M','https://music.youtube.com/playlist?list=PLstream']) assert.ok('streamPlaylistUrl' in validateConfig({streamPlaylistUrl:url}));
   for (const url of ['javascript:alert(1)','http://music.youtube.com/playlist?list=PLstream','https://example.com/playlist','https://music.youtube.com/watch?v=abc',42]) assert.throws(() => validateConfig({streamPlaylistUrl:url}));
 });

 test('accepted channel points requests remain cancellable during the undo window', async () => {
   const {ChannelPointsService}=await import('../src/server/channelPointsService.ts');
   const original=ChannelPointsService.updateRedemptionStatus;
   const statuses: string[]=[];
   const {bot,queue}=harness('spotify');
   const track={...queue.getQueue()[0],requestedAt:Date.now()};
   let persisted=0;
   Object.assign(queue,{
     addSong: () => ({success:true,position:1,track}),
     persistRedemptionMetadata: () => persisted++,
     withdrawLatestRequest: () => ({track})
   });
   ChannelPointsService.updateRedemptionStatus=async (_config,_reward,_redemption,status) => {statuses.push(status);return true;};
   try {
     await bot.processCommandOrChat(viewer,'Song',true,{rewardId:'reward',redemptionId:'redemption'});
     assert.deepEqual(statuses,[]);
     assert.equal(persisted,1);
     assert.equal(track.redemptionId,'redemption');
     assert.equal(track.rewardId,'reward');
     await bot.processCommandOrChat(viewer,'!wrongsong');
     assert.deepEqual(statuses,['CANCELED']);
   } finally {ChannelPointsService.updateRedemptionStatus=original;}
 });

 test('playlist storage failure never reports a saved entry', async () => {
   const fs=await import('node:fs');
   const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playlist-store-'));
   const store=new StreamPlaylistService(path.join(directory,'blocked','playlist.json'));
   fs.writeFileSync(path.join(directory,'blocked'),'not a directory');
   try {
     const {queue}=harness();
     const result=await store.addTrack(queue.getQueue()[0] as unknown as import('../src/types.ts').Track,'Viewer');
     assert.equal(result.success,false);
     assert.deepEqual(store.getItems(),[]);
   } finally {fs.rmSync(directory,{recursive:true,force:true});}
 });

 test('chat translations use identical keys and placeholders', async () => {
   const fs=await import('node:fs');
   const source=fs.readFileSync(new URL('../src/server/twitchMessages.ts',import.meta.url),'utf8');
   const blocks=[source.slice(source.indexOf('  de: {'),source.indexOf('  en: {')),source.slice(source.indexOf('  en: {'),source.indexOf('export function twitchMessage'))];
   const entries=blocks.map(block => [...block.matchAll(/^    (\w+):\s*(['"])(.*)\2,?$/gm)].map(match => [match[1],[...match[3].matchAll(/\{(\w+)\}/g)].map(value=>value[1]).sort()] as const));
   assert.ok(entries[0].length > 50);
   assert.deepEqual(Object.fromEntries(entries[0]),Object.fromEntries(entries[1]));
 });

 test('restored channel points requests are fulfilled after the undo window even after playback ends', async () => {
   const {ChannelPointsService}=await import('../src/server/channelPointsService.ts');
   const original=ChannelPointsService.updateRedemptionStatus;
   const {queue}=harness();
   let finish!: () => void;
   const completed=new Promise<void>(resolve => {finish=resolve;});
   const track={...queue.getQueue()[0],requestedAt:Date.now()-60001,redemptionId:'restored-redemption',rewardId:'reward'};
   Object.assign(queue, {getRedemptionTracks: () => [track], getQueue: () => [], finishRedemption: (id: string) => {assert.equal(id,track.id);finish();}});
   ChannelPointsService.updateRedemptionStatus=async (_config,reward,id,status) => {assert.equal(reward,'reward');assert.equal(id,'restored-redemption');assert.equal(status,'FULFILLED');return true;};
   let timeout: ReturnType<typeof setTimeout> | undefined;
   try {
     new TwitchBot({language:'en'} as BotConfig,queue as unknown as QueueManager,{} as YtmCompanionClient);
     await Promise.race([completed,new Promise<never>((_resolve,reject) => {timeout=setTimeout(() => reject(new Error('fulfillment did not resume')),1000);})]);
   } finally {if(timeout) clearTimeout(timeout);ChannelPointsService.updateRedemptionStatus=original;}
 });

test('reward chat resolves redemption instead of using IRC message ID', async t => {
  const { ChannelPointsService } = await import('../src/server/channelPointsService.ts');
  const { bot } = harness();
  Object.assign((bot as any).config, {channelPointsEnabled:true,channelPointsRewardId:'reward'});
  t.mock.method(ChannelPointsService, 'findRedemptionId', async (_config:any, reward:string, user:string, input:string) => {
    assert.equal(reward,'reward'); assert.equal(user,'viewer-id'); assert.equal(input,'Song'); return 'real-redemption';
  });
  let metadata: any;
  t.mock.method(bot, 'processCommandOrChat', async (_requester:any,_message:any,_reward:any,info:any)=> { metadata=info; });
  await (bot as any).parsePrivMsg('@id=chat-message-id;user-id=viewer-id;custom-reward-id=reward;display-name=Viewer :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #streamer :Song');
  assert.equal(metadata.redemptionId, 'real-redemption');
});

test('wrongsong reports refund unavailable when redemption lookup failed', async () => {
  const {bot,queue,messages}=harness();
  Object.assign(queue,{withdrawLatestRequest:()=>({track:{id:'redeemed',title:'Redeemed',rewardId:'reward'}})});
  await bot.processCommandOrChat(viewer,'!wrongsong');
  assert.match(messages[1] || '', /could not be refunded/);
});

test('closing song requests blocks viewers, still allows moderators, and refunds channel points', async t => {
  const { ChannelPointsService } = await import('../src/server/channelPointsService.ts');
  const { bot, calls, messages } = harness('spotify');
  const link = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';

  // Default (setting absent) keeps requests open: existing installations are unchanged.
  await bot.processCommandOrChat(viewer, '!sr ' + link);
  assert.equal(calls.filter(c => c === 'addSong').length, 1);

  const viewerB = { ...viewer, username: 'viewerb', displayName: 'ViewerB' };
  Object.assign((bot as any).config, { songRequestsOpen: false, channelPointsEnabled: true });
  calls.length = 0; messages.length = 0;
  await bot.processCommandOrChat(viewerB, '!sr ' + link);
  assert.deepEqual(calls, []);
  assert.match(messages.at(-1) || '', /closed/i);

  const statuses: string[] = [];
  t.mock.method(ChannelPointsService, 'updateRedemptionStatus', async (_config: any, _reward: string, _id: string, status: string) => { statuses.push(status); return true; });
  messages.length = 0;
  await bot.processCommandOrChat(viewerB, link, true, { rewardId: 'reward', redemptionId: 'redemption' });
  assert.deepEqual(calls, []);
  assert.deepEqual(statuses, ['CANCELED']);

  messages.length = 0;
  await bot.processCommandOrChat(mod, '!sr ' + link);
  assert.deepEqual(calls, ['addSong']);
  assert.ok(!messages.some(message => /closed/i.test(message)));

  (bot as any).config.songRequestsOpen = true;
  (bot as any).config.globalRequestCooldownSeconds = 0;
  calls.length = 0;
  await bot.processCommandOrChat({ ...viewer, username: 'viewerc' }, '!sr ' + link);
  assert.deepEqual(calls, ['addSong']);
});

test('the requests-open switch is accepted by the config validator and only as a boolean', async () => {
  const { validateConfig } = await import('../src/server/validation.ts');
  assert.deepEqual(validateConfig({ songRequestsOpen: false }), { songRequestsOpen: false });
  assert.throws(() => validateConfig({ songRequestsOpen: 'no' }));
});
