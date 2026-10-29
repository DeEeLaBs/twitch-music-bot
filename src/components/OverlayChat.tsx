import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChatBadgeRow } from './ChatBadges.tsx';
import type { BadgeType } from '../types.ts';
import { playingEmoteUrl } from '../emoteSpam.ts';
import {
  acceptChatLine,
  applyChatClear,
  badgesForRole,
  chatPresence,
  fitChatLines,
  pushChatLine,
  sampleChatLine,
  segmentChat,
  type ChatClearEvent,
  type OverlayChatLine,
  type OverlayChatOptions
} from '../overlayChat.ts';

const ROLE_COLOR: Record<BadgeType, string> = {
  broadcaster: '#f97316',
  moderator: '#34d399',
  vip: '#e879f9',
  subscriber: '#a78bfa',
  viewer: ''
};

interface OverlayChatProps {
  options: OverlayChatOptions;
  token?: string;
  preview?: boolean;
  contained?: boolean;
  draggable?: boolean;
  fill?: boolean;
  onMove?: (position: { x: number; y: number }) => void;
}

export function OverlayChat({ options, token = '', preview = false, contained = false, draggable = false, fill = false, onMove }: OverlayChatProps) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const linesRef = useRef<OverlayChatLine[]>([]);
  const pendingRef = useRef<OverlayChatLine[]>([]);
  const namesRef = useRef<Record<string, string>>({});
  const frameRef = useRef(0);
  const exitTimerRef = useRef(0);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const exitsRef = useRef<Map<string, { line: OverlayChatLine; until: number }>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<OverlayChatLine[]>([]);
  const [exits, setExits] = useState<OverlayChatLine[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const publish = () => {
    const current = optionsRef.current;
    const now = Date.now();
    let next = linesRef.current;
    if (pendingRef.current.length) {
      for (const line of pendingRef.current) {
        if (!acceptChatLine(line, current)) continue;
        next = pushChatLine(next, line);
      }
      pendingRef.current = [];
      linesRef.current = next;
    }
    const presence = chatPresence(next, shownIdsRef.current, current, now);
    const liveIds = new Set(next.map(line => line.id));
    const exits = exitsRef.current;
    for (const line of presence.leaving) {
      if (!exits.has(line.id)) exits.set(line.id, { line, until: now + current.fadeMs });
    }
    let soonest = 0;
    for (const [id, exit] of exits) {
      if (!liveIds.has(id) || presence.visible.some(line => line.id === id) || exit.until <= now) exits.delete(id);
      else if (!soonest || exit.until < soonest) soonest = exit.until;
    }
    shownIdsRef.current = new Set(presence.visible.map(line => line.id));
    setLines(presence.visible);
    setExits([...exits.values()].map(exit => exit.line));
    if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    if (soonest) exitTimerRef.current = window.setTimeout(publish, Math.max(16, soonest - Date.now() + 16));
  };

  useEffect(() => {
    const paint = () => {
      frameRef.current = 0;
      publish();
    };
    const schedule = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(paint);
    };
    const onSample = (event: Event) => {
      const line = (event as CustomEvent<OverlayChatLine>).detail;
      if (!line?.id || !line.text) return;
      pendingRef.current.push(line);
      schedule();
    };
    window.addEventListener('overlay:chat-sample', onSample);
    const sweep = window.setInterval(schedule, 1000);
    return () => {
      window.removeEventListener('overlay:chat-sample', onSample);
      window.clearInterval(sweep);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!options.enabled || !token) return undefined;
    let stopped = false;
    let socket: WebSocket | null = null;
    let timer = 0;
    let delay = 1000;
    const schedule = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        publish();
      });
    };
    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.onopen = () => {
        delay = 1000;
        socket?.send(JSON.stringify({ type: 'subscribe_chat', token }));
      };
      socket.onmessage = (event) => {
        let payload: { type?: string; data?: unknown };
        try { payload = JSON.parse(String(event.data)); } catch { return; }
        if (payload.type === 'chat' && payload.data) {
          pendingRef.current.push(payload.data as OverlayChatLine);
          schedule();
        } else if (payload.type === 'chat_replay' && Array.isArray(payload.data)) {
          linesRef.current = [];
          pendingRef.current = payload.data as OverlayChatLine[];
          schedule();
        } else if (payload.type === 'chat_clear' && payload.data) {
          const clear = payload.data as ChatClearEvent;
          linesRef.current = applyChatClear(linesRef.current, clear);
          pendingRef.current = applyChatClear(pendingRef.current, clear);
          schedule();
        } else if (payload.type === 'chat_emotes' && payload.data && typeof payload.data === 'object') {
          namesRef.current = payload.data as Record<string, string>;
          setNames(namesRef.current);
        }
      };
      socket.onclose = () => {
        if (!stopped) timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10000);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [options.enabled, token]);

  useLayoutEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const fit = () => fitChatLines(log);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(log);
    return () => observer.disconnect();
  }, [lines, exits, options.fontSize, options.style, options.showBadges, options.showReplies, options.showTimestamps, preview]);

  if (!options.enabled) return null;
  const live = lines.length || exits.length ? lines : preview ? PREVIEW_LINES : [];
  const emoteNames = live === PREVIEW_LINES ? { ...SAMPLE_EMOTES, ...names } : names;
  const shown = [
    ...exits.filter(line => !live.some(item => item.id === line.id)).map(line => ({ line, out: true })),
    ...live.map(line => ({ line, out: false }))
  ];
  const background = options.showBackground ? `rgba(${hexToRgb(options.background)},${options.opacity / 100})` : undefined;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || !onMove) return;
    const parent = rootRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const bounds = parent.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = options.x;
    const originY = options.y;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.min(100, Math.max(0, originX + ((ev.clientX - startX) / bounds.width) * 100));
      const y = Math.min(100, Math.max(0, originY + ((ev.clientY - startY) / bounds.height) * 100));
      onMove({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <div
      ref={rootRef}
      className={`overlay-chat is-${options.style} is-motion-${options.motion} is-out-${options.exitMotion || options.motion} ${options.fadeMs === 0 ? 'is-still' : ''} ${LIGHT_STYLES.has(options.style) ? 'is-light' : ''} ${options.showOutline ? 'has-outline' : ''} ${options.showBackground ? 'has-user-bg' : ''} ${contained ? 'is-contained' : ''} ${draggable ? 'is-draggable' : ''} ${fill ? 'is-fill' : ''}`}
      data-overlay-chat="true"
      style={{
        left: fill ? 0 : `${options.x}%`,
        top: fill ? 0 : `${options.y}%`,
        width: fill ? '100%' : `${options.width}%`,
        height: fill ? '100%' : `${options.height}%`,
        fontSize: `${options.fontSize}px`,
        fontFamily: options.fontFamily || undefined,
        color: options.messageColor,
        background,
        ['--chat-fade' as string]: `${options.fadeMs}ms`
      }}
      onPointerDown={onPointerDown}
      role="log"
      aria-label="Twitch chat"
    >
      <div ref={logRef} className="overlay-chat-log">
      {shown.map(({ line, out }) => {
        const nameColor = options.showNameColors ? (line.color || ROLE_COLOR[line.badge] || options.nameColor) : options.nameColor;
        const badges = options.showBadges ? (line.badges?.length ? line.badges : badgesForRole(line.badge)) : [];
        const time = options.showTimestamps ? new Date(line.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const cheered = line.bits > 0;
        const nametag = options.style === 'nametag';
        const text = <span className="overlay-chat-text">{segmentChat(line.text, line.emotes, emoteNames).map((segment, index) => (
          segment.type === 'emote' && options.showEmotes
            ? <ChatEmote key={`${line.id}-${index}`} name={segment.name} url={segment.url} />
            : <React.Fragment key={`${line.id}-${index}`}>{segment.type === 'emote' ? segment.name : paintMentions(segment.text, options.highlightMentions)}</React.Fragment>
        ))}</span>;
        const reply = options.showReplies && line.replyTo ? <span className="overlay-chat-reply">↩ {line.replyTo}{line.replyText ? `: ${line.replyText}` : ''}</span> : null;
        const identity = <>
          {time && <span className="overlay-chat-time">{time}</span>}
          <ChatBadgeRow badges={badges} />
          {line.first && <span className="overlay-chat-first">1st</span>}
          {cheered && <span className="overlay-chat-bits">{line.bits}</span>}
          <span className="overlay-chat-name" style={{ color: nametag ? tagInk(nameColor) : nameColor }}>{line.displayName}</span>
        </>;
        return (
          <p key={line.id} className={`overlay-chat-line ${out ? 'is-out' : ''} ${line.first ? 'is-first' : ''} ${cheered ? 'is-cheer' : ''}`} style={nametag ? { ['--tag' as string]: nameColor } : undefined}>
            {nametag ? <><span className="overlay-chat-tag">{identity}</span><span className="overlay-chat-body">{reply}{text}</span></> : <>{reply}{identity}{text}</>}
          </p>
        );
      })}
      </div>
    </div>
  );
}

const SAMPLE_EMOTES: Record<string, string> = {
  PETPET: 'https://cdn.7tv.app/emote/01FSNK0GP000038GDBZ91HT6SQ/2x.gif'
};

const stillEmotes = new Set<string>();

function ChatEmote({ name, url }: { name: string; url: string }) {
  const moving = playingEmoteUrl(url);
  const [src, setSrc] = useState(moving && !stillEmotes.has(url) ? moving : url);
  useEffect(() => {
    setSrc(moving && !stillEmotes.has(url) ? moving : url);
  }, [url, moving]);
  return (
    <img
      src={src}
      alt={name}
      title={name}
      decoding="async"
      onError={() => {
        if (src === url) return;
        stillEmotes.add(url);
        setSrc(url);
      }}
    />
  );
}

const LIGHT_STYLES = new Set(['bevel', 'handheld', 'y2k', 'receipt', 'brutal', 'comic', 'note', 'sakura']);

function tagInk(color: string): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(part => part + part).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#fff';
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 160 ? '#18181b' : '#fff';
}

