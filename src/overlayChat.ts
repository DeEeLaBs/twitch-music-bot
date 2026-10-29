import type { BadgeType } from './types.ts';

export const CHAT_ROLE_FILTERS = ['all', 'subscriber', 'vip', 'moderator'] as const;
export type ChatRoleFilter = (typeof CHAT_ROLE_FILTERS)[number];
export const CHAT_STYLES = ['classic', 'bubbles', 'stacked', 'inline', 'messenger', 'nametag', 'terminal', 'bevel', 'handheld', 'arcade', 'y2k', 'receipt', 'neon', 'vapor', 'hud', 'gothic', 'gem', 'brutal', 'comic', 'note', 'sakura'] as const;
export type ChatStyle = (typeof CHAT_STYLES)[number];
export const CHAT_MOTIONS = ['none', 'fade', 'slide', 'rise', 'scale', 'blur', 'wipe', 'drop', 'pop', 'shutter', 'tilt', 'squash', 'flash'] as const;
export type ChatMotion = (typeof CHAT_MOTIONS)[number];
export const BASIC_CHAT_MOTIONS = ['none', 'fade', 'slide'] as const satisfies readonly ChatMotion[];
export const CREATIVE_CHAT_MOTIONS = ['rise', 'scale', 'blur', 'wipe', 'drop', 'pop', 'shutter', 'tilt', 'squash', 'flash'] as const satisfies readonly ChatMotion[];

export interface ChatBadge {
  set: string;
  version: string;
}

