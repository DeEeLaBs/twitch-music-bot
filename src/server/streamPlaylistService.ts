import fs from 'node:fs';
import path from 'node:path';
import type { Track } from '../types.ts';
import { writeJson } from './atomicStore.ts';
import type { PlaylistSync } from '../playlistSync.ts';
import { spotifyPlaylistUri } from '../spotifyPlaylist.ts';

export interface PlaylistSpotifyClient {
  isConnected(): boolean;
  resolvePlaylistTrack(track: { title: string; artist: string; duration?: number }): Promise<{ state: 'matched' | 'ambiguous' | 'not_found'; uri?: string }>;
  addToPlaylist(playlist: string, uri: string): Promise<{ success: boolean; alreadyExists?: boolean; error?: string; uncertain?: boolean }>;
}
import { logger } from './logger.ts';

export interface StreamPlaylistEntry {
  id: string;
  title: string;
  artist: string;
  url: string;
  videoId?: string;
  spotifyUri?: string;
  playbackProvider: 'youtube_music' | 'spotify' | 'unknown';
  albumArtUrl?: string;
  addedBy: string;
  addedAt: number;
  addedToSpotify?: boolean;
  duration?: number;
  spotifySync?: PlaylistSync;
}

export interface AddToPlaylistResult {
  success: boolean;
  entry?: StreamPlaylistEntry;
  alreadyExists?: boolean;
  addedToSpotify?: boolean;
  spotifyError?: string;
  error?: string;
}

export class StreamPlaylistService {
  private filePath: string;
  private items: StreamPlaylistEntry[] = [];
  private storageError = false;

  constructor(filePath = path.join(process.cwd(), 'data', 'stream-playlist.json')) {
    this.filePath = filePath;
    this.load();
  }

