import type { QueueDelta } from './types.ts';

/** What a "song was added to the queue" pop on the overlay shows. Plain data: the component decides how it looks. */
export type QueuePopItem =
  | { kind: 'track'; key: string; title: string; artist: string; art: string; user: string; position: number }
  | { kind: 'more'; key: string; count: number };

export interface QueuePopState {
  /** The pop that is on screen right now. */
  current: QueuePopItem | null;
  /** Pops waiting for their turn. */
  pending: QueuePopItem[];
}

export const EMPTY_POP: QueuePopState = { current: null, pending: [] };

/** More than this many waiting pops are merged into one "+N more" pop, so a busy chat cannot keep the overlay popping for a minute. */
export const MAX_PENDING_POPS = 2;

const isRadioRequester = (username: string, displayName: string) =>
  username === 'radio' || username === 'YouTube Music Radio' || displayName === 'Autoplay Radio';

/**
 * Turns a queue change into a pop. Only a single added viewer request qualifies: removals, moves and bulk
 * replacements (for example a restored queue) never pop, and neither do tracks added by the autoplay radio.
 */
export function popFromDelta(delta: QueueDelta): QueuePopItem | null {
  if (delta.op !== 'add') return null;
  const { track, index } = delta;
  const requester = track.requester;
  if (!requester || isRadioRequester(requester.username, requester.displayName)) return null;
  return {
    kind: 'track',
    key: track.id,
    title: track.title,
    artist: track.artist,
    art: track.albumArtUrl || '',
    user: requester.displayName || requester.username,
    position: index + 1
  };
}

/** Adds a pop. It shows immediately when nothing is on screen; otherwise it waits (or is merged into "+N more"). */
export function enqueuePop(state: QueuePopState, item: QueuePopItem): QueuePopState {
  if (!state.current) return { current: item, pending: [] };
  const pending = [...state.pending, item];
  if (pending.length <= MAX_PENDING_POPS) return { current: state.current, pending };
  const count = pending.reduce((total, entry) => total + (entry.kind === 'more' ? entry.count : 1), 0);
  return { current: state.current, pending: [{ kind: 'more', key: `more-${item.key}`, count }] };
}

/** The current pop is done: show the next one, if any. */
export function advancePop(state: QueuePopState): QueuePopState {
  if (!state.current) return state;
  const [next, ...rest] = state.pending;
  return { current: next ?? null, pending: rest };
}

export function popText(item: QueuePopItem, language: 'de' | 'en'): { kicker: string; title: string; subtitle: string } {
  const de = language === 'de';
  const kicker = de ? 'Neu in der Warteschlange' : 'Added to the queue';
  if (item.kind === 'more') return { kicker, title: de ? `+${item.count} weitere Songs` : `+${item.count} more songs`, subtitle: '' };
  return { kicker, title: item.title, subtitle: `${item.artist} · @${item.user} · #${item.position}` };
}
