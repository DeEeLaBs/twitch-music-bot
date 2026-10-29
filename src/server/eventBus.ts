export type BotEventMap = {
  'playlist:track_added': import('./streamPlaylistService.ts').StreamPlaylistEntry;
  'config:changed': { changedKeys: string[] };
  'queue:changed': { reason: string };
  'search:resolved': { query: string; videoId: string; source: 'cache' | 'ytm' | 'youtube' };
  'search:failed': { query: string; error: string };
  'twitch:connection': { connected: boolean };
  'twitch:auth_failed': { reason?: string };
};

type Handler<T> = (payload: T) => void;
export class TypedEventBus {
  private listeners = new Map<keyof BotEventMap, Set<Handler<any>>>();
  on<K extends keyof BotEventMap>(event: K, handler: Handler<BotEventMap[K]>) {
    const set = this.listeners.get(event) || new Set();
    set.add(handler);
    this.listeners.set(event, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }
  emit<K extends keyof BotEventMap>(event: K, payload: BotEventMap[K]) {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    const handlers = Array.from(set);
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for event "${String(event)}":`, err);
      }
    }
  }
}
export const botEvents = new TypedEventBus();
