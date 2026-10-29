import type { Track, BotConfig } from '../../types.ts';
import type { YtmCompanionClient } from '../ytmCompanion.ts';
import type { PlayerPlugin, PlayerActionResult } from './playerPlugin.ts';

export class YouTubeMusicPlugin implements PlayerPlugin {
  public readonly id = 'youtube_music';
  public readonly name = 'YouTube Music Web Player';
  public readonly description = 'YouTube Music Web Player (nativ eingebettet / Desktop Companion)';
  public readonly webPlayerUrl = 'https://music.youtube.com';

  private companion: YtmCompanionClient;

  constructor(companion: YtmCompanionClient) {
    this.companion = companion;
  }

  public isReady(config?: BotConfig): boolean {
    return Boolean(this.companion.getIsConnected() || this.companion.getIsSimulation() || config?.ytmTokenConfigured);
  }

  public async playTrack(track: Track, options?: { autoplayRadio?: boolean }): Promise<PlayerActionResult> {
    try {
      const accepted = await this.companion.playTrack(track, options?.autoplayRadio);
      if (!accepted) {
        return {
          success: false,
          error: this.companion.getLastCommandError() || 'YouTube Music hat den Songstart abgelehnt.'
        };
      }
      return { success: true, track };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'YouTube Music Wiedergabe fehlgeschlagen.'
      };
    }
  }

  public async play(): Promise<boolean> {
    return this.companion.play();
  }

  public async pause(): Promise<boolean> {
    return this.companion.pause();
  }

  public async playPause(): Promise<boolean> {
    return this.companion.playPause();
  }

  public async previousTrack(): Promise<boolean> {
    return this.companion.previousTrack();
  }

  public async skip(): Promise<boolean> {
    if (typeof (this.companion as any).skipTrack === 'function') {
      return (this.companion as any).skipTrack();
    }
    if (typeof (this.companion as any).next === 'function') {
      return (this.companion as any).next();
    }
    return false;
  }

  public async setVolume(volume: number): Promise<boolean> {
    return this.companion.setVolume(volume);
  }

  public getStatusMessage(lang: 'de' | 'en'): string {
    const connected = this.companion.getIsConnected();
    if (connected) {
      return lang === 'de' ? 'Verbunden mit YouTube Music Web Player' : 'Connected to YouTube Music Web Player';
    }
    return lang === 'de' ? 'Nicht verbunden (Warte auf Web Player)' : 'Disconnected (Waiting for Web Player)';
  }
}