export interface OverlayChatOptions {
  enabled: boolean;
  showBadges: boolean;
  showTimestamps: boolean;
  showNameColors: boolean;
  showBackground: boolean;
  showEmotes: boolean;
  showOutline: boolean;
  showReplies: boolean;
  highlightMentions: boolean;
  style: ChatStyle;
  /** Entrance. The matching exit is exitMotion, played in reverse. */
  motion: ChatMotion;
  exitMotion: ChatMotion;
  fontSize: number;
  /** Empty uses the overlay default face. */
  fontFamily: string;
  nameColor: string;
  messageColor: string;
  background: string;
  opacity: number;
  maxLines: number;
  /** 0 keeps a line until newer lines push it out. */
  lifetimeSeconds: number;
  fadeMs: number;
  hideCommands: boolean;
  roleFilter: ChatRoleFilter;
  blockWords: string[];
  blockUsers: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_CHAT_OPTIONS: OverlayChatOptions = {
  enabled: false,
  showBadges: true,
  showTimestamps: false,
  showNameColors: true,
  showBackground: true,
  showEmotes: true,
  showOutline: true,
  showReplies: true,
  highlightMentions: true,
  style: 'classic',
  motion: 'rise',
  exitMotion: 'rise',
  fontSize: 16,
  fontFamily: '',
  nameColor: '#ffffff',
  messageColor: '#f4f4f5',
  background: '#09090b',
  opacity: 55,
  maxLines: 12,
  lifetimeSeconds: 30,
  fadeMs: 180,
  hideCommands: true,
  roleFilter: 'all',
  blockWords: [],
  blockUsers: [],
  x: 2,
  y: 58,
  width: 28,
  height: 38
};

export interface ChatEmoteRange {
  id: string;
  start: number;
  end: number;
}

export interface OverlayChatLine {
  id: string;
  userId: string;
  login: string;
  displayName: string;
  color: string;
  badge: BadgeType;
  badges: ChatBadge[];
  text: string;
  emotes: ChatEmoteRange[];
  bits: number;
  replyTo: string;
  replyText: string;
  first: boolean;
  ts: number;
}

export interface ChatClearEvent {
  scope: 'message' | 'user' | 'all';
  messageId?: string;
  userId?: string;
}

export type ChatSegment =
  | { type: 'text'; text: string }
  | { type: 'emote'; name: string; url: string };

export const CHAT_BUFFER_CAP = 100;

const ROLE_RANK: Record<BadgeType, number> = {
  viewer: 0,
  subscriber: 1,
  vip: 2,
  moderator: 3,
  broadcaster: 4
};

const FILTER_RANK: Record<Exclude<ChatRoleFilter, 'all'>, number> = {
  subscriber: 1,
  vip: 2,
  moderator: 3
};

function chatMotion(value: unknown, fallback: ChatMotion): ChatMotion {
  return CHAT_MOTIONS.includes(value as ChatMotion) ? value as ChatMotion : fallback;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function hexColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function wordList(value: unknown, maxItems: number): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const item of source) {
    const text = String(item || '').trim().slice(0, 40);
    if (!text || out.some(existing => existing.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeChat(options?: Partial<OverlayChatOptions> | null): OverlayChatOptions {
  const incoming = options || {};
  return {
    enabled: incoming.enabled ?? DEFAULT_CHAT_OPTIONS.enabled,
    showBadges: incoming.showBadges ?? DEFAULT_CHAT_OPTIONS.showBadges,
    showTimestamps: incoming.showTimestamps ?? DEFAULT_CHAT_OPTIONS.showTimestamps,
    showNameColors: incoming.showNameColors ?? DEFAULT_CHAT_OPTIONS.showNameColors,
    showBackground: incoming.showBackground ?? DEFAULT_CHAT_OPTIONS.showBackground,
    showEmotes: incoming.showEmotes ?? DEFAULT_CHAT_OPTIONS.showEmotes,
    showOutline: incoming.showOutline ?? DEFAULT_CHAT_OPTIONS.showOutline,
    showReplies: incoming.showReplies ?? DEFAULT_CHAT_OPTIONS.showReplies,
    highlightMentions: incoming.highlightMentions ?? DEFAULT_CHAT_OPTIONS.highlightMentions,
    style: CHAT_STYLES.includes(incoming.style as ChatStyle) ? incoming.style as ChatStyle : DEFAULT_CHAT_OPTIONS.style,
    motion: chatMotion(incoming.motion, DEFAULT_CHAT_OPTIONS.motion),
    exitMotion: chatMotion(incoming.exitMotion, chatMotion(incoming.motion, DEFAULT_CHAT_OPTIONS.motion)),
    fontSize: clamp(Number(incoming.fontSize), 12, 32, DEFAULT_CHAT_OPTIONS.fontSize),
    fontFamily: String(incoming.fontFamily || '').slice(0, 120),
    nameColor: hexColor(incoming.nameColor, DEFAULT_CHAT_OPTIONS.nameColor),
    messageColor: hexColor(incoming.messageColor, DEFAULT_CHAT_OPTIONS.messageColor),
    background: hexColor(incoming.background, DEFAULT_CHAT_OPTIONS.background),
    opacity: clamp(Number(incoming.opacity), 0, 100, DEFAULT_CHAT_OPTIONS.opacity),
    maxLines: clamp(Math.round(Number(incoming.maxLines)), 4, 50, DEFAULT_CHAT_OPTIONS.maxLines),
    lifetimeSeconds: clamp(Math.round(Number(incoming.lifetimeSeconds)), 0, 180, DEFAULT_CHAT_OPTIONS.lifetimeSeconds),
    fadeMs: clamp(Math.round(Number(incoming.fadeMs)), 0, 1000, DEFAULT_CHAT_OPTIONS.fadeMs),
    hideCommands: incoming.hideCommands ?? DEFAULT_CHAT_OPTIONS.hideCommands,
    roleFilter: CHAT_ROLE_FILTERS.includes(incoming.roleFilter as ChatRoleFilter) ? incoming.roleFilter as ChatRoleFilter : DEFAULT_CHAT_OPTIONS.roleFilter,
    blockWords: wordList(incoming.blockWords, 40),
    blockUsers: wordList(incoming.blockUsers, 40),
    x: clamp(Number(incoming.x), 0, 100, DEFAULT_CHAT_OPTIONS.x),
    y: clamp(Number(incoming.y), 0, 100, DEFAULT_CHAT_OPTIONS.y),
    width: clamp(Number(incoming.width), 12, 80, DEFAULT_CHAT_OPTIONS.width),
    height: clamp(Number(incoming.height), 12, 90, DEFAULT_CHAT_OPTIONS.height)
  };
}

const BADGE_SET = /^[a-z0-9_-]{1,32}$/i;

export function parseIrcBadges(value: string): ChatBadge[] {
  const out: ChatBadge[] = [];
  for (const part of value.split(',')) {
    const slash = part.indexOf('/');
    const set = (slash >= 0 ? part.slice(0, slash) : part).trim();
    const version = (slash >= 0 ? part.slice(slash + 1) : '1').trim() || '1';
    if (!BADGE_SET.test(set)) continue;
    out.push({ set: set.toLowerCase(), version: version.slice(0, 12) });
    if (out.length >= 8) break;
  }
  return out;
}

export function badgesForRole(badge: BadgeType): ChatBadge[] {
  if (badge === 'viewer') return [];
  return [{ set: badge, version: '1' }];
}

export function badgeFromIrc(badges: string, login: string, channel: string): BadgeType {
  const name = login.toLowerCase();
  const room = channel.toLowerCase().replace(/^#/, '');
  const sets = new Set(parseIrcBadges(badges).map(badge => badge.set));
  if (name && name === room) return 'broadcaster';
  if (sets.has('broadcaster')) return 'broadcaster';
  if (sets.has('moderator')) return 'moderator';
  if (sets.has('vip')) return 'vip';
  if (sets.has('subscriber') || sets.has('founder')) return 'subscriber';
  return 'viewer';
}

export function parseTwitchEmoteTag(value: string | undefined): ChatEmoteRange[] {
  if (!value) return [];
  const ranges: ChatEmoteRange[] = [];
  for (const group of value.split('/')) {
    const split = group.indexOf(':');
    if (split <= 0) continue;
    const id = group.slice(0, split);
    for (const pair of group.slice(split + 1).split(',')) {
      const bounds = pair.split('-');
      const start = Number(bounds[0]);
      const end = Number(bounds[1]);
      if (!id || !Number.isInteger(start) || !Number.isInteger(end) || end < start) continue;
      ranges.push({ id, start, end });
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

export function acceptChatLine(line: OverlayChatLine, options: OverlayChatOptions): boolean {
  if (!options.enabled) return false;
  const text = line.text.trim();
  if (options.hideCommands && text.startsWith('!')) return false;
  if (options.roleFilter !== 'all' && ROLE_RANK[line.badge] < FILTER_RANK[options.roleFilter]) return false;
  const login = line.login.toLowerCase();
  if (options.blockUsers.some(user => user.toLowerCase().replace(/^@/, '') === login)) return false;
  const haystack = text.toLowerCase();
  if (options.blockWords.some(word => word && haystack.includes(word.toLowerCase()))) return false;
  return true;
}

export function applyChatClear(lines: readonly OverlayChatLine[], clear: ChatClearEvent): OverlayChatLine[] {
  if (clear.scope === 'all') return [];
  if (clear.scope === 'message' && clear.messageId) return lines.filter(line => line.id !== clear.messageId);
  if (clear.scope === 'user' && clear.userId) return lines.filter(line => line.userId !== clear.userId);
  return [...lines];
}

export function pushChatLine(lines: readonly OverlayChatLine[], line: OverlayChatLine): OverlayChatLine[] {
  if (lines.some(existing => existing.id === line.id)) return [...lines];
  const next = [...lines, line];
  return next.length > CHAT_BUFFER_CAP ? next.slice(next.length - CHAT_BUFFER_CAP) : next;
}

export function visibleChatLines(lines: readonly OverlayChatLine[], options: OverlayChatOptions, now: number): OverlayChatLine[] {
  return chatPresence(lines, new Set(), options, now).visible;
}

export function chatPresence(lines: readonly OverlayChatLine[], previouslyShown: ReadonlySet<string>, options: OverlayChatOptions, now: number): { visible: OverlayChatLine[]; leaving: OverlayChatLine[] } {
  const fresh = options.lifetimeSeconds > 0 ? lines.filter(line => now - line.ts <= options.lifetimeSeconds * 1000) : lines;
  const visible = fresh.slice(-options.maxLines);
  const visibleIds = new Set(visible.map(line => line.id));
  const exitMotion = options.exitMotion || options.motion;
  const animateOut = exitMotion !== 'none' && options.fadeMs > 0 && options.lifetimeSeconds > 0;
  const leaving = animateOut
    ? lines.filter(line => !visibleIds.has(line.id) && previouslyShown.has(line.id) && now - line.ts > options.lifetimeSeconds * 1000)
    : [];
  return { visible, leaving };
}

export function twitchEmoteUrl(id: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/static/dark/1.0`;
}

export function segmentChat(text: string, twitchEmotes: readonly ChatEmoteRange[], names: Readonly<Record<string, string>>): ChatSegment[] {
  const covered = new Array<boolean>(text.length);
  const segments: ChatSegment[] = [];
  const ranges = [...twitchEmotes].filter(range => range.start >= 0 && range.end < text.length).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) segments.push(...segmentPlain(text.slice(cursor, range.start), names));
    const name = text.slice(range.start, range.end + 1);
    segments.push({ type: 'emote', name, url: twitchEmoteUrl(range.id) });
    for (let i = range.start; i <= range.end && i < covered.length; i += 1) covered[i] = true;
    cursor = range.end + 1;
  }
  if (cursor < text.length) segments.push(...segmentPlain(text.slice(cursor), names));
  return segments;
}

function segmentPlain(text: string, names: Readonly<Record<string, string>>): ChatSegment[] {
  if (!text) return [];
  const segments: ChatSegment[] = [];
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    const url = names[part];
    if (url && !/^\s+$/.test(part)) segments.push({ type: 'emote', name: part, url });
    else segments.push({ type: 'text', text: part });
  }
  return segments;
}

export function chatSearchParams(options: OverlayChatOptions): Record<string, string> {
  const chat = normalizeChat(options);
  return {
    chatEnabled: chat.enabled ? '1' : '0',
    chatBadges: chat.showBadges ? '1' : '0',
    chatTimestamps: chat.showTimestamps ? '1' : '0',
    chatNameColors: chat.showNameColors ? '1' : '0',
    chatBackground: chat.showBackground ? '1' : '0',
    chatEmotes: chat.showEmotes ? '1' : '0',
    chatOutline: chat.showOutline ? '1' : '0',
    chatReplies: chat.showReplies ? '1' : '0',
    chatMentions: chat.highlightMentions ? '1' : '0',
    chatStyle: chat.style,
    chatMotion: chat.motion,
    chatExitMotion: chat.exitMotion,
    chatFont: String(chat.fontSize),
    chatName: chat.nameColor,
    chatMessage: chat.messageColor,
    chatBg: chat.background,
    chatOpacity: String(chat.opacity),
    chatLines: String(chat.maxLines),
    chatLife: String(chat.lifetimeSeconds),
    chatFade: String(chat.fadeMs),
    chatCommands: chat.hideCommands ? '1' : '0',
    chatRole: chat.roleFilter,
    chatWords: chat.blockWords.join(','),
    chatUsers: chat.blockUsers.join(','),
    chatX: String(chat.x),
    chatY: String(chat.y),
    chatW: String(chat.width),
    chatH: String(chat.height)
  };
}

export function chatFromParams(params: URLSearchParams): OverlayChatOptions {
  const has = (key: string) => params.get(key) !== null;
  const flag = (key: string, fallback: boolean) => has(key) ? params.get(key) === '1' : fallback;
  const num = (key: string, fallback: number) => has(key) ? Number(params.get(key)) : fallback;
  return normalizeChat({
    enabled: flag('chatEnabled', DEFAULT_CHAT_OPTIONS.enabled),
    showBadges: flag('chatBadges', DEFAULT_CHAT_OPTIONS.showBadges),
    showTimestamps: flag('chatTimestamps', DEFAULT_CHAT_OPTIONS.showTimestamps),
    showNameColors: flag('chatNameColors', DEFAULT_CHAT_OPTIONS.showNameColors),
    showBackground: flag('chatBackground', DEFAULT_CHAT_OPTIONS.showBackground),
    showEmotes: flag('chatEmotes', DEFAULT_CHAT_OPTIONS.showEmotes),
    showOutline: flag('chatOutline', DEFAULT_CHAT_OPTIONS.showOutline),
    showReplies: flag('chatReplies', DEFAULT_CHAT_OPTIONS.showReplies),
    highlightMentions: flag('chatMentions', DEFAULT_CHAT_OPTIONS.highlightMentions),
    style: (params.get('chatStyle') as ChatStyle | null) || DEFAULT_CHAT_OPTIONS.style,
    motion: (params.get('chatMotion') as ChatMotion | null) || DEFAULT_CHAT_OPTIONS.motion,
    exitMotion: (params.get('chatExitMotion') as ChatMotion | null) || (params.get('chatMotion') as ChatMotion | null) || DEFAULT_CHAT_OPTIONS.exitMotion,
    fontSize: num('chatFont', DEFAULT_CHAT_OPTIONS.fontSize),
    nameColor: params.get('chatName') || DEFAULT_CHAT_OPTIONS.nameColor,
    messageColor: params.get('chatMessage') || DEFAULT_CHAT_OPTIONS.messageColor,
    background: params.get('chatBg') || DEFAULT_CHAT_OPTIONS.background,
    opacity: num('chatOpacity', DEFAULT_CHAT_OPTIONS.opacity),
    maxLines: num('chatLines', DEFAULT_CHAT_OPTIONS.maxLines),
    lifetimeSeconds: num('chatLife', DEFAULT_CHAT_OPTIONS.lifetimeSeconds),
    fadeMs: num('chatFade', DEFAULT_CHAT_OPTIONS.fadeMs),
    hideCommands: flag('chatCommands', DEFAULT_CHAT_OPTIONS.hideCommands),
    roleFilter: (params.get('chatRole') as ChatRoleFilter | null) || DEFAULT_CHAT_OPTIONS.roleFilter,
    blockWords: (params.get('chatWords') || '').split(','),
    blockUsers: (params.get('chatUsers') || '').split(','),
    x: num('chatX', DEFAULT_CHAT_OPTIONS.x),
    y: num('chatY', DEFAULT_CHAT_OPTIONS.y),
    width: num('chatW', DEFAULT_CHAT_OPTIONS.width),
    height: num('chatH', DEFAULT_CHAT_OPTIONS.height)
  });
}

/** Hide messages that start above the log so a resize never slices a line. The newest line stays visible. */
export function fitChatLines(log: HTMLElement): void {
  const lines = [...log.querySelectorAll<HTMLElement>(':scope > .overlay-chat-line')];
  for (const line of lines) {
    if (line.hidden) continue;
    if (line.offsetTop < -0.5) line.hidden = true;
    else break;
  }
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.hidden) continue;
    line.hidden = false;
    if (line.offsetTop < -0.5) {
      line.hidden = true;
      break;
    }
  }
  if (lines.length && lines.every(line => line.hidden)) lines[lines.length - 1].hidden = false;
}

export function sampleChatLine(partial: Partial<OverlayChatLine> & Pick<OverlayChatLine, 'id' | 'text'>): OverlayChatLine {
  return {
    userId: partial.userId || partial.id,
    login: partial.login || 'viewer',
    displayName: partial.displayName || 'Viewer',
    color: partial.color || '#a855f7',
    badge: partial.badge || 'viewer',
    emotes: partial.emotes || [],
    bits: partial.bits || 0,
    replyTo: partial.replyTo || '',
    replyText: partial.replyText || '',
    first: partial.first || false,
    ts: partial.ts || Date.now(),
    ...partial,
    badges: partial.badges || badgesForRole(partial.badge || 'viewer')
  };
}
