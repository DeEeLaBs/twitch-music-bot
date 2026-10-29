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
