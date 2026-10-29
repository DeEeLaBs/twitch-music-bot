import { autoplayIsOn, requestsAreOpen } from './commands.ts';
import type { BotState } from './state.ts';

export interface RenderContext {
  online: boolean;
  /** A destructive key was pressed once and waits for confirmation. */
  armed?: boolean;
  /** The key was just pressed successfully: tint it green for a moment. */
  flash?: boolean;
  /** Album art as a data URI (already downloaded), for the Now Playing key. */
  art?: string | null;
}

const SIZE = 144;
const BG = '#18181b';
const PURPLE = '#a855f7';
const GREEN = '#22c55e';
const RED = '#ef4444';
const AMBER = '#f59e0b';
const GREY = '#71717a';
const WHITE = '#fafafa';

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch] as string);
}

/** Greedy word wrap with hard breaks for very long words; the last line is ellipsized when text is cut off. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const push = () => { if (line) { lines.push(line); line = ''; } };
  for (let word of words) {
    while (word.length > maxChars) {
      if (line) push();
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!line) line = word;
    else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
    else { push(); line = word; }
  }
  push();
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + '…';
    return kept;
  }
  return lines;
}

function text(content: string, x: number, y: number, size: number, fill = WHITE, weight = 600, anchor = 'middle'): string {
  return `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
}

/** Icons are drawn in a 48x48 box. */
const ICONS: Record<string, (color: string) => string> = {
  play: c => `<path d="M14 8v32l28-16z" fill="${c}"/>`,
  pause: c => `<rect x="11" y="8" width="9" height="32" rx="2" fill="${c}"/><rect x="28" y="8" width="9" height="32" rx="2" fill="${c}"/>`,
  next: c => `<path d="M8 8v32l24-16z" fill="${c}"/><rect x="34" y="8" width="7" height="32" rx="2" fill="${c}"/>`,
  previous: c => `<path d="M40 8v32L16 24z" fill="${c}"/><rect x="7" y="8" width="7" height="32" rx="2" fill="${c}"/>`,
  speaker: c => `<path d="M4 18h9l11-9v30l-11-9H4z" fill="${c}"/>`,
  plus: c => `<path d="M34 24h12M40 18v12" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`,
  minus: c => `<path d="M34 24h12" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`,
  list: c => `<path d="M6 12h30M6 24h30M6 36h18" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
  startQueue: c => `<path d="M6 12h22M6 24h22M6 36h14" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M32 22v20l14-10z" fill="${c}"/>`,
  alert: c => `<circle cx="24" cy="24" r="19" fill="none" stroke="${c}" stroke-width="4"/><path d="M24 13v14" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="34" r="2.6" fill="${c}"/>`,
  remove: c => `<path d="M6 12h22M6 24h14M6 36h22" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M30 24l12 12M42 24L30 36" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`,
  trash: c => `<path d="M10 12h28M19 12V7h10v5M13 12l2 29h18l2-29" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  block: c => `<circle cx="24" cy="24" r="18" fill="none" stroke="${c}" stroke-width="4.5"/><path d="M11 37L37 11" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`,
  note: c => `<path d="M18 36V10l22-5v26" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/><circle cx="12" cy="36" r="6" fill="${c}"/><circle cx="34" cy="31" r="6" fill="${c}"/>`
};

function iconAt(name: string, color: string, cx: number, cy: number, scale = 1.3, opacity = 1): string {
  const draw = ICONS[name] || ICONS.note;
  const half = 24 * scale;
  return `<g transform="translate(${cx - half} ${cy - half}) scale(${scale})" opacity="${opacity}">${draw(color)}</g>`;
}

function toggleGraphic(on: boolean, accent: string): string {
  const knobX = on ? 100 : 44;
  return `<rect x="30" y="34" width="84" height="44" rx="22" fill="${on ? accent : '#3f3f46'}"/><circle cx="${knobX}" cy="56" r="17" fill="${WHITE}"/>`;
}

function frame(inner: string, background = BG): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="14" fill="${background}"/>${inner}</svg>`;
}

