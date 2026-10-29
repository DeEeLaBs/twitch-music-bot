import type { Track, PlaybackState, BotConfig } from '../../types.ts';
import type { SpotifyService } from '../spotifyService.ts';
import type { PlayerPlugin, PlayerActionResult } from './playerPlugin.ts';

export class SpotifyPlugin implements PlayerPlugin {
  public readonly id = 'spotify';
  public readonly name = 'Spotify Web Player / Connect';
  public readonly description = 'Spotify Premium Wiedergabe über Spotify Web Player oder Spotify Connect Gerät';
  public readonly webPlayerUrl = 'https://open.spotify.com';

  private spotifyService: SpotifyService;

  constructor(spotifyService: SpotifyService) {
    this.spotifyService = spotifyService;
  }

  public isReady(config?: BotConfig): boolean {
    return Boolean(this.spotifyService.isReadyForPlayback() || config?.spotifyConnected);
  }

  public async playTrack(track: Track, options?: { timeoutMs?: number }): Promise<PlayerActionResult> {
    if (!track.spotifyUri) {
      return {
        success: false,
        error: 'Keine Spotify-URI für diesen Titel vorhanden.'
      };
    }

    try {
      const accepted = await this.spotifyService.playUri(track.spotifyUri);
      if (!accepted) {
        return {
          success: false,
          error: this.spotifyService.getLastError() || 'Spotify Wiedergabebefehl wurde nicht akzeptiert.'
        };
      }

      const timeout = options?.timeoutMs ?? 10_000;
      const started = await this.spotifyService.waitForUri(track.spotifyUri, timeout);
      if (!started) {
        return {
          success: false,
          error: this.spotifyService.getLastError() || 'Spotify-Songstart wurde innerhalb des Zeitlimits nicht bestätigt.'
        };
      }

      const snapshot = this.spotifyService.getSnapshot();
      const updatedTrack: Track = {
        ...track,
        title: snapshot.title || track.title,
        artist: snapshot.artist || track.artist,
        albumArtUrl: snapshot.albumArtUrl || track.albumArtUrl,
        duration: snapshot.durationSeconds || track.duration
      };

      return {
        success: true,
        track: updatedTrack
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Spotify Wiedergabe fehlgeschlagen.'
      };
    }
  }

  public async play(): Promise<boolean> {
    return this.spotifyService.play();
  }

  public async pause(): Promise<boolean> {
    return this.spotifyService.pause();
  }

  public async playPause(currentPlaybackState?: PlaybackState): Promise<boolean> {
    const isPlaying = currentPlaybackState?.isPlaying ?? this.spotifyService.getSnapshot().isPlaying;
    return isPlaying ? this.spotifyService.pause() : this.spotifyService.play();
  }

  public async skip(): Promise<boolean> {
    return this.spotifyService.next();
  }

  public async previousTrack(): Promise<boolean> {
    return this.spotifyService.previous();
  }

  public async setVolume(volume: number): Promise<boolean> {
    return this.spotifyService.setVolume(volume);
  }

  public getPlaybackSnapshot(): Partial<PlaybackState> {
    const snap = this.spotifyService.getSnapshot();
    return {
      isPlaying: snap.isPlaying,
      progressSeconds: snap.progressSeconds,
      durationSeconds: snap.durationSeconds,
      volume: snap.volume
    };
  }

  public getStatusMessage(lang: 'de' | 'en'): string {
    const ready = this.spotifyService.isReadyForPlayback();
    if (ready) {
      const snap = this.spotifyService.getSnapshot();
      const device = snap.deviceName ? ` (${snap.deviceName})` : '';
      return lang === 'de' ? `Spotify Premium bereit${device}` : `Spotify Premium ready${device}`;
    }
    return lang === 'de' ? 'Spotify nicht bereit (Benötigt Premium & aktives Gerät)' : 'Spotify not ready (Requires Premium & active device)';
  }
}

