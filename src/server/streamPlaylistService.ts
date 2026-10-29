import fs from 'node:fs';
import path from 'node:path';
import type { Track } from '../types.ts';
import { writeJson } from './atomicStore.ts';
import type { SpotifyService } from './spotifyService.ts';
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

  constructor(filePath = path.join(process.cwd(), 'data', 'stream-playlist.json')) {
    this.filePath = filePath;
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        if (Array.isArray(data)) {
          this.items = data;
        }
      }
    } catch (err) {
      logger.log('error', 'STREAM_PLAYLIST', 'Fehler beim Laden der Stream-Playlist', { error: String(err) });
      this.items = [];
    }
  }

  public removeTrack(id: string): boolean {
    const next = this.items.filter(item => item.id !== id);
    if (next.length === this.items.length) return false;
    writeJson(this.filePath, next, { strictAtomic: true }); this.items = next;
    return true;
  }

  private additions: Promise<unknown> = Promise.resolve();
  public addTrack(track: Track, addedBy: string, spotifyService?: SpotifyService, spotifyPlaylistId?: string): Promise<AddToPlaylistResult> {
    const operation = this.additions.then(() => this.addTrackSerial(track, addedBy, spotifyService, spotifyPlaylistId));
    this.additions = operation.catch(() => undefined);
    return operation;
  }

  public getItems(): StreamPlaylistEntry[] {
    return this.items.map(item => ({ ...item }));
  }

  private async addTrackSerial(
    track: Track,
    addedBy: string,
    spotifyService?: SpotifyService,
    spotifyPlaylistId?: string
  ): Promise<AddToPlaylistResult> {
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
      if (track.spotifyUri && item.spotifyUri && item.spotifyUri === track.spotifyUri) return true;
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

    let addedToSpotify = false;
    let spotifyError: string | undefined;

    // If Spotify playlist is configured and track has a Spotify URI (or Spotify service can resolve/add it)
    if (spotifyService && spotifyPlaylistId) {
      let uriToAdd = track.spotifyUri;
      if (!uriToAdd && spotifyService.isConnected()) {
        try {
          const query = `${track.title} ${track.artist}`.trim();
          const match = await spotifyService.searchTrack(query);
          if (match?.spotifyUri) {
            uriToAdd = match.spotifyUri;
          }
        } catch (e) {
          // Track not found on Spotify or search failed
        }
      }

      if (uriToAdd && spotifyService.isConnected()) {
        try {
          const res = await spotifyService.addToPlaylist(spotifyPlaylistId, uriToAdd);
          addedToSpotify = res.success;
          if (!res.success && res.error) {
            spotifyError = res.error;
          }
        } catch (e: unknown) {
          spotifyError = e instanceof Error ? e.message : String(e);
        }
      }
    }

    const entry: StreamPlaylistEntry = {
      id: track.id || `spl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: track.title,
      artist: track.artist || 'Unknown Artist',
      url: track.url || '',
      videoId: track.videoId,
      spotifyUri: track.spotifyUri,
      playbackProvider: provider,
      albumArtUrl: track.albumArtUrl,
      addedBy,
      addedAt: Date.now(),
      addedToSpotify
    };

    const next = [...this.items, entry];
    try { writeJson(this.filePath, next, { strictAtomic: true }); } catch (error) { return { success: false, error: String(error) }; }
    this.items = next;

    logger.log('info', 'STREAM_PLAYLIST', `Song zur Stream-Playlist hinzugefügt: ${entry.title} - ${entry.artist} von @${addedBy}`, {
      entry,
      addedToSpotify,
      spotifyError
    });

    return {
      success: true,
      entry,
      addedToSpotify,
      spotifyError
    };
  }
}