interface Look { icon?: string; label: string; accent: string; sub?: string; custom?: string }

function look(id: string, state: BotState, ctx: RenderContext): Look {
  const { playback, queue, config } = state;
  switch (id) {
    case 'play-pause': return playback.isPlaying
      ? { icon: 'pause', label: 'Pause', accent: PURPLE }
      : { icon: 'play', label: 'Play', accent: GREEN };
    case 'next': return { icon: 'next', label: 'Next', accent: PURPLE };
    case 'previous': return { icon: 'previous', label: 'Previous', accent: PURPLE };
    case 'volume-up': return { icon: 'speaker', label: `Vol ${Math.round(playback.volume)}%`, accent: PURPLE, custom: ICONS.plus(PURPLE) };
    case 'volume-down': return { icon: 'speaker', label: `Vol ${Math.round(playback.volume)}%`, accent: PURPLE, custom: ICONS.minus(PURPLE) };
    case 'start-queue': return { icon: 'startQueue', label: 'Start queue', accent: GREEN };
    case 'clear-error': return playback.error
      ? { icon: 'alert', label: 'Clear error', accent: RED }
      : { icon: 'alert', label: 'No error', accent: GREY };
    case 'veto-next': return queue.length
      ? { icon: 'remove', label: 'Remove next', accent: AMBER }
      : { icon: 'remove', label: 'Queue empty', accent: GREY };
    case 'clear-queue': return ctx.armed
      ? { icon: 'trash', label: 'Press again', accent: RED }
      : { icon: 'trash', label: `Clear (${queue.length})`, accent: queue.length ? AMBER : GREY };
    case 'block-requester': return ctx.armed
      ? { icon: 'block', label: 'Press again', accent: RED }
      : { icon: 'block', label: 'Block requester', accent: playback.currentSong?.requester ? AMBER : GREY };
    case 'queue-count': return { label: queue.length === 1 ? 'song queued' : 'songs queued', accent: queue.length ? PURPLE : GREY, custom: text(String(queue.length), 72, 84, 62, WHITE, 700) };
    case 'toggle-requests': {
      const open = requestsAreOpen(state);
      return { label: 'Requests', sub: open ? 'OPEN' : 'CLOSED', accent: open ? GREEN : RED, custom: toggleGraphic(open, GREEN) };
    }
    case 'toggle-autoplay': {
      const on = autoplayIsOn(state);
      return { label: 'Autoplay', sub: on ? 'ON' : 'OFF', accent: on ? GREEN : GREY, custom: toggleGraphic(on, GREEN) };
    }
    case 'toggle-channelpoints': {
      const on = Boolean(config.channelPointsEnabled);
      return { label: 'Channel Pts', sub: on ? 'ON' : 'OFF', accent: on ? PURPLE : GREY, custom: toggleGraphic(on, PURPLE) };
    }
    default: return { icon: 'note', label: id, accent: PURPLE };
  }
}

function renderNowPlaying(state: BotState, ctx: RenderContext): string {
  const song = state.playback.currentSong;
  const dim = ctx.online ? 1 : 0.4;
  if (!song) {
    return frame(`${iconAt('note', GREY, 72, 56, 1.2, dim)}${text(ctx.online ? 'Nothing playing' : 'Bot offline', 72, 116, 15, ctx.online ? GREY : RED)}`);
  }
  const title = wrapText(song.title, 13, 2);
  const artist = wrapText(song.artist || '', 16, 1)[0] || '';
  const titleY = artist ? 96 - (title.length - 1) * 4 : 108 - (title.length - 1) * 4;
  const lines = title.map((line, index) => text(line, 72, titleY + index * 17, 16, WHITE, 700)).join('');
  const background = ctx.art
    ? `<image href="${ctx.art}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice" opacity="${dim}"/><rect width="${SIZE}" height="${SIZE}" fill="#000" opacity="0.55"/>`
    : `${iconAt('note', '#3f3f46', 72, 40, 1.4, dim)}`;
  const badge = state.playback.isPlaying
    ? `<path d="M10 10v16l14-8z" fill="${GREEN}"/>`
    : `<rect x="10" y="10" width="5" height="16" fill="${AMBER}"/><rect x="19" y="10" width="5" height="16" fill="${AMBER}"/>`;
  return frame(`${background}${badge}${lines}${artist ? text(artist, 72, 126, 13, '#d4d4d8', 500) : ''}${ctx.online ? '' : `<rect x="0" y="0" width="${SIZE}" height="22" fill="${RED}"/>${text('Bot offline', 72, 16, 13, WHITE, 700)}`}`);
}

