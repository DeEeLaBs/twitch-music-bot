import type { BotConfig } from '../../types.ts';
import type { PlayerPlugin, PlayerPluginMetadata } from './playerPlugin.ts';

export class PlayerPluginRegistry {
  private plugins = new Map<string, PlayerPlugin>();

  constructor(initialPlugins: PlayerPlugin[] = []) {
    for (const plugin of initialPlugins) {
      this.register(plugin);
    }
  }

  public register(plugin: PlayerPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  public unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  public get(id: string): PlayerPlugin | undefined {
    return this.plugins.get(id);
  }

  public getAll(): PlayerPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Retrieves the active player plugin for the configured provider id.
   * Falls back to 'youtube_music' if the active provider is not found.
   */
  public getActivePlugin(activeId = 'youtube_music'): PlayerPlugin {
    const plugin = this.plugins.get(activeId);
    if (plugin) return plugin;

    const fallback = this.plugins.get('youtube_music') || this.plugins.values().next().value;
    if (fallback) return fallback;

    throw new Error(`Kein Player-Plugin für "${activeId}" gefunden und kein Standard-Plugin verfügbar.`);
  }

  /**
   * Returns a list of plugin descriptors with status for UI and settings.
   */
  public listDescriptors(config?: BotConfig): Array<PlayerPluginMetadata & { isReady: boolean; statusMessage?: string }> {
    return this.getAll().map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      webPlayerUrl: plugin.webPlayerUrl,
      authType: plugin.id === 'spotify' ? 'oauth' : plugin.id === 'youtube_music' ? 'companion' : 'none',
      isReady: plugin.isReady(config),
      statusMessage: plugin.getStatusMessage ? plugin.getStatusMessage(config?.language === 'de' ? 'de' : 'en') : undefined
    }));
  }
}

