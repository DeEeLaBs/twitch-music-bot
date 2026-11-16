import type { Track, PlaybackState, BotConfig } from '../../types.ts';
import type { PlayerPlugin, PlayerActionResult } from './playerPlugin.ts';
import { nectarBridge, NectarBridge } from '../nectarBridge.ts';

export class NectarPlugin implements PlayerPlugin {
  public readonly id = 'nectar';
  public readonly name = 'NectarLink (Smartphone Bridge)';
  public readonly description = 'Spielt Musik vom Smartphone via NectarLink mit Fallback-Rangordnung';
  public readonly webPlayerUrl = 'https://github.com/thtbee/nectarlink';

  private bridge: NectarBridge;

  constructor(bridge: NectarBridge = nectarBridge) {
    this.bridge = bridge;
  }

  public isReady(_config?: BotConfig): boolean {
    return this.bridge.getIsConnected();
  }

  public isPlaying(): boolean {
    return this.bridge.getIsPlaying();
  }

  public async playTrack(track: Track): Promise<PlayerActionResult> {
    // Phone tracks are controlled on the phone; resuming playback triggers it
    await this.bridge.sendCommand('play');
    return { success: true, track };
  }

  public async play(): Promise<boolean> {
    return this.bridge.sendCommand('play');
  }

  public async pause(): Promise<boolean> {
    return this.bridge.sendCommand('pause');
  }

  public async playPause(): Promise<boolean> {
    return this.bridge.sendCommand('play_pause');
  }

  public async skip(): Promise<boolean> {
    return this.bridge.sendCommand('next');
  }

  public async previousTrack(): Promise<boolean> {
    return this.bridge.sendCommand('previous');
  }

  public async setVolume(volume: number): Promise<boolean> {
    return this.bridge.sendCommand('volume', volume);
  }

  public getPlaybackSnapshot(): Partial<PlaybackState> {
    const state = this.bridge.getState();
    const track = this.bridge.toTrack();
    if (!state || !track) {
      return {
        currentSong: null,
        isPlaying: false,
        source: 'idle'
      };
    }
    return {
      currentSong: track,
      isPlaying: state.isPlaying,
      progressSeconds: state.progressSeconds,
      durationSeconds: state.durationSeconds,
      source: 'external'
    };
  }

  public getStatusMessage(lang: 'de' | 'en' = 'de'): string {
    const isEn = lang === 'en';
    if (!this.bridge.getIsConnected()) {
      return isEn ? 'NectarLink bridge waiting for phone connection' : 'NectarLink-Bridge wartet auf Smartphone-Verbindung';
    }
    const state = this.bridge.getState();
    if (state?.isPlaying) {
      return isEn ? `Playing from phone (${state.title})` : `Wiedergabe vom Smartphone (${state.title})`;
    }
    return isEn ? 'Connected (Phone idle/paused)' : 'Verbunden (Smartphone pausiert)';
  }
}
