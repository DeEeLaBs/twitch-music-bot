export const EMOTE_INDEX_CAP = 1500;

export function emoteUrl(provider: '7tv' | 'bttv', id: string, animated = false): string {
  if (provider === '7tv') {
    const file = animated ? '2x.gif' : '1x.webp';
    return `https://cdn.7tv.app/emote/${encodeURIComponent(id)}/${file}`;
  }
  return `https://cdn.betterttv.net/emote/${encodeURIComponent(id)}/1x`;
}

function put(into: Map<string, string>, name: unknown, url: string) {
  if (into.size >= EMOTE_INDEX_CAP) return;
  if (typeof name !== 'string' || !name || !url || into.has(name)) return;
  into.set(name, url);
}

export function add7tvEmotes(payload: unknown, into: Map<string, string>) {
  const emotes = findEmoteArray(payload);
  for (const emote of emotes) {
    if (!emote || typeof emote !== 'object') continue;
    const record = emote as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    if (!id) continue;
    const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : null;
    const animated = record.animated === true || data?.animated === true;
    put(into, record.name, emoteUrl('7tv', id, animated));
  }
}

export function addBttvEmotes(payload: unknown, into: Map<string, string>) {
  const lists = Array.isArray(payload) ? [payload] : [];
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.channelEmotes)) lists.push(record.channelEmotes);
    if (Array.isArray(record.sharedEmotes)) lists.push(record.sharedEmotes);
  }
  for (const list of lists) {
    for (const emote of list) {
      if (!emote || typeof emote !== 'object') continue;
      const record = emote as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : '';
      if (!id) continue;
      put(into, record.code, emoteUrl('bttv', id));
    }
  }
}

export function addFfzEmotes(payload: unknown, into: Map<string, string>) {
  if (!payload || typeof payload !== 'object') return;
  const sets = (payload as Record<string, unknown>).sets;
  if (!sets || typeof sets !== 'object') return;
  for (const set of Object.values(sets as Record<string, unknown>)) {
    if (!set || typeof set !== 'object') continue;
    const emoticons = (set as Record<string, unknown>).emoticons;
    if (!Array.isArray(emoticons)) continue;
    for (const emote of emoticons) {
      if (!emote || typeof emote !== 'object') continue;
      const record = emote as Record<string, unknown>;
      const urls = record.urls;
      const animated = record.animated;
      const frames = animated && typeof animated === 'object' ? animated as Record<string, unknown> : null;
      const stills = urls && typeof urls === 'object' ? urls as Record<string, unknown> : null;
      if (!frames && !stills) continue;
      const raw = frames?.['2'] || frames?.['1'] || stills?.['1'] || stills?.['2'];
      if (typeof raw !== 'string' || !raw) continue;
      put(into, record.name, raw.startsWith('//') ? `https:${raw}` : raw);
    }
  }
}

function findEmoteArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.emotes)) return record.emotes;
  const set = record.emote_set;
  if (set && typeof set === 'object' && Array.isArray((set as Record<string, unknown>).emotes)) {
    return (set as Record<string, unknown>).emotes as unknown[];
  }
  return [];
}

export async function fetchEmoteIndex(roomId?: string): Promise<Record<string, string>> {
  const jobs: Array<Promise<void>> = [];
  const into = new Map<string, string>();
  const add = (url: string, apply: (payload: unknown, into: Map<string, string>) => void) => {
    jobs.push((async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) return;
        apply(await response.json(), into);
      } catch {
        // A missing provider must not block chat.
      }
    })());
  };
  add('https://7tv.io/v3/emote-sets/global', add7tvEmotes);
  add('https://api.betterttv.net/3/cached/emotes/global', addBttvEmotes);
  add('https://api.frankerfacez.com/v1/set/global', addFfzEmotes);
  if (roomId && /^\d+$/.test(roomId)) {
    add(`https://7tv.io/v3/users/twitch/${roomId}`, add7tvEmotes);
    add(`https://api.betterttv.net/3/cached/users/twitch/${roomId}`, addBttvEmotes);
    add(`https://api.frankerfacez.com/v1/room/id/${roomId}`, addFfzEmotes);
  }
  await Promise.all(jobs);
  return Object.fromEntries(into);
}
