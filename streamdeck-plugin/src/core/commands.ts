import type { BotRequestResult } from './botClient.ts';
import type { BotState } from './state.ts';

export interface CommandClient {
  post(path: string, body?: unknown): Promise<BotRequestResult>;
}

export interface CommandResult { ok: boolean; error?: string }

export const VOLUME_STEP = 5;

/** Shared helpers the plugin hands to every action. */
export interface ActionContext {
  /** Volume changes go through one coalescing controller so quick presses neither get lost nor queue up. */
  volume: { nudge(delta: number): Promise<CommandResult> };
}

export interface ActionDefinition {
  /** Short id; the manifest UUID is `com.twitchmusicbot.<id>`. */
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  /** Flash as soon as the key is pressed instead of after the bot answered (a failure still shows the alert). */
  instant?: boolean;
  /** Destructive actions need a second press within a few seconds. */
  confirm?: boolean;
  run(client: CommandClient, state: BotState, context: ActionContext): Promise<CommandResult>;
}

const fromResult = (result: BotRequestResult): CommandResult => result.ok ? { ok: true } : { ok: false, error: result.error };
const fail = (error: string): Promise<CommandResult> => Promise.resolve({ ok: false, error });
export const clampVolume = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const simple = (id: string, name: string, tier: 1 | 2 | 3, path: string, extra: Partial<ActionDefinition> = {}): ActionDefinition => ({
  id, name, tier, ...extra,
  run: async client => fromResult(await client.post(path))
});

const toggleConfig = (id: string, name: string, key: 'songRequestsOpen' | 'autoPlayRadio', current: (state: BotState) => boolean): ActionDefinition => ({
  id, name, tier: 3,
  run: async (client, state) => fromResult(await client.post('/api/config', { [key]: !current(state) }))
});

export const requestsAreOpen = (state: BotState) => state.config.songRequestsOpen !== false;
export const autoplayIsOn = (state: BotState) => state.config.autoPlayRadio !== false;

export const ACTIONS: ActionDefinition[] = [
  ...(['streamstart', 'subathon'] as const).flatMap(profile => [
    ...(['start', 'pause', 'resume', 'reset'] as const).map(action => ({
      id: `timer-${profile}-${action}`, name: `${profile === 'streamstart' ? 'Streamstart' : 'Subathon'}: ${action}`, tier: 3 as const,
      confirm: action === 'reset',
      run: async (client: CommandClient) => fromResult(await client.post(`/api/countdowns/${profile}/control`, { action }))
    })),
    ...([60, -60] as const).map(seconds => ({
      id: `timer-${profile}-${seconds > 0 ? 'plus' : 'minus'}`, name: `${profile === 'streamstart' ? 'Streamstart' : 'Subathon'}: ${seconds > 0 ? '+' : '-'}1 min`, tier: 3 as const,
      run: async (client: CommandClient) => fromResult(await client.post(`/api/countdowns/${profile}/control`, { action: 'add', seconds }))
    }))
  ]),
  // Tier 1: playback
  simple('play-pause', 'Play / Pause', 1, '/api/playback/play-pause'),
  simple('next', 'Next song', 1, '/api/playback/skip'),
  simple('previous', 'Previous song', 1, '/api/playback/previous'),
  {
    id: 'volume-up', name: 'Volume up', tier: 1, instant: true,
    run: async (_client, _state, context) => context.volume.nudge(VOLUME_STEP)
  },
  {
    id: 'volume-down', name: 'Volume down', tier: 1, instant: true,
    run: async (_client, _state, context) => context.volume.nudge(-VOLUME_STEP)
  },
  simple('start-queue', 'Start queue', 1, '/api/queue/start'),
  simple('clear-error', 'Clear playback error', 1, '/api/playback/clear-error'),
  {
    // Display key: pressing it toggles playback.
    id: 'now-playing', name: 'Now playing', tier: 1,
    run: async client => fromResult(await client.post('/api/playback/play-pause'))
  },

  // Tier 2: queue and moderation
  {
    id: 'veto-next', name: 'Remove next song', tier: 2,
    run: async (client, state) => {
      const next = state.queue[0];
      if (!next) return fail('The queue is empty.');
      return fromResult(await client.post('/api/queue/veto', { trackId: next.id }));
    }
  },
  simple('clear-queue', 'Clear queue', 2, '/api/queue/clear', { confirm: true }),
  {
    id: 'block-requester', name: 'Block current requester', tier: 2, confirm: true,
    run: async (client, state) => {
      const username = state.playback.currentSong?.requester?.username;
      if (!username) return fail('The current song has no requester.');
      return fromResult(await client.post('/api/queue/requester/block', { username, blocked: true }));
    }
  },
  {
    // Display key: pressing it starts the queue.
    id: 'queue-count', name: 'Queue length', tier: 2,
    run: async client => fromResult(await client.post('/api/queue/start'))
  },

  // Tier 3: switches
  toggleConfig('toggle-requests', 'Song requests open / closed', 'songRequestsOpen', requestsAreOpen),
  toggleConfig('toggle-autoplay', 'Autoplay radio', 'autoPlayRadio', autoplayIsOn),
  {
    id: 'toggle-channelpoints', name: 'Channel Points requests', tier: 3,
    run: async (client, state) => {
      // Enabling without a configured reward would only produce errors in the bot.
      if (!state.config.channelPointsEnabled && !state.config.channelPointsRewardId) return fail('Set up a Channel Points reward in the bot first.');
      return fromResult(await client.post('/api/config', { channelPointsEnabled: !state.config.channelPointsEnabled }));
    }
  }
];

