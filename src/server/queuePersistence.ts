import fs from 'node:fs';
import path from 'node:path';
import type { BlacklistRule, Track } from '../types.ts';
import { scheduleJsonWrite, writeJson } from './atomicStore.ts';

export interface PersistedQueueState {
  queue: Track[];
  recoveredTrack: Track | null;
  history: Track[];
  blacklist: BlacklistRule[];
}

export class QueuePersistence {
  private readonly dataDir: string;
  constructor(dataDir = path.join(process.cwd(), 'data')) { this.dataDir = dataDir; }

  private ensureDirectory() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private readWithBackup(file: string, valid: (value: any) => boolean): any {
    for (const candidate of [file, file + '.backup']) {
      try {
        const value = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (!valid(value)) continue;
        if (candidate !== file) writeJson(file, value, { preserveBackup: true, strictAtomic: true });
        return value;
      } catch (error) {
        if (fs.existsSync(candidate)) console.warn('[QueuePersistence] Datei konnte nicht geladen werden:', candidate, error);
      }
    }
    return undefined;
  }

  public load(): PersistedQueueState {
    this.ensureDirectory();
    let blacklist: BlacklistRule[] = [];
    let blacklistLoaded = false;
    const blacklistFile = path.join(this.dataDir, 'blacklist.json');
    const parsedBlacklist = this.readWithBackup(blacklistFile, Array.isArray);
    if (parsedBlacklist !== undefined) { blacklist = parsedBlacklist; blacklistLoaded = true; }
    if (!blacklistLoaded) {
      blacklist = [
        { id: 'bl-1', term: 'earrape', type: 'keyword', addedBy: 'system', addedAt: Date.now() },
        { id: 'bl-2', term: '10 hours', type: 'keyword', addedBy: 'system', addedAt: Date.now() },
        { id: 'bl-3', term: 'moan', type: 'keyword', addedBy: 'system', addedAt: Date.now() },
        { id: 'bl-4', term: 'scream', type: 'keyword', addedBy: 'system', addedAt: Date.now() }
      ];
      if (!fs.existsSync(blacklistFile) && !fs.existsSync(blacklistFile + '.backup')) this.saveBlacklist(blacklist);
    }

    let queue: Track[] = [];
    let recoveredTrack: Track | null = null;
    let history: Track[] = [];
    const queueFile = path.join(this.dataDir, 'queue.json');
    const saved = this.readWithBackup(queueFile, value => Array.isArray(value) || (value && Array.isArray(value.queue)));
    if (saved !== undefined) {
      try {
        if (Array.isArray(saved)) queue = saved;
        else if (saved && Array.isArray(saved.queue)) {
          queue = saved.queue;
          recoveredTrack = saved.active || saved.pending || saved.current || null;
          history = Array.isArray(saved.history) ? saved.history.slice(0, 100) : [];
        }
        queue = queue.filter((track: Track) => track && typeof track.id === 'string' && typeof track.title === 'string' && track.requester && typeof track.requester.username === 'string').slice(0, 500);
        queue = queue.map(track => ({ ...track, playbackProvider: track.playbackProvider || (track.spotifyUri ? 'spotify' : 'youtube_music') }));
        if (recoveredTrack) recoveredTrack = { ...recoveredTrack, playbackProvider: recoveredTrack.playbackProvider || (recoveredTrack.spotifyUri ? 'spotify' : 'youtube_music') };
        if (recoveredTrack?.id) queue = queue.filter(track => track.id !== recoveredTrack!.id);
      } catch (error) { console.warn('[QueuePersistence] Queue konnte nicht gelesen werden:', error); }
    }
    return { queue, recoveredTrack, history, blacklist };
  }

  public saveQueue(queue: Track[], pending: Track | null, current: Track | null, recovered: Track | null, history: Track[]) {
    this.ensureDirectory();
    const active = pending || current || recovered || null;
    // Queue transitions must survive an immediate process exit. Unlike noisy UI
    // state, these writes are infrequent and intentionally flushed synchronously.
    writeJson(path.join(this.dataDir, 'queue.json'), { version: 3, queue, active, history }, { strictAtomic: true });
  }

  public saveBlacklist(blacklist: BlacklistRule[]) {
    this.ensureDirectory();
    scheduleJsonWrite(path.join(this.dataDir, 'blacklist.json'), blacklist);
  }
}