  private load() {
    for (const candidate of [this.filePath, this.filePath + '.backup']) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (!Array.isArray(data) || data.some(item => !item || typeof item.id !== 'string' || typeof item.title !== 'string')) throw new Error('Invalid playlist');
        if (candidate !== this.filePath) writeJson(this.filePath, data, { strictAtomic: true, preserveBackup: true });
        this.items = data; return;
      } catch { /* Never overwrite unreadable source data with an empty playlist. */ }
    }
    this.storageError = fs.existsSync(this.filePath) || fs.existsSync(this.filePath + '.backup');
    if (this.storageError) logger.log('error', 'STREAM_PLAYLIST', 'Stream-Playlist und Backup unlesbar; Änderungen sind gesperrt.');
  }

  public removeTrack(id: string): boolean {
    if (this.storageError) throw new Error('Stream-Playlist-Speicher unlesbar.');
    const next = this.items.filter(item => item.id !== id);
    if (next.length === this.items.length) return false;
    writeJson(this.filePath, next, { strictAtomic: true }); this.items = next;
    return true;
  }

  private additions: Promise<unknown> = Promise.resolve();
  public addTrack(track: Track, addedBy: string, spotifyService?: PlaylistSpotifyClient, spotifyPlaylistId?: string): Promise<AddToPlaylistResult> {
    const operation = this.additions.then(() => this.addTrackSerial(track, addedBy, spotifyService, spotifyPlaylistId));
    this.additions = operation.catch(() => undefined);
    return operation;
  }

  public getItems(): StreamPlaylistEntry[] {
    return structuredClone(this.items);
  }

  private async addTrackSerial(
    track: Track,
    addedBy: string,
    spotifyService?: PlaylistSpotifyClient,
    spotifyPlaylistId?: string
  ): Promise<AddToPlaylistResult> {
    if (this.storageError) return { success: false, error: 'Stream-Playlist-Speicher unlesbar.' };
    if (!track || !track.title) {
      return { success: false, error: 'Kein gültiger Song übergeben.' };
    }

    const provider: 'youtube_music' | 'spotify' | 'unknown' =
      track.playbackProvider ||
      (track.requestSource === 'spotify' || track.spotifyUri ? 'spotify' : 'youtube_music');

    // Check if song is already in the playlist (by spotifyUri, videoId, or same title+artist)
    const normalizedTitle = track.title.trim().toLowerCase();
    const normalizedArtist = (track.artist || '').trim().toLowerCase();

    const existing = this.items.find(item => {
      if ((track.spotifyUri || track.sourceSpotifyUri) && item.spotifyUri === (track.spotifyUri || track.sourceSpotifyUri)) return true;
      if (track.videoId && item.videoId && item.videoId === track.videoId) return true;
      if (item.title.trim().toLowerCase() === normalizedTitle && (item.artist || '').trim().toLowerCase() === normalizedArtist) {
        return true;
      }
      return false;
    });

    if (existing) {
      return {
        success: false,
        alreadyExists: true,
        entry: existing
      };
    }

    const entry: StreamPlaylistEntry = {
      id: track.id || `spl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: track.title,
      artist: track.artist || 'Unknown Artist',
      url: track.url || '',
      videoId: track.videoId,
      spotifyUri: track.spotifyUri || track.sourceSpotifyUri,
      playbackProvider: provider,
      albumArtUrl: track.albumArtUrl,
      addedBy,
      addedAt: Date.now(),
      addedToSpotify: false,
      duration: track.duration,
      spotifySync: { state: 'pending', updatedAt: Date.now() }
    };

    const next = [...this.items, entry];
    try { writeJson(this.filePath, next, { strictAtomic: true }); } catch (error) { return { success: false, error: String(error) }; }
    this.items = next;

    await this.syncEntry(entry.id, spotifyService, spotifyPlaylistId);
    const saved = this.getItems().find(item => item.id === entry.id) || entry;
    return { success: true, entry: saved, addedToSpotify: saved.addedToSpotify };
  }

  public retrySpotify(id: string, spotify: PlaylistSpotifyClient, playlist?: string, useConfiguredPlaylist = false) {
    const operation = this.additions.then(() => this.syncEntry(id, spotify, playlist, useConfiguredPlaylist));
    this.additions = operation.catch(() => undefined);
    return operation;
  }
  private saveSync(id: string, sync: PlaylistSync) {
    const next = this.items.map(item => item.id === id ? { ...item, spotifySync: structuredClone(sync),
      addedToSpotify: sync.state === 'added' || sync.state === 'already_present' } : item);
    writeJson(this.filePath, next, { strictAtomic: true });
    this.items = next;
  }
  private async syncEntry(id: string, spotify?: PlaylistSpotifyClient, configured?: string, useConfiguredPlaylist = false) {
    const entry = this.items.find(item => item.id === id);
    if (!entry) throw new Error('Song nicht gefunden.');
    if ((entry.spotifySync?.retryAfter || 0) > Date.now()) return structuredClone(entry);
    if (entry.spotifySync?.state === 'added' || entry.spotifySync?.state === 'already_present') return structuredClone(entry);
    const chosenTarget = useConfiguredPlaylist ? spotifyPlaylistUri(configured || '') : undefined;
    if (useConfiguredPlaylist && !chosenTarget) throw new Error('Keine gültige Spotify-Ziel-Playlist konfiguriert.');
    let sync: PlaylistSync = { ...entry.spotifySync, state: 'pending', message: undefined, updatedAt: Date.now() };
    if (chosenTarget) sync.playlist = chosenTarget;
    try {
      try { sync.playlist = spotifyPlaylistUri(sync.playlist || configured || ''); }
      catch { sync.playlist = ''; }
      if (!sync.playlist) sync.message = 'Keine gültige Spotify-Stream-Playlist konfiguriert.';
      else if (!spotify?.isConnected()) sync.message = 'Spotify verbinden; gegebenenfalls erneut anmelden.';
      else {
        const known = entry.spotifyUri || (entry.url.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[?/#]|$)/)?.[1] ? `spotify:track:${entry.url.match(/track\/([A-Za-z0-9]{22})/)![1]}` : undefined);
        sync.uri = sync.uri || known;
        if (sync.uri && !/^spotify:track:[A-Za-z0-9]{22}$/.test(sync.uri)) sync.uri = undefined;
        if (!sync.uri) {
          const match = await spotify.resolvePlaylistTrack(entry);
          if (match.state !== 'matched' || !match.uri) {
            sync.state = match.state === 'not_found' ? 'not_found' : 'needs_match';
          } else sync.uri = match.uri;
        }
        if (sync.uri) {
          // Persist the exact target and track before the external write, including uncertain outcomes.
          sync.retryAfter = Date.now() + 30000;
          this.saveSync(id, sync);
          const result = await spotify.addToPlaylist(sync.playlist, sync.uri);
          if (result.success || result.uncertain === false) sync.retryAfter = undefined;
          sync.state = result.success ? result.alreadyExists ? 'already_present' : 'added' : 'failed';
          const wait = /nach (\d+) Sekunden/.exec(result.error || '');
          if (wait) sync.retryAfter = Math.max(sync.retryAfter || 0, Date.now() + Number(wait[1]) * 1000);
          const forbidden = /HTTP (401|403)/.test(result.error || '');
          const inaccessible = /HTTP 404/.test(result.error || '');
          sync.message = result.success ? undefined : wait ? `Spotify-Anfragelimit: nach ${wait[1]} Sekunden erneut versuchen.` : inaccessible ? 'Spotify-Playlist nicht gefunden oder nicht zugänglich. Link prüfen und Spotify mit Playlist-Leserechten erneut verbinden.' : forbidden ? 'Spotify erneut verbinden und Schreib-/Leseberechtigung für die eigene Stream-Playlist prüfen.' : 'Spotify nicht erreichbar oder Berechtigung fehlt. Anmeldung und Playlist prüfen; später erneut versuchen.';
        }
      }
    } catch (error) {
      sync.state = 'failed';
      const wait = /Erneut in (\d+)s/.exec(error instanceof Error ? error.message : '');
      if (wait) sync.retryAfter = Math.max(sync.retryAfter || 0, Date.now() + Number(wait[1]) * 1000);
      sync.message = wait ? `Spotify-Anfragelimit: nach ${wait[1]} Sekunden erneut versuchen.` : 'Spotify-Übertragung nicht bestätigt. Anmeldung und Playlist prüfen; später erneut versuchen.';
    }
    sync.updatedAt = Date.now();
    try { this.saveSync(id, sync); }
    catch { /* The durable pending entry remains retryable; never claim an unrecorded success. */ }
    return this.getItems().find(item => item.id === id) || structuredClone(entry);
  }
}