export const ACTION_BY_ID = new Map(ACTIONS.map(action => [action.id, action]));

/** Requires the same key to be pressed twice within `windowMs` before a destructive action runs. */
export class ConfirmGate {
  private readonly armedAt = new Map<string, number>();
  private readonly windowMs: number;
  constructor(windowMs = 3000) { this.windowMs = windowMs; }

  /** Returns true when the action may run now; otherwise arms the key and returns false. */
  check(key: string, now: number): boolean {
    const armed = this.armedAt.get(key);
    if (armed !== undefined && now - armed <= this.windowMs) { this.armedAt.delete(key); return true; }
    this.armedAt.set(key, now);
    return false;
  }

  isArmed(key: string, now: number): boolean {
    const armed = this.armedAt.get(key);
    return armed !== undefined && now - armed <= this.windowMs;
  }

  clear(key: string): void { this.armedAt.delete(key); }
}

export interface VolumeControllerOptions {
  /** Clock, injectable for tests. */
  now?: () => number;
  /** How long the requested volume stays on display after the bot has answered. */
  holdMs?: number;
}

/**
 * Applies volume changes from keys and the dial. Rapid presses are coalesced: at most one request is in flight
 * and only the latest target is sent afterwards, so the bot is never flooded.
 *
 * While the bot catches up, its reported volume is not trustworthy (the player may still report the old value for a
 * moment), so the controller also remembers the volume that was *asked for*: it is what the keys display, and what
 * the next press builds on, until `holdMs` after the last answer.
 */
export class VolumeController {
  private target: number | null = null;
  private shown: number | null = null;
  private holdUntil = 0;
  private sending = false;
  private lastKnown = 50;
  private mutedFrom: number | null = null;
  private readonly client: CommandClient;
  private readonly getVolume: () => number;
  private readonly now: () => number;
  private readonly holdMs: number;

  constructor(client: CommandClient, getVolume: () => number, options: VolumeControllerOptions = {}) {
    this.client = client;
    this.getVolume = getVolume;
    this.now = options.now ?? Date.now;
    this.holdMs = options.holdMs ?? 1500;
  }

  /** The volume to display, or null when the bot's own reported volume can be trusted again. */
  shownVolume(): number | null {
    if (this.shown === null) return null;
    if (this.sending || this.now() < this.holdUntil) return this.shown;
    this.shown = null;
    return null;
  }

  private base(): number { return this.target ?? this.shownVolume() ?? this.getVolume(); }

  /**
   * Changes the volume relative to the newest requested volume (not the possibly outdated reported one).
   * Resolves immediately when a request is already in flight; the one that owns the request reports its outcome.
   */
  async nudge(delta: number): Promise<CommandResult> {
    const base = this.base();
    this.mutedFrom = null;
    return this.set(base + delta);
  }

  /** Mutes (remembering the level) or restores the previous level. */
  async toggleMute(): Promise<CommandResult> {
    const current = this.base();
    if (current > 0) { this.mutedFrom = current; return this.set(0); }
    const restore = this.mutedFrom && this.mutedFrom > 0 ? this.mutedFrom : this.lastKnown;
    this.mutedFrom = null;
    return this.set(restore);
  }

  private async set(volume: number): Promise<CommandResult> {
    this.target = clampVolume(volume);
    this.shown = this.target;
    if (this.sending) return { ok: true }; // the running loop picks up the newest target
    this.sending = true;
    let outcome: CommandResult = { ok: true };
    try {
      while (this.target !== null) {
        const sendNow: number = this.target;
        const result = await this.client.post('/api/playback/volume', { volume: sendNow });
        outcome = fromResult(result);
        if (result.ok && sendNow > 0) this.lastKnown = sendNow;
        if (!result.ok) { this.target = null; this.shown = null; break; }
        if (this.target === sendNow) { this.target = null; break; }
      }
    } finally {
      this.sending = false;
      if (this.shown !== null) this.holdUntil = this.now() + this.holdMs;
    }
    return outcome;
  }
}
