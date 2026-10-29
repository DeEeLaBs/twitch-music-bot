import { badgeFromIrc, parseIrcBadges, parseTwitchEmoteTag, type ChatClearEvent, type OverlayChatLine } from '../overlayChat.ts';

export interface ParsedPrivmsg {
  sender: string;
  message: string;
  tags: Record<string, string>;
}

export function isAuthenticationFailure(line: string): boolean {
  return line.includes('NOTICE * :Login authentication failed') || line.includes('Login unsuccessful');
}

function decodeTag(value: string): string {
  return value
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

export function parsePrivmsg(line: string): ParsedPrivmsg | null {
  const tags: Record<string, string> = {};
  let rest = line;
  if (line.startsWith('@')) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx <= 1) return null;
    for (const rawTag of line.slice(1, spaceIdx).split(';')) {
      const separator = rawTag.indexOf('=');
      const key = separator >= 0 ? rawTag.slice(0, separator) : rawTag;
      const value = separator >= 0 ? rawTag.slice(separator + 1) : '';
      if (key) tags[key] = decodeTag(value);
    }
    rest = line.slice(spaceIdx + 1);
  }

  const match = rest.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
  if (!match) return null;
  return { sender: match[1], message: match[2], tags };
}

export function chatLineFromPrivmsg(parsed: ParsedPrivmsg, channel: string): OverlayChatLine | null {
  const text = parsed.message.replace(/[\r\n\0]/g, '').slice(0, 500);
  if (!text) return null;
  const ts = Number(parsed.tags['tmi-sent-ts']);
  return {
    id: parsed.tags.id || `${parsed.tags['user-id'] || parsed.sender}-${Number.isFinite(ts) ? ts : Date.now()}`,
    userId: parsed.tags['user-id'] || parsed.sender.toLowerCase(),
    login: parsed.sender.toLowerCase(),
    displayName: parsed.tags['display-name'] || parsed.sender,
    color: parsed.tags.color || '',
    badge: badgeFromIrc(parsed.tags.badges || '', parsed.sender, channel),
    badges: parseIrcBadges(parsed.tags.badges || ''),
    text,
    emotes: parseTwitchEmoteTag(parsed.tags.emotes),
    bits: Math.max(0, Math.round(Number(parsed.tags.bits) || 0)),
    replyTo: (parsed.tags['reply-parent-display-name'] || '').slice(0, 40),
    replyText: (parsed.tags['reply-parent-msg-body'] || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    first: parsed.tags['first-msg'] === '1',
    ts: Number.isFinite(ts) ? ts : Date.now()
  };
}

export function parseClear(line: string): ChatClearEvent | null {
  const tags: Record<string, string> = {};
  let rest = line;
  if (line.startsWith('@')) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx <= 1) return null;
    for (const rawTag of line.slice(1, spaceIdx).split(';')) {
      const separator = rawTag.indexOf('=');
      const key = separator >= 0 ? rawTag.slice(0, separator) : rawTag;
      const value = separator >= 0 ? rawTag.slice(separator + 1) : '';
      if (key) tags[key] = value;
    }
    rest = line.slice(spaceIdx + 1);
  }
  const command = rest.match(/^:\S+ (CLEARCHAT|CLEARMSG) #\S+(?: :(.*))?$/);
  if (!command) return null;
  if (command[1] === 'CLEARMSG') return tags['target-msg-id'] ? { scope: 'message', messageId: tags['target-msg-id'] } : null;
  if (command[2]) return { scope: 'user', userId: tags['target-user-id'] || command[2].trim().toLowerCase() };
  return { scope: 'all' };
}