/** Renders one key as an SVG document. */
/** Lays a translucent green over a finished key image (works for every key, including album art). */
function withFlash(svg: string, flash: boolean | undefined): string {
  if (!flash) return svg;
  return svg.replace(/<\/svg>$/, `<rect id="flash" width="${SIZE}" height="${SIZE}" rx="14" fill="${GREEN}" opacity="0.6"/></svg>`);
}

export function renderKey(id: string, state: BotState, ctx: RenderContext): string {
  return withFlash(renderKeyImage(id, state, ctx), ctx.flash);
}

function renderKeyImage(id: string, state: BotState, ctx: RenderContext): string {
  if (id.startsWith('timer-')) {
    const [, profile, action] = id.split('-');
    const label = ({ start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset', plus: '+1 min', minus: '-1 min' })[action] || action;
    return frame(`${iconAt(action === 'pause' ? 'pause' : 'play', PURPLE, 72, 48, 1, ctx.online ? 1 : 0.4)}${text(ctx.armed ? 'Press again' : label, 72, 100, 18)}${text(profile === 'subathon' ? 'Subathon' : 'Streamstart', 72, 124, 13, GREY)}`);
  }
  if (id === 'now-playing') return renderNowPlaying(state, ctx);
  const view = look(id, state, ctx);
  const online = ctx.online;
  const dim = online ? 1 : 0.35;
  const accent = online ? view.accent : GREY;
  const background = ctx.armed && online ? '#3b0d0d' : BG;
  const isToggle = view.sub !== undefined;
  let art = '';
  if (view.custom && !isToggle) {
    art = id === 'volume-up' || id === 'volume-down'
      ? `${iconAt('speaker', accent, 71, 56, 1.2, dim)}<g transform="translate(41 27) scale(1.2)" opacity="${dim}">${view.custom}</g>`
      : `<g opacity="${dim}">${view.custom}</g>`;
  } else if (view.custom) {
    art = `<g opacity="${dim}">${view.custom}</g>`;
  } else if (view.icon) {
    art = iconAt(view.icon, accent, 72, 56, 1.3, dim);
  }
  const subLine = isToggle ? text(view.sub as string, 72, 108, 22, accent, 800) : '';
  const labelY = isToggle ? 132 : 126;
  const label = online ? view.label : 'Bot offline';
  const labelColor = online ? WHITE : RED;
  return frame(`${art}${subLine}${text(label, 72, labelY, isToggle ? 15 : 17, isToggle ? '#a1a1aa' : labelColor, 700)}`, background);
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

/** Text for a dial's touch-strip feedback (Stream Deck +). */
export function dialFeedback(state: BotState, online: boolean): { title: string; value: string; indicator: number } {
  const volume = Math.round(state.playback.volume);
  return { title: online ? 'Volume' : 'Bot offline', value: online ? `${volume}%` : '–', indicator: online ? volume : 0 };
}

/** Square brand icon (purple tile with a music note), used for the plugin and its category. */
export function renderBrandIcon(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="26" fill="#6d28d9"/>${iconAt('note', WHITE, 72, 72, 2.2)}</svg>`;
}