function paintMentions(text: string, highlight: boolean): React.ReactNode {
  if (!highlight || !text.includes('@')) return text;
  const parts = text.split(/(@[a-z0-9_]{2,25})/gi);
  return parts.map((part, index) => /^@[a-z0-9_]{2,25}$/i.test(part) ? <mark key={index}>{part}</mark> : part);
}

function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

const PREVIEW_LINES: OverlayChatLine[] = [
  sampleChatLine({ id: 'preview-1', text: '@streamer this chat sits on the overlay. PETPET', displayName: 'OverlayFan', login: 'overlayfan', badge: 'vip', badges: [{ set: 'vip', version: '1' }, { set: 'subscriber', version: '12' }, { set: 'premium', version: '1' }], color: '#a855f7', ts: Date.now() }),
  sampleChatLine({ id: 'preview-2', text: 'Commands that start with ! stay hidden.', displayName: 'Mod', login: 'mod', badge: 'moderator', color: '#34d399', replyTo: 'OverlayFan', replyText: 'this chat sits on the overlay.', ts: Date.now() }),
  sampleChatLine({ id: 'preview-3', text: 'Raid-safe: one paint per frame.', displayName: 'Streamer', login: 'streamer', badge: 'broadcaster', color: '#f97316', ts: Date.now() }),
  sampleChatLine({ id: 'preview-4', text: 'First message, with bits.', displayName: 'NewViewer', login: 'newviewer', badge: 'viewer', bits: 100, first: true, badges: [{ set: 'bits', version: '100' }], ts: Date.now() })
];
