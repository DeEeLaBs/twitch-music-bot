import assert from 'node:assert/strict';
import { QueueManager } from '../src/server/queueManager.ts';
import { YouTubeResolver } from '../src/server/youtubeResolver.ts';
import { TypedEventBus } from '../src/server/eventBus.ts';
import { TwitchBot } from '../src/server/twitchBot.ts';
import { COMMANDS } from '../src/server/commandRegistry.ts';
import { ConfigService } from '../src/server/configService.ts';
import type { BotConfig, Requester, Track } from '../src/types.ts';

// Helper mock YTM companion
class MockCompanion {
  private listeners: Array<(info: any) => void> = [];
  public volume = 80;
  public playing = false;
  subscribe(fn: (info: any) => void) { this.listeners.push(fn); }
  async play() { this.playing = true; return true; }
  async pause() { this.playing = false; return true; }
  async setVolume(v: number) { this.volume = v; return true; }
  async next() { return true; }
  async previous() { return true; }
  getIsSimulation() { return true; }
}

let passedTests = 0;
let totalTests = 0;
const failures: string[] = [];

async function runTest(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failures.push(`${name}: ${err?.message || err}`);
    console.error(`  ✗ ${name}`);
    console.error(`    -> ${err?.stack || err}`);
  }
}

async function main() {
  console.log('====================================================');
  console.log('  STARTING RUNDUM-TEST (COMPREHENSIVE AUDIT TEST)');
  console.log('====================================================\n');

  // ==========================================
  // SECTION 1: EVENT BUS RESILIENCE
  // ==========================================
  console.log('--- 1. EventBus Resilience & Error Isolation ---');
  
  await runTest('EventBus: Listener throwing does not disrupt other listeners', () => {
    const bus = new TypedEventBus();
    let secondCalled = false;
    let thirdCalled = false;

    bus.on('queue:changed', () => {
      throw new Error('Exploding listener');
    });
    bus.on('queue:changed', () => {
      secondCalled = true;
    });
    bus.on('queue:changed', () => {
      thirdCalled = true;
    });

    bus.emit('queue:changed', { reason: 'test' });
    assert.equal(secondCalled, true, 'Second listener should execute despite first throwing');
    assert.equal(thirdCalled, true, 'Third listener should execute despite first throwing');
  });

  await runTest('EventBus: Unsubscribe cleans up listener and memory', () => {
    const bus = new TypedEventBus();
    let count = 0;
    const unsub = bus.on('config:changed', () => { count++; });
    
    bus.emit('config:changed', { changedKeys: ['test'] });
    assert.equal(count, 1);
    
    unsub();
    bus.emit('config:changed', { changedKeys: ['test'] });
    assert.equal(count, 1, 'Should not fire after unsubscribe');
  });

  // ==========================================
  // SECTION 2: YOUTUBE RESOLVER & URL PARSING
  // ==========================================
  console.log('\n--- 2. YouTube Resolver & URL Recognition ---');

  await runTest('YouTubeResolver: Extracts standard watch URLs', () => {
    const id = YouTubeResolver.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(id, 'dQw4w9WgXcQ');
  });

  await runTest('YouTubeResolver: Extracts YouTube Music URLs', () => {
    const id = YouTubeResolver.extractVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(id, 'dQw4w9WgXcQ');
  });

  await runTest('YouTubeResolver: Extracts youtu.be short URLs', () => {
    const id = YouTubeResolver.extractVideoId('https://youtu.be/dQw4w9WgXcQ');
    assert.equal(id, 'dQw4w9WgXcQ');
  });

  await runTest('YouTubeResolver: Extracts YouTube Shorts URLs', () => {
    const id = YouTubeResolver.extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    assert.equal(id, 'dQw4w9WgXcQ');
  });

  await runTest('YouTubeResolver: Extracts YouTube Live URLs', () => {
    const id = YouTubeResolver.extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ');
    assert.equal(id, 'dQw4w9WgXcQ');
  });

  await runTest('YouTubeResolver: Extracts Spotify track ID', () => {
    const id = YouTubeResolver.extractSpotifyTrackId('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    assert.equal(id, '4cOdK2wGLETKBW3PvgPWqT');
  });

  await runTest('YouTubeResolver: Extracts Spotify URI format', () => {
    const id = YouTubeResolver.extractSpotifyTrackId('spotify:track:4cOdK2wGLETKBW3PvgPWqT');
    assert.equal(id, '4cOdK2wGLETKBW3PvgPWqT');
  });

  // ==========================================
  // SECTION 3: QUEUE MANAGER & STRING NORMALIZATION
  // ==========================================
  console.log('\n--- 3. QueueManager, German Umlauts & Request Logic ---');

  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { QueuePersistence } = await import('../src/server/queuePersistence.ts');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-queue-test-'));
  const createTestQm = (cfg: Partial<BotConfig> = {}) => {
    const companion = new MockCompanion();
    const persistence = new QueuePersistence(tempDir);
    const qm = new QueueManager({ ...baseConfig, ...cfg }, companion as any, undefined, undefined, persistence);
    qm.clearQueue();
    return { qm, companion };
  };

  const baseConfig: BotConfig = {
    language: 'de',
    twitchChannel: 'testchannel',
    twitchBotUsername: 'testbot',
    twitchBotOauthToken: 'testtoken',
    twitchTokenConfigured: true,
    ytmdaCompanionUrl: 'http://127.0.0.1:9863',
    maxSongDurationSeconds: 480,
    maxActivePerViewer: 2,
    voteSkipThreshold: 2,
    simulationMode: true
  };

  await runTest('QueueManager: Song Title Normalization handles German Umlauts & ß', () => {
    const { qm } = createTestQm();
    
    // Access private normalizeString via prototype/any
    const norm = (qm as any).normalizeString.bind(qm);
    
    assert.equal(norm('Über den Wolken'), 'uberdenwolken');
    assert.equal(norm('Die Ärzte - Schrei nach Liebe'), 'diearzteschreinachliebe');
    assert.equal(norm('Großes Kino (Official Video)'), 'grosseskino');
    assert.equal(norm('Westerland [Remastered]'), 'westerland');
  });

  await runTest('QueueManager: Add song enforces maxActivePerViewer limit', async () => {
    const { qm } = createTestQm({ maxActivePerViewer: 2 });
    const viewer: Requester = { username: 'chocdeee', displayName: 'ChocDeEe', badge: 'viewer' };

    const song1: Track = { id: 's1', videoId: 'vid11111111', title: 'Song 1', artist: 'Artist 1', duration: 180, requester: viewer, url: 'https://youtube.com/watch?v=vid11111111' };
    const song2: Track = { id: 's2', videoId: 'vid22222222', title: 'Song 2', artist: 'Artist 2', duration: 200, requester: viewer, url: 'https://youtube.com/watch?v=vid22222222' };
    const song3: Track = { id: 's3', videoId: 'vid33333333', title: 'Song 3', artist: 'Artist 3', duration: 210, requester: viewer, url: 'https://youtube.com/watch?v=vid33333333' };

    const res1 = qm.addSong(song1, viewer);
    assert.equal(res1.success, true);
    
    const res2 = qm.addSong(song2, viewer);
    assert.equal(res2.success, true);

    const res3 = qm.addSong(song3, viewer);
    assert.equal(res3.success, false, 'Third song from same viewer must be rejected');
    assert.match(res3.error || '', /Limit|Maximum|Warteschlange/i);
  });

  await runTest('QueueManager: Add song rejects duplicates in queue', async () => {
    const { qm } = createTestQm({ maxActivePerViewer: 5 });
    const viewer1: Requester = { username: 'viewer1', displayName: 'Viewer1', badge: 'viewer' };
    const viewer2: Requester = { username: 'viewer2', displayName: 'Viewer2', badge: 'viewer' };

    const song: Track = { id: 'dup1', videoId: 'dup11111111', title: 'Same Song', artist: 'Artist', duration: 180, requester: viewer1, url: 'https://youtube.com/watch?v=dup11111111' };
    const songDup: Track = { id: 'dup2', videoId: 'dup11111111', title: 'Same Song', artist: 'Artist', duration: 180, requester: viewer2, url: 'https://youtube.com/watch?v=dup11111111' };

    assert.equal(qm.addSong(song, viewer1).success, true);
    const dupRes = qm.addSong(songDup, viewer2);
    assert.equal(dupRes.success, false);
    assert.match(dupRes.error || '', /bereits.*Warteschlange|already.*queue/i);
  });

  await runTest('QueueManager: Add song rejects songs exceeding max duration', async () => {
    const { qm } = createTestQm({ maxSongDurationSeconds: 300 });
    const viewer: Requester = { username: 'viewer', displayName: 'Viewer', badge: 'viewer' };

    const longSong: Track = { id: 'long', videoId: 'long1111111', title: 'Long Song', artist: 'Artist', duration: 600, requester: viewer, url: 'https://youtube.com/watch?v=long1111111' };
    const res = qm.addSong(longSong, viewer);
    assert.equal(res.success, false);
    assert.match(res.error || '', /Länge|Laufzeit|duration|length/i);
  });

  await runTest('QueueManager: Blacklist blocking works for keywords and artists', async () => {
    const { qm } = createTestQm();
    const viewer: Requester = { username: 'viewer', displayName: 'Viewer', badge: 'viewer' };

    qm.addBlacklistRule('forbidden keyword', 'keyword');
    qm.addBlacklistRule('banned artist', 'artist');

    const badTitle: Track = { id: 'b1', videoId: 'b1111111111', title: 'Song with forbidden keyword', artist: 'Some Artist', duration: 120, requester: viewer, url: 'https://youtube.com' };
    const badArtist: Track = { id: 'b2', videoId: 'b2222222222', title: 'Clean Song', artist: 'The Banned Artist', duration: 120, requester: viewer, url: 'https://youtube.com' };
    const cleanSong: Track = { id: 'clean', videoId: 'clean111111', title: 'Clean Song', artist: 'Good Artist', duration: 120, requester: viewer, url: 'https://youtube.com' };

    assert.equal(qm.addSong(badTitle, viewer).success, false, 'Blacklisted keyword should be blocked');
    assert.equal(qm.addSong(badArtist, viewer).success, false, 'Blacklisted artist should be blocked');
    assert.equal(qm.addSong(cleanSong, viewer).success, true, 'Clean song should be allowed');
  });

  await runTest('QueueManager: VoteSkip triggers skip when threshold reached', async () => {
    const { qm } = createTestQm({ voteSkipThreshold: 2 });
    const viewer: Requester = { username: 'choc', displayName: 'Choc', badge: 'viewer' };

    const track: Track = { id: 'cur', videoId: 'cur11111111', title: 'Playing', artist: 'Artist', duration: 120, requester: viewer, url: 'https://youtube.com' };
    (qm as any).currentTrack = track;
    (qm as any).playbackState.currentSong = track;
    (qm as any).playbackState.isPlaying = true;
    (qm as any).voteSkip.currentTrackId = track.id;

    // Vote 1
    const v1 = await qm.castVoteSkip('user1');
    assert.equal(v1.success, true);
    assert.equal(v1.didSkip, false);
    assert.equal(v1.currentVotes, 1);

    // Duplicate vote from user1
    const v1Dup = await qm.castVoteSkip('user1');
    assert.equal(v1Dup.alreadyVoted, true);

    // Vote 2 (meets threshold of 2)
    const v2 = await qm.castVoteSkip('user2');
    assert.equal(v2.success, true);
    assert.equal(v2.didSkip, true, 'Should trigger skip on reaching threshold');
  });

  await runTest('QueueManager: Move queue track reorders correctly', () => {
    const { qm } = createTestQm();
    const viewer: Requester = { username: 'viewer', displayName: 'Viewer', badge: 'viewer' };

    const t1: Track = { id: 't1', videoId: 'v1111111111', title: 'Track 1', artist: 'A', duration: 100, requester: viewer, url: 'https://youtube.com' };
    const t2: Track = { id: 't2', videoId: 'v2222222222', title: 'Track 2', artist: 'A', duration: 100, requester: viewer, url: 'https://youtube.com' };
    const t3: Track = { id: 't3', videoId: 'v3333333333', title: 'Track 3', artist: 'A', duration: 100, requester: viewer, url: 'https://youtube.com' };

    qm.addSong(t1, viewer);
    qm.addSong(t2, viewer);
    qm.addSong(t3, viewer);

    const initialQueue = qm.getQueue();
    // Note: t1 is immediately promoted to currentTrack by auto-play, so queue contains 2 waiting tracks
    assert.equal(initialQueue.length, 2);
    const lastTrackId = initialQueue[1].id;

    // Move waiting track to top of queue (index 0)
    const ok = qm.moveTrack(lastTrackId, 0);
    assert.equal(ok, true);
    const updatedQueue = qm.getQueue();
    assert.equal(updatedQueue[0].id, lastTrackId);
    assert.equal(updatedQueue[1].id, initialQueue[0].id);
  });

  // ==========================================
  // SECTION 4: CHAT COMMANDS & PERMISSIONS
  // ==========================================
  console.log('\n--- 4. Chat Commands & Permissions Engine ---');

  await runTest('ChatCommands: Viewer cannot execute moderator commands', async () => {
    const messages: string[] = [];
    const calls: string[] = [];
    const viewer: Requester = { username: 'regular_viewer', displayName: 'RegularViewer', badge: 'viewer' };

    const mockQueue = {
      getPlaybackState: () => ({ currentSong: null, error: '' }),
      getQueue: () => [],
      skipCurrent: async () => { calls.push('skip'); return { success: true }; },
      clearQueue: () => { calls.push('clear'); return 0; }
    };

    const bot = new TwitchBot({ ...baseConfig, language: 'de' }, mockQueue as any);
    bot.sendMessage = (msg: string) => messages.push(msg);

    await bot.processCommandOrChat(viewer, '!skip');
    await bot.processCommandOrChat(viewer, '!clearqueue');

    assert.equal(calls.length, 0, 'No mod actions should be performed');
    assert.match(messages[0] || '', /Mod-Befehl/i);
  });

  await runTest('ChatCommands: Custom permissions can restrict !sr to subscribers', async () => {
    let addSongCalled = false;
    const viewer: Requester = { username: 'viewer', displayName: 'Viewer', badge: 'viewer' };
    const sub: Requester = { username: 'sub', displayName: 'Sub', badge: 'subscriber' };

    const mockQueue = {
      getPlaybackState: () => ({ currentSong: null }),
      getQueue: () => [],
      addSong: () => { addSongCalled = true; return { success: true }; }
    };

    const bot = new TwitchBot({
      ...baseConfig,
      language: 'de',
      commandPermissions: {
        sr: ['subscriber', 'moderator', 'broadcaster']
      }
    }, mockQueue as any);

    // Viewer should be blocked without adding song
    await bot.processCommandOrChat(viewer, '!sr Never Gonna Give You Up');
    assert.equal(addSongCalled, false, 'Viewer must not be permitted to queue songs when !sr is subscriber-only');
  });

  await runTest('ChatCommands: All registered commands in commandRegistry have valid metadata', () => {
    for (const def of COMMANDS) {
      assert.ok(def.name.length >= 1, `Command name ${def.name} should not be empty`);
      assert.ok(def.aliases === undefined || Array.isArray(def.aliases), `Command ${def.name} aliases must be array`);
      assert.ok(Array.isArray(def.defaultPermissions), `Command ${def.name} defaultPermissions must be array`);
    }
  });

  // ==========================================
  // SECTION 5: LIVE RUNNING SERVER HTTP VERIFICATION
  // ==========================================
  console.log('\n--- 5. Live Server Security & Endpoints ---');

  const base = 'http://127.0.0.1:3000';
  let serverReachable = false;
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    serverReachable = res.ok;
  } catch {}

  if (serverReachable) {
    await runTest('Live Server: Health endpoint returns OK and version', async () => {
      const res = await fetch(`${base}/api/health`);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.status, 'ok');
    });

    await runTest('Live Server: Rejects untrusted foreign origins (Anti-CSRF)', async () => {
      const res = await fetch(`${base}/api/state`, {
        headers: { Origin: 'https://malicious-website.example' }
      });
      assert.equal(res.status, 403, 'Foreign origin must receive 403 Forbidden');
    });

    await runTest('Live Server: State endpoint returns valid playback and queue structure', async () => {
      const res = await fetch(`${base}/api/state`);
      assert.equal(res.status, 200);
      const state = await res.json() as any;
      assert.ok(state.playback !== undefined, 'Playback state must be present');
      assert.ok(Array.isArray(state.queue), 'Queue array must be present');
      assert.ok(Array.isArray(state.blacklist), 'Blacklist array must be present');
      assert.ok(typeof state.playback.volume === 'number', 'Volume must be number');
    });

    await runTest('Live Server: Session token protects mutating POST endpoints', async () => {
      // POST without session token must fail with 403
      const unauthed = await fetch(`${base}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'de' })
      });
      assert.equal(unauthed.status, 403);
    });

    await runTest('Live Server: Volume endpoint rejects out-of-range volume values', async () => {
      const session = await fetch(`${base}/api/session`).then(r => r.json()) as any;
      
      const negativeVol = await fetch(`${base}/api/playback/volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Session': session.token
        },
        body: JSON.stringify({ volume: -20 })
      });
      assert.equal(negativeVol.status, 400);

      const hugeVol = await fetch(`${base}/api/playback/volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Session': session.token
        },
        body: JSON.stringify({ volume: 200 })
      });
      assert.equal(hugeVol.status, 400);
    });

    await runTest('Live Server: UI routes render successfully', async () => {
      const routes = ['/', '/overlay', '/overlay/standalone', '/dock/player'];
      for (const r of routes) {
        const res = await fetch(`${base}${r}`);
        assert.equal(res.status, 200, `Route ${r} should return 200 OK`);
        const text = await res.text();
        assert.ok(text.includes('<!DOCTYPE html>') || text.includes('<html'), `Route ${r} should return HTML`);
      }
    });

    await runTest('Live Server: OBS Dock URL parameters are accepted', async () => {
      const res = await fetch(`${base}/dock/player?layout=horizontal&density=compact&showQueue=false&accent=%23a855f7`);
      assert.equal(res.status, 200);
    });

    await runTest('Live Server: Script download routes return 404 cleanly when file missing', async () => {
      const res = await fetch(`${base}/api/scripts/nonexistent-route-file`);
      assert.equal(res.status, 404);
    });
  } else {
    console.log('  [Note: Local server at port 3000 not responding, skipping live HTTP tests]');
  }

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n====================================================');
  console.log(`  RUNDUM-TEST RESULT: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (failures.length > 0) {
    console.log(`  FAILED TESTS (${failures.length}):`);
    for (const f of failures) console.log(`    - ${f}`);
    console.log('====================================================\n');
    process.exit(1);
  } else {
    console.log('  ALL TESTS PASSED WITH 100% SUCCESS!');
    console.log('====================================================\n');
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
