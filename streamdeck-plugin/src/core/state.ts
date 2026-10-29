// Minimal view of the bot's state: only what the Stream Deck needs.
// The plugin is a separate package, so it deliberately does not import the bot's own types.

export interface BotTrack {
  id: string;
  title: string;
  artist?: string;
  albumArtUrl?: string;
  requester?: { username: string; displayName?: string };
}

export interface BotPlayback {
  currentSong: BotTrack | null;
  isPlaying: boolean;
  volume: number;
  status?: string;
  error?: string;
}

export interface BotConfigView {
  songRequestsOpen?: boolean;
  autoPlayRadio?: boolean;
  channelPointsEnabled?: boolean;
  channelPointsRewardId?: string;
  twitchConnected?: boolean;
}

export interface BotState {
  playback: BotPlayback;
  queue: BotTrack[];
  config: BotConfigView;
}

export const EMPTY_STATE: BotState = {
  playback: { currentSong: null, isPlaying: false, volume: 0 },
  queue: [],
  config: {}
};

type QueueDelta =
  | { op: 'add'; track: BotTrack; index: number }
  | { op: 'remove'; trackId: string }
  | { op: 'move'; trackId: string; newIndex: number }
  | { op: 'replace'; queue: BotTrack[] };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function pick(source: Record<string, unknown>, previous: BotState): BotState {
  const playback = isObject(source.playback);
  const queue = Array.isArray(source.queue);
  const config = isObject(source.config);
  if (!playback && !queue && !config) return previous; // e.g. a patch that only carries logs or history
  return {
    playback: playback ? { ...previous.playback, ...(source.playback as Partial<BotPlayback>) } : previous.playback,
    queue: queue ? (source.queue as BotTrack[]) : previous.queue,
    config: config ? { ...(source.config as BotConfigView) } : previous.config
  };
}

function applyQueueDelta(queue: BotTrack[], delta: QueueDelta): BotTrack[] {
  switch (delta.op) {
    case 'add': {
      const next = queue.filter(track => track.id !== delta.track.id);
      next.splice(Math.max(0, Math.min(delta.index, next.length)), 0, delta.track);
      return next;
    }
    case 'remove': return queue.filter(track => track.id !== delta.trackId);
    case 'move': {
      const from = queue.findIndex(track => track.id === delta.trackId);
      if (from < 0) return queue;
      const next = [...queue];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(delta.newIndex, next.length)), 0, moved);
      return next;
    }
    case 'replace': return Array.isArray(delta.queue) ? delta.queue : queue;
    default: return queue;
  }
}

/** Applies one WebSocket message from the bot. Unknown or malformed messages leave the state untouched. */
export function applyMessage(state: BotState, message: unknown): BotState {
  if (!isObject(message) || typeof message.type !== 'string') return state;
  const data = message.data;
  switch (message.type) {
    case 'state':
      return isObject(data) ? pick(data, EMPTY_STATE) : state;
    case 'patch':
      return isObject(data) ? pick(data, state) : state;
    case 'queue_delta': {
      if (!isObject(data)) return state;
      const queue = applyQueueDelta(state.queue, data as unknown as QueueDelta);
      return queue === state.queue ? state : { ...state, queue };
    }
    default:
      return state;
  }
}

/**
 * Returns the state as the keys should display it, with `volume` replaced by the value the user asked for.
 * `null` (or an equal value) returns the very same object so redraw checks stay cheap.
 */
export function withVolume(state: BotState, volume: number | null): BotState {
  if (volume === null || volume === state.playback.volume) return state;
  return { ...state, playback: { ...state.playback, volume } };
}
