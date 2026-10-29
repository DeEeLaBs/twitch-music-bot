import { segmentChat, type OverlayChatLine } from './overlayChat.ts';

/** Same emote this many times inside the window counts as spam. */
export const EMOTE_SPAM_COUNT = 4;
export const EMOTE_SPAM_WINDOW_MS = 5000;
export const EMOTE_SPAM_COOLDOWN_MS = 2800;

export interface EmoteBurst {
  name: string;
  url: string;
}

export interface EmoteSpamClock {
  recent: Array<{ name: string; url: string; at: number }>;
  cooldownUntil: number;
}

export function emptyEmoteSpam(): EmoteSpamClock {
  return { recent: [], cooldownUntil: 0 };
}

export function safeEmoteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    const host = parsed.hostname;
    const allowed = host === 'static-cdn.jtvnw.net'
      || host === 'cdn.7tv.app'
      || host === 'cdn.betterttv.net'
      || host === 'cdn.frankerfacez.com';
    return allowed ? parsed.toString() : '';
  } catch {
    return '';
  }
}

/** Prefer the moving file. Twitch stills become the animated rendition; other hosts already point at a gif or animated webp when one exists. */
export function playingEmoteUrl(url: string): string {
  const safe = safeEmoteUrl(url);
  if (!safe) return '';
  const parsed = new URL(safe);
  if (parsed.hostname !== 'static-cdn.jtvnw.net' || !parsed.pathname.includes('/static/')) return safe;
  parsed.pathname = parsed.pathname.replace('/static/', '/animated/').replace(/\/\d+(?:\.\d+)?$/, '/3.0');
  return parsed.toString();
}

export function pushEmoteLine(
  clock: EmoteSpamClock,
  line: OverlayChatLine,
  names: Readonly<Record<string, string>>,
  now: number
): { clock: EmoteSpamClock; burst: EmoteBurst | null } {
  const fresh = clock.recent.filter(hit => now - hit.at <= EMOTE_SPAM_WINDOW_MS);
  for (const segment of segmentChat(line.text, line.emotes, names)) {
    if (segment.type !== 'emote') continue;
    const url = safeEmoteUrl(segment.url);
    if (!url) continue;
    fresh.push({ name: segment.name, url, at: now });
  }
  const counts = new Map<string, { name: string; url: string; count: number }>();
  for (const hit of fresh) {
    const current = counts.get(hit.url);
    if (current) current.count += 1;
    else counts.set(hit.url, { name: hit.name, url: hit.url, count: 1 });
  }
  let best: { name: string; url: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (entry.count >= EMOTE_SPAM_COUNT && (!best || entry.count > best.count)) best = entry;
  }
  if (!best || now < clock.cooldownUntil) return { clock: { recent: fresh, cooldownUntil: clock.cooldownUntil }, burst: null };
  return {
    clock: { recent: fresh.filter(hit => hit.url !== best.url), cooldownUntil: now + EMOTE_SPAM_COOLDOWN_MS },
    burst: { name: best.name, url: best.url }
  };
}
