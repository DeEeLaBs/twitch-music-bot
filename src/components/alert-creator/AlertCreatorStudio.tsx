import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Clapperboard, Code2, Image, Pause, Pencil, Play, RotateCcw, Sparkles, Square, Type, Volume2, Wand2 } from 'lucide-react';
import { apiFetch } from '../../apiClient.ts';
import {
  ALERT_FX, ALERT_ICONS, ANCHOR_POINT, CREATOR_ANCHORS, CREATOR_EASES, CREATOR_EVENTS, CREATOR_FITS, CREATOR_MESSAGES, CREATOR_MOTIONS, CREATOR_RANGES, CREATOR_TIERS,
  CREATOR_SHAPES, CREATOR_TIMELINE_MAX_MS, CREATOR_TIMELINE_MIN_MS,
  ALERT_SOUND_MAX_BYTES, alertFrame, alertFrameSize, alertSoundType, applyAlertFrame, applyAlertFx, assignCreatorShape, blankClip, creatorClipFor, dataUrlWithType, emptyCreatorLayer, mediaFileName, moveCreatorLayer, placeCreatorShape, safeMediaUrl, templateLayers,
  type AlertBoxConfig, type AlertFrame, type AlertFx, type AlertIcon, type CreatorClip, type CreatorEase, type CreatorEvent, type CreatorFit, type CreatorLayer, type CreatorLayerKind, type CreatorMotion, type CreatorRange, type CreatorShape
} from '../../alertBox.ts';
import { mergeOverlayOptions, type OverlayOptions } from '../../overlayOptions.ts';
import type { AlertKind, AlertTier, StreamAlert } from '../../streamAlerts.ts';
import { AlertFontField } from './AlertFontField.tsx';
import { CreatorStage, pauseCreatorTimeline, playCreatorTimeline } from './CreatorStage.tsx';

const EVENT_LABELS: Record<CreatorEvent, [string, string]> = {
  follow: ['Follow', 'Follow'],
  subscription: ['Abo', 'Subscription'],
  resub: ['Resub', 'Resub'],
  gift: ['Geschenk', 'Gift'],
  cheer: ['Cheer', 'Cheer'],
  raid: ['Raid', 'Raid'],
  tip: ['Spende', 'Donation'],
  host: ['Host', 'Host']
};
const KIND_LABELS: Record<CreatorLayerKind, [string, string]> = {
  text: ['Text', 'Text'], image: ['Bild', 'Image'], sound: ['Ton', 'Sound'], video: ['Video', 'Video'], shape: ['Form', 'Shape']
};
const SHAPE_LABELS: Record<CreatorShape, [string, string]> = {
  rectangle: ['Rechteck', 'Rectangle'],
  rounded: ['Abgerundetes Rechteck', 'Rounded rectangle'],
  ellipse: ['Ellipse', 'Ellipse'],
  line: ['Linie', 'Line']
};
const MOTION_IN: Record<CreatorMotion, [string, string]> = {
  none: ['Keine', 'None'], fade: ['Einblenden', 'Fade'],
  'slide-bottom': ['Von unten', 'From bottom'], 'slide-top': ['Von oben', 'From top'],
  'slide-left': ['Von links', 'From left'], 'slide-right': ['Von rechts', 'From right'],
  pop: ['Aufploppen', 'Pop'], 'flip-x': ['Kippen horizontal', 'Flip horizontal'], 'flip-y': ['Kippen vertikal', 'Flip vertical']
};
const MOTION_OUT: Record<CreatorMotion, [string, string]> = {
  ...MOTION_IN,
  fade: ['Ausblenden', 'Fade out'],
  'slide-bottom': ['Nach unten', 'To bottom'], 'slide-top': ['Nach oben', 'To top'],
  'slide-left': ['Nach links', 'To left'], 'slide-right': ['Nach rechts', 'To right'],
  pop: ['Wegploppen', 'Pop out'], 'flip-x': ['Wegkippen horizontal', 'Flip out horizontal'], 'flip-y': ['Wegkippen vertikal', 'Flip out vertical']
};
const RANGE_LABELS: Record<CreatorRange, [string, string]> = {
  'to-infinite': ['Bis unendlich', 'To infinite'], between: ['Zwischen', 'Between'], exactly: ['Genau', 'Exactly'], highest: ['Höchster', 'Highest']
};
const EASE_LABELS: Record<CreatorEase, string> = {
  none: 'none', linear: 'linear', 'ease-in': 'ease In', 'ease-out': 'ease Out', 'ease-in-out': 'ease In Out',
  elastic: 'Elastic', swing: 'Swing In and Out', 'swing-in': 'Swing In', 'swing-out': 'Swing Out', bounce: 'Bounce'
};
/** Placeholders alertPieces substitutes. Insert the token only; leave any space around it in the template. */
const TEXT_TOKENS = ['name', 'user', 'amount', 'currency', 'months', 'tier', 'viewers', 'message'] as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="suite-field"><span>{label}</span>{children}</label>;
}

function Axis({ label, axes }: { label: string; axes: { name: string; suffix: string; value: number; onChange: (value: number) => void }[] }) {
  return (
    <div className="suite-axes">
      <span>{label}</span>
      {axes.map(axis => (
        <label key={axis.name}>
          {axis.name}
          <input inputMode="numeric" value={axis.value} onChange={node => axis.onChange(Number(node.target.value) || 0)} />
          <i>{axis.suffix}</i>
        </label>
      ))}
    </div>
  );
}

const FRAME_MS = 1000 / 30;

function readFileDuration(file: File) {
  const url = URL.createObjectURL(file);
  const named = file.name.toLowerCase();
  const audio = file.type.startsWith('audio/') || named.endsWith('.mp3') || named.endsWith('.wav') || named.endsWith('.ogg') || named.endsWith('.m4a');
  const element = document.createElement(audio ? 'audio' : 'video');
  element.preload = 'metadata';
  return new Promise<number>(resolve => {
    const finish = (value: number) => {
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    element.onloadedmetadata = () => finish(Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : 0);
    element.onerror = () => finish(0);
    element.src = url;
  });
}

function mediaLengthMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 200) return 0;
  return Math.min(CREATOR_TIMELINE_MAX_MS, Math.round(ms));
}

function frameTime(ms: number, duration: number) {
  const frame = Math.round(Math.min(duration, Math.max(0, ms)) / FRAME_MS);
  return Math.min(duration, Math.max(0, Math.round(frame * FRAME_MS)));
}

const NUDGE_PX = 1;
const NUDGE_SHIFT_PX = 10;
/** Half the layer stays on the stage, and it cannot stick out by more than half the stage. */
const NUDGE_OUTSIDE_PERCENT = 50;

function roundLayerPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function clampLayerOrigin(x: number, y: number, width: number, height: number) {
  const minX = Math.max(-NUDGE_OUTSIDE_PERCENT, -width / 2);
  const maxX = Math.min(100 + NUDGE_OUTSIDE_PERCENT - width, 100 - width / 2);
  const minY = Math.max(-NUDGE_OUTSIDE_PERCENT, -height / 2);
  const maxY = Math.min(100 + NUDGE_OUTSIDE_PERCENT - height, 100 - height / 2);
  return {
    x: roundLayerPercent(Math.min(Math.max(minX, maxX), Math.max(minX, x))),
    y: roundLayerPercent(Math.min(Math.max(minY, maxY), Math.max(minY, y)))
  };
}

const MIN_LAYER_MS = 200;

/** Right edge moves the end. Left edge moves the start and keeps the end fixed. */
function resizeLayerSpan(edge: 'start' | 'end', originStart: number, originLength: number, deltaMs: number, duration: number) {
  if (edge === 'end') {
    const start = Math.max(0, Math.min(originStart, Math.max(0, duration - MIN_LAYER_MS)));
    const end = Math.min(duration, Math.max(start + MIN_LAYER_MS, Math.round(start + originLength + deltaMs)));
    return { startMs: start, lengthMs: end - start };
  }
  const fixedEnd = Math.min(duration, originStart + originLength);
  if (fixedEnd < MIN_LAYER_MS) return { startMs: 0, lengthMs: Math.min(duration, MIN_LAYER_MS) };
  const start = Math.max(0, Math.min(fixedEnd - MIN_LAYER_MS, Math.round(originStart + deltaMs)));
  return { startMs: start, lengthMs: fixedEnd - start };
}

/** Body drag slides the bar. Length stays fixed; both ends move together. */
function moveLayerSpan(originStart: number, originLength: number, deltaMs: number, duration: number) {
  const length = Math.min(Math.max(0, originLength), Math.max(0, duration));
  const start = Math.max(0, Math.min(Math.max(0, duration - length), Math.round(originStart + deltaMs)));
  return { startMs: start, lengthMs: length };
}

const ALIGN_PX = 6;

/** Snap radius for timeline bars: one frame or ALIGN_PX, whichever is wider in time. */
function alignThresholdMs(laneWidthPx: number, durationMs: number) {
  const pxMs = laneWidthPx > 0 ? (ALIGN_PX / laneWidthPx) * durationMs : 0;
  return Math.max(FRAME_MS, pxMs);
}

function closestTime(time: number, marks: number[], limit: number) {
  let best: { at: number; gap: number } | null = null;
  for (const mark of marks) {
    const gap = Math.abs(mark - time);
    if (gap > limit) continue;
    if (!best || gap < best.gap) best = { at: mark, gap };
  }
  return best;
}

/**
 * Pull a dragged or resized bar onto a neighbor edge, and match length within one frame.
 * The guide is the timeline lane line, not the canvas center guide.
 */
function snapAlignedSpan(
  mode: 'move' | 'start' | 'end',
  startMs: number,
  lengthMs: number,
  others: { startMs: number; lengthMs: number }[],
  laneWidthPx: number,
  durationMs: number
) {
  const threshold = alignThresholdMs(laneWidthPx, durationMs);
  const edges: number[] = [];
  const lengths: number[] = [];
  for (const other of others) {
    edges.push(Math.min(durationMs, Math.max(0, other.startMs)));
    edges.push(Math.min(durationMs, Math.max(0, other.startMs + other.lengthMs)));
    lengths.push(other.lengthMs);
  }
  let start = startMs;
  let length = lengthMs;
  if (mode === 'move') {
    const startHit = closestTime(start, edges, threshold);
    const endHit = closestTime(start + length, edges, threshold);
    if (startHit && (!endHit || startHit.gap <= endHit.gap)) start = startHit.at;
    else if (endHit) start = endHit.at - length;
    const moved = moveLayerSpan(start, length, 0, durationMs);
    start = moved.startMs;
    length = moved.lengthMs;
  } else if (mode === 'end') {
    const endHit = closestTime(start + length, edges, threshold);
    if (endHit && endHit.at >= start + MIN_LAYER_MS && endHit.at <= durationMs) length = endHit.at - start;
    else {
      const lengthHit = closestTime(length, lengths, FRAME_MS);
      if (lengthHit && lengthHit.at >= MIN_LAYER_MS && start + lengthHit.at <= durationMs) length = lengthHit.at;
    }
    const resized = resizeLayerSpan('end', start, length, 0, durationMs);
    start = resized.startMs;
    length = resized.lengthMs;
  } else {
    const end = start + length;
    const startHit = closestTime(start, edges, threshold);
    if (startHit && startHit.at >= 0 && startHit.at <= end - MIN_LAYER_MS) {
      start = startHit.at;
      length = end - start;
    } else {
      const lengthHit = closestTime(length, lengths, FRAME_MS);
      if (lengthHit && lengthHit.at >= MIN_LAYER_MS && end - lengthHit.at >= 0) {
        start = end - lengthHit.at;
        length = lengthHit.at;
      }
    }
    const resized = resizeLayerSpan('start', start, length, 0, durationMs);
    start = resized.startMs;
    length = resized.lengthMs;
  }
  const times: number[] = [];
  for (const time of [start, start + length]) {
    if (!edges.some(edge => Math.abs(edge - time) <= 1)) continue;
    if (times.some(existing => Math.abs(existing - time) <= 1)) continue;
    times.push(time);
  }
  const sameLength = lengths.some(value => Math.abs(value - length) <= FRAME_MS);
  return { startMs: start, lengthMs: length, times, sameLength };
}

function clock(ms: number) {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(safe % 1000).padStart(3, '0')}`;
}

const RAIL: { kind: CreatorLayerKind; icon: typeof Type; label: [string, string] }[] = [
  { kind: 'image', icon: Image, label: ['Bild', 'Image'] },
  { kind: 'text', icon: Type, label: ['Text', 'Text'] },
  { kind: 'sound', icon: Volume2, label: ['Ton', 'Sound'] },
  { kind: 'video', icon: Clapperboard, label: ['Video', 'Video'] },
  { kind: 'shape', icon: Square, label: ['Form', 'Shape'] }
];

function sampleFor(event: CreatorEvent, amount: number, withMessage: boolean, tier: AlertTier | ''): StreamAlert {
  return {
    id: `sim-${event}`,
    kind: event as AlertKind,
    user: 'Viewer',
    amount,
    message: withMessage ? 'Hello' : '',
    months: event === 'resub' ? Math.max(1, amount) : event === 'subscription' ? 1 : 0,
    tier,
    currency: event === 'tip' ? 'EUR' : '',
    viewers: event === 'raid' || event === 'host' ? amount : 0,
    createdAt: Date.now()
  };
}

export function AlertCreatorStudio({ language }: { language: 'de' | 'en' }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const [options, setOptions] = useState<OverlayOptions | null>(null);
  const optionsRef = useRef<OverlayOptions | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ready = useRef(false);
  const [event, setEvent] = useState<CreatorEvent>('cheer');
  const [clipId, setClipId] = useState('');
  const [selected, setSelected] = useState('');
  const [playhead, setPlayhead] = useState(0);
  const [alignGuide, setAlignGuide] = useState<{ layerId: string; times: number[]; sameLength: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [amount, setAmount] = useState(100);
  const [withMessage, setWithMessage] = useState(true);
  const [replayToken, setReplayToken] = useState(0);
  const [copyTo, setCopyTo] = useState<CreatorEvent>('follow');
  const [saved, setSaved] = useState(true);
  const [showStatus, setShowStatus] = useState(true);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [obsCopied, setObsCopied] = useState(false);
  const [overlayToken, setOverlayToken] = useState('');
  const [variationMenu, setVariationMenu] = useState<CreatorEvent | ''>('');
  const [uploadNote, setUploadNote] = useState('');
  const [tool, setTool] = useState<'' | 'icons' | 'fx' | 'code' | 'shapes'>('');
  const [starterTab, setStarterTab] = useState<'scratch' | 'template'>('scratch');
  const [wideTimeline, setWideTimeline] = useState(() => {
    try { return localStorage.getItem('alert-creator-layout') === 'wide'; } catch { return false; }
  });
  const [clipboard, setClipboard] = useState<{ coords?: Pick<CreatorLayer, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'anchorX' | 'anchorY' | 'translateX' | 'translateY' | 'translateZ' | 'skewX' | 'skewY' | 'rotateX' | 'rotateY' | 'opacity'>; anim?: Pick<CreatorLayer, 'intro' | 'outro' | 'motion' | 'keyframes'> }>({});

  useEffect(() => {
    if (!variationMenu) return undefined;
    const close = (pointer: PointerEvent) => {
      const target = pointer.target;
      if (target instanceof Element && target.closest('.suite-event')) return;
      setVariationMenu('');
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [variationMenu]);

  useEffect(() => {
    if (!simOpen && !obsOpen) return undefined;
    const close = (pointer: PointerEvent) => {
      const target = pointer.target;
      if (target instanceof Element && target.closest('.suite-sim-wrap')) return;
      setSimOpen(false);
      setObsOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [simOpen, obsOpen]);

  useEffect(() => {
    if (!saved) {
      setShowStatus(true);
      return undefined;
    }
    setShowStatus(true);
    const handle = window.setTimeout(() => setShowStatus(false), 15_000);
    return () => window.clearTimeout(handle);
  }, [saved]);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/overlay/token').then(response => response.json()).then(body => {
      if (!cancelled && typeof body?.token === 'string') setOverlayToken(body.token);
    }).catch(() => { if (!cancelled) setOverlayToken(''); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/overlay/active').then(response => response.json()).then(body => {
      if (cancelled) return;
      const merged = mergeOverlayOptions(body?.options);
      const timelineMs = Math.min(CREATOR_TIMELINE_MAX_MS, Math.max(CREATOR_TIMELINE_MIN_MS, merged.alertBox.durationMs));
      if (merged.alertBox.durationMs !== timelineMs) merged.alertBox = { ...merged.alertBox, durationMs: timelineMs };
      optionsRef.current = merged;
      setOptions(merged);
      ready.current = true;
    }).catch(() => { if (!cancelled) ready.current = false; });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready.current || !options) return undefined;
    optionsRef.current = options;
    const handle = window.setTimeout(() => {
      const current = optionsRef.current;
      if (!current) return;
      void apiFetch('/api/v1/overlay/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: current })
      }).then(() => setSaved(true)).catch(() => setSaved(false));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [options]);

  const config = options?.alertBox;
  const clips = config?.creator.clips.filter(item => item.event === event) || [];
  const clip = clips.find(item => item.id === clipId) || clips[0] || null;
  const layer = clip?.layers.find(item => item.id === selected) || null;
  const duration = Math.min(CREATOR_TIMELINE_MAX_MS, Math.max(CREATOR_TIMELINE_MIN_MS, config?.durationMs || CREATOR_TIMELINE_MIN_MS));

  useEffect(() => {
    if (!playing) return undefined;
    const started = Date.now() - playhead;
    const timer = window.setInterval(() => {
      const next = Date.now() - started;
      if (next >= duration) { setPlayhead(duration); setPlaying(false); return; }
      setPlayhead(next);
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, duration]);

  const commit = (alertBox: AlertBoxConfig) => {
    setSaved(false);
    setOptions(current => current ? { ...current, alertBox } : current);
  };
  const replaceClip = (next: CreatorClip | null, historyClip?: CreatorClip) => {
    if (!config) return;
    const without = config.creator.clips.filter(item => item.id !== (historyClip || clip)?.id);
    commit({ ...config, creator: { clips: next ? [...without, next] : without } });
  };
  const writeLayers = (layers: CreatorLayer[], patch: Partial<CreatorClip> = {}, fonts = config?.fonts, durationMs = config?.durationMs) => {
    if (!config) return;
    const base = clip || { ...blankClip(event, config.creator.clips.length, alertFrame(config.frame)), id: `clip_${Date.now().toString(36)}` };
    const next = { ...base, ...patch, event, layers };
    const exists = config.creator.clips.some(item => item.id === base.id);
    commit({
      ...config,
      durationMs: durationMs ?? config.durationMs,
      fonts: fonts ?? config.fonts,
      creator: { clips: exists ? config.creator.clips.map(item => item.id === base.id ? next : item) : [...config.creator.clips, next] }
    });
    setClipId(next.id);
  };
  const writeLayersRef = useRef(writeLayers);
  writeLayersRef.current = writeLayers;
  const placeMedia = (target: CreatorLayer, patch: Partial<CreatorLayer>, rawDuration: number) => {
    if (!clip) return;
    const lengthMs = mediaLengthMs(rawDuration);
    const nextLayer = { ...target, ...patch, ...(lengthMs ? { lengthMs } : {}) };
    const end = nextLayer.startMs + nextLayer.lengthMs;
    const durationMs = Math.min(CREATOR_TIMELINE_MAX_MS, Math.max(duration, end));
    writeLayers(clip.layers.map(item => item.id === target.id ? nextLayer : item), {}, config?.fonts, durationMs);
  };
  const removeSelected = () => {
    if (!clip || !selected) return;
    writeLayers(clip.layers.filter(item => item.id !== selected));
    setSelected('');
  };
  const updateLayer = (next: CreatorLayer) => {
    if (!clip) return;
    writeLayers(clip.layers.map(item => item.id === next.id ? next : item));
  };
  const updateLayerRef = useRef(updateLayer);
  updateLayerRef.current = updateLayer;
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if (horizontal || vertical) {
        const inTimeline = target instanceof Element && Boolean(target.closest('.suite-timeline, .suite-playhead'));
        const current = clipRef.current?.layers.find(item => item.id === selectedRef.current);
        const media = current && current.role !== 'background' && (current.kind === 'image' || current.kind === 'video');
        const stage = document.querySelector('.alert-suite .creator-stage');
        if (media && !inTimeline && stage instanceof HTMLElement) {
          const rect = stage.getBoundingClientRect();
          if (rect.width >= 1 && rect.height >= 1) {
            event.preventDefault();
            const step = event.shiftKey ? NUDGE_SHIFT_PX : NUDGE_PX;
            const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
            const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
            const next = clampLayerOrigin(
              current.x + (dx / rect.width) * 100,
              current.y + (dy / rect.height) * 100,
              current.width,
              current.height
            );
            const latest = clipRef.current?.layers.find(item => item.id === current.id) || current;
            window.dispatchEvent(new CustomEvent('creator-media-nudge', {
              detail: { id: current.id, x: next.x, y: next.y, width: latest.width, height: latest.height }
            }));
            updateLayerRef.current({ ...latest, x: next.x, y: next.y });
            return;
          }
        }
        if (!horizontal) return;
        event.preventDefault();
        const step = event.shiftKey ? FRAME_MS * 10 : FRAME_MS;
        setPlaying(false);
        pauseCreatorTimeline();
        const span = durationRef.current;
        setPlayhead(playheadNow => frameTime(playheadNow + (event.key === 'ArrowLeft' ? -step : step), span));
        return;
      }
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      if (!selectedRef.current) return;
      event.preventDefault();
      removeSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const publishSpan = (item: CreatorLayer, mode: 'move' | 'start' | 'end', startMs: number, lengthMs: number, laneWidth: number) => {
    const others = (clipRef.current?.layers || []).filter(entry => entry.id !== item.id);
    const snapped = snapAlignedSpan(mode, startMs, lengthMs, others, laneWidth, duration);
    const current = clipRef.current?.layers.find(entry => entry.id === item.id) || item;
    updateLayerRef.current({ ...current, startMs: snapped.startMs, lengthMs: snapped.lengthMs });
    setAlignGuide(snapped.times.length > 0 || snapped.sameLength ? { layerId: item.id, times: snapped.times, sameLength: snapped.sameLength } : null);
  };
  const beginResize = (pointer: ReactPointerEvent<HTMLElement>, item: CreatorLayer, edge: 'start' | 'end') => {
    if (pointer.button !== 0) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    const row = pointer.currentTarget.closest('button');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSelected(item.id);
    setPlaying(false);
    pauseCreatorTimeline();
    const pointerId = pointer.pointerId;
    try { row.setPointerCapture(pointerId); } catch { /* drag still follows the pointer through window listeners */ }
    const originX = pointer.clientX;
    const originStart = item.startMs;
    const originLength = item.lengthMs;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const delta = ((event.clientX - originX) / rect.width) * duration;
      const next = resizeLayerSpan(edge, originStart, originLength, delta, duration);
      publishSpan(item, edge, next.startMs, next.lengthMs, rect.width);
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (row.isConnected && row.hasPointerCapture(pointerId)) row.releasePointerCapture(pointerId);
      setAlignGuide(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const beginMove = (pointer: ReactPointerEvent<HTMLElement>, item: CreatorLayer) => {
    if (pointer.button !== 0) return;
    const target = pointer.target;
    if (target instanceof Element && target.closest('.suite-resize')) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    const row = pointer.currentTarget.closest('button');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSelected(item.id);
    setPlaying(false);
    pauseCreatorTimeline();
    const bar = pointer.currentTarget;
    const pointerId = pointer.pointerId;
    try { bar.setPointerCapture(pointerId); } catch { /* drag still follows the pointer through window listeners */ }
    const originX = pointer.clientX;
    const originY = pointer.clientY;
    const originStart = item.startMs;
    const originLength = item.lengthMs;
    const originLayers = (clipRef.current?.layers || []).slice();
    const from = originLayers.findIndex(entry => entry.id === item.id);
    const laneButtons = row.parentElement?.querySelectorAll('button') ?? [];
    const stride = laneButtons.length >= 2
      ? Math.max(1, (laneButtons[1] as HTMLElement).offsetTop - (laneButtons[0] as HTMLElement).offsetTop)
      : 26;
    const originDisplayed = originLayers.length - 1 - from;
    let axis: 'x' | 'y' | null = null;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      if (!axis) {
        if (Math.hypot(dx, dy) < 4) return;
        axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      }
      if (axis === 'y') {
        if (from < 0) return;
        const displayed = Math.min(originLayers.length - 1, Math.max(0, originDisplayed + Math.round(dy / stride)));
        const next = moveCreatorLayer(originLayers, item.id, originLayers.length - 1 - displayed);
        const currentIds = clipRef.current?.layers.map(entry => entry.id).join('\0') ?? '';
        if (next.map(entry => entry.id).join('\0') !== currentIds) writeLayersRef.current(next);
        return;
      }
      const delta = (dx / rect.width) * duration;
      const next = moveLayerSpan(originStart, originLength, delta, duration);
      publishSpan(item, 'move', next.startMs, next.lengthMs, rect.width);
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (bar.isConnected && bar.hasPointerCapture(pointerId)) bar.releasePointerCapture(pointerId);
      setAlignGuide(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const insertToken = (token: string) => {
    if (!layer || layer.kind !== 'text') return;
    const current = layer.template;
    const field = textRef.current;
    const focused = field != null && document.activeElement === field;
    if (!focused || !field) {
      updateLayer({ ...layer, template: `${current}${token}` });
      return;
    }
    const start = field.selectionStart ?? current.length;
    const end = field.selectionEnd ?? start;
    updateLayer({ ...layer, template: `${current.slice(0, start)}${token}${current.slice(end)}` });
    const caret = start + token.length;
    window.requestAnimationFrame(() => {
      const node = textRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  };
  const uploadLocalImage = async (layer: CreatorLayer, file: File | undefined) => {
    if (!file) return;
    const named = file.name.toLowerCase();
    const rawType = file.type.toLowerCase();
    const fromName = named.endsWith('.png') ? 'image/png'
      : named.endsWith('.jpg') || named.endsWith('.jpeg') ? 'image/jpeg'
      : named.endsWith('.webp') ? 'image/webp'
      : named.endsWith('.gif') ? 'image/gif'
      : '';
    const type = rawType === 'image/png' || rawType === 'image/x-png' ? 'image/png'
      : rawType === 'image/jpeg' || rawType === 'image/jpg' || rawType === 'image/pjpeg' ? 'image/jpeg'
      : rawType === 'image/webp' ? 'image/webp'
      : rawType === 'image/gif' ? 'image/gif'
      : fromName;
    if (!type) {
      setUploadNote(ui('Nur PNG, JPG, WebP oder GIF (auch Animationen).', 'Only PNG, JPG, WebP or GIF, including animations.'));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setUploadNote(ui('Die Datei darf maximal 12 MB groß sein.', 'The file must be 12 MB or smaller.'));
      return;
    }
    setUploadNote(ui('Wird hochgeladen…', 'Uploading…'));
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const comma = raw.indexOf(',');
      const dataUrl = comma >= 0 && !raw.startsWith(`data:${type};`) ? `data:${type};base64,${raw.slice(comma + 1)}` : raw;
      const response = await apiFetch('/api/v1/overlay/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'logo', dataUrl }) });
      const json = await response.json() as { url?: string; error?: string };
      if (!response.ok || !json.url) {
        setUploadNote(json.error || ui('Upload fehlgeschlagen.', 'Upload failed.'));
        return;
      }
      updateLayer({ ...layer, url: json.url, icon: '', gifFromStart: type === 'image/gif' ? true : layer.gifFromStart });
      setUploadNote(ui('Bild gespeichert.', 'Image saved.'));
    } catch {
      setUploadNote(ui('Upload fehlgeschlagen.', 'Upload failed.'));
    }
  };
  const uploadLocalVideo = async (layer: CreatorLayer, file: File | undefined) => {
    if (!file) return;
    const named = file.name.toLowerCase();
    const type = file.type || (named.endsWith('.webm') ? 'video/webm' : named.endsWith('.mp4') ? 'video/mp4' : '');
    if (type !== 'video/mp4' && type !== 'video/webm') {
      setUploadNote(ui('Nur MP4 oder WebM.', 'Only MP4 or WebM.'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadNote(ui('Das Video darf maximal 8 MB groß sein.', 'The video must be 8 MB or smaller.'));
      return;
    }
    setUploadNote(ui('Wird hochgeladen…', 'Uploading…'));
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const comma = raw.indexOf(',');
    const dataUrl = comma >= 0 && !raw.startsWith(`data:${type};`) ? `data:${type};base64,${raw.slice(comma + 1)}` : raw;
    const [response, mediaMs] = await Promise.all([
      apiFetch('/api/v1/overlay/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'alert-video', dataUrl }) }),
      readFileDuration(file)
    ]);
    const json = await response.json() as { url?: string; error?: string };
    if (!response.ok || !json.url) {
      setUploadNote(json.error || ui('Upload fehlgeschlagen.', 'Upload failed.'));
      return;
    }
    placeMedia(layer, { url: json.url }, mediaMs);
    setUploadNote(ui('Video gespeichert.', 'Video saved.'));
  };
  const uploadLocalSound = async (layer: CreatorLayer, file: File | undefined) => {
    if (!file) return;
    const type = alertSoundType(file.name, file.type);
    if (!type) {
      setUploadNote(ui('Nur MP3, WAV, OGG oder M4A.', 'Only MP3, WAV, OGG or M4A.'));
      return;
    }
    if (file.size > ALERT_SOUND_MAX_BYTES) {
      setUploadNote(ui('Die Datei darf maximal 12 MB groß sein.', 'The file must be 12 MB or smaller.'));
      return;
    }
    setUploadNote(ui('Wird hochgeladen…', 'Uploading…'));
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const dataUrl = dataUrlWithType(raw, type);
      const [response, mediaMs] = await Promise.all([
        apiFetch('/api/v1/overlay/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'alert-sound', dataUrl }) }),
        readFileDuration(file)
      ]);
      const json = await response.json() as { url?: string; error?: string };
      if (!response.ok || !json.url) {
        setUploadNote(json.error || ui('Upload fehlgeschlagen.', 'Upload failed.'));
        return;
      }
      placeMedia(layer, { soundUrl: json.url }, mediaMs);
      setUploadNote(ui('Ton gespeichert.', 'Sound saved.'));
    } catch {
      setUploadNote(ui('Upload fehlgeschlagen.', 'Upload failed.'));
    }
  };
  const addVariation = () => {
    if (!config) return;
    const created = { ...blankClip(event, config.creator.clips.length, alertFrame(config.frame)), id: `clip_${Date.now().toString(36)}`, name: `${ui('Variation', 'Variation')} ${clips.length + 1}` };
    commit({ ...config, creator: { clips: [...config.creator.clips, created] } });
    setClipId(created.id);
    setSelected('');
    setRangeOpen(true);
    setTool('');
  };
  const removeVariation = (id: string) => {
    if (!config) return;
    const owner = config.creator.clips.find(item => item.id === id);
    if (!owner) return;
    const siblings = config.creator.clips.filter(item => item.event === owner.event);
    if (siblings.length < 2) return;
    commit({ ...config, creator: { clips: config.creator.clips.filter(item => item.id !== id) } });
    if (event === owner.event && (!clipId || clipId === id)) setClipId(siblings.find(item => item.id !== id)?.id || '');
    if (siblings.length === 2) setVariationMenu('');
    setSelected('');
    setRangeOpen(false);
    setTool('');
  };
  const useTemplate = () => {
    const layers = templateLayers(event, language).map((item, index) => ({ ...item, id: `layer_${Date.now().toString(36)}_${index}` }));
    writeLayers(layers);
    setSelected(layers[layers.length - 1].id);
    setTool('');
  };
  const addLayer = (kind: CreatorLayerKind) => {
    const created = emptyCreatorLayer(kind, clip?.layers.length || 0);
    created.id = `layer_${Date.now().toString(36)}`;
    writeLayers([...(clip?.layers || []), created]);
    setSelected(created.id);
    setRangeOpen(false);
  };
  const addShape = (shape: CreatorShape) => {
    const created = placeCreatorShape(clip?.layers.length || 0, shape);
    created.id = `layer_${Date.now().toString(36)}`;
    writeLayers([...(clip?.layers || []), created]);
    setSelected(created.id);
    setRangeOpen(false);
    setTool('');
  };
  const preview = sampleFor(event, amount, withMessage, clip?.tier || '');
  const play = (nextAmount = amount) => {
    setAmount(nextAmount);
    setPlayhead(0);
    setPlaying(true);
    setReplayToken(token => token + 1);
    const detail = { ...sampleFor(event, nextAmount, withMessage, clip?.tier || ''), id: `sim-${event}-${Date.now()}` };
    window.dispatchEvent(new CustomEvent('overlay:alert-sample', { detail }));
  };
  const stretch = (factor: number) => {
    if (!config || !clip) return;
    const scale = (value: number) => Math.max(0, Math.round(value * factor));
    commit({
      ...config,
      durationMs: duration,
      creator: {
        clips: config.creator.clips.map(item => item.id === clip.id ? {
          ...item,
          layers: item.layers.map(entry => ({ ...entry, startMs: Math.min(duration, scale(entry.startMs)), lengthMs: Math.max(200, Math.min(duration, scale(entry.lengthMs))) }))
        } : item)
      }
    });
  };
  const keyIndex = layer ? layer.keyframes.findIndex(key => key.timeMs >= playhead - layer.startMs) : -1;
  const activeKey = layer && layer.keyframes.length ? layer.keyframes[Math.max(0, keyIndex)] : null;
  const playingClip = config ? creatorClipFor(config, preview) : null;

  if (!config) return <p className="p-6 text-sm text-neutral-400">{ui('Alert-Creator wird geladen.', 'Loading the alert creator.')}</p>;

  const seconds = Math.max(1, Math.ceil(duration / 1000));
  const rangeLabel = clip?.range === 'between'
    ? `${clip.min}–${clip.max}`
    : clip?.range === 'exactly'
      ? String(clip.min)
      : clip?.range === 'highest'
        ? ui('Höchster', 'Highest')
        : `${clip?.min ?? 1} ${ui('bis unendlich', 'to infinite')}`;
  const showRange = event === 'cheer' || event === 'gift' || event === 'raid' || event === 'tip' || event === 'host';
  const ranged = showRange;
  const frame = alertFrame(clip?.frame ?? config.frame);
  const resolution = clip ? alertFrameSize(frame, clip) : alertFrameSize(frame);
  const chooseFrame = (next: AlertFrame) => {
    const applied = applyAlertFrame(config, next);
    const same = applied.frame === config.frame && applied.creator.clips.every((item, index) => {
      const current = config.creator.clips[index];
      return current === item || (current.frame === item.frame && current.width === item.width && current.height === item.height);
    });
    if (same && config.creator.clips.length > 0) return;
    if (applied.creator.clips.length === 0) {
      const created = { ...blankClip(event, 0, next), id: `clip_${Date.now().toString(36)}` };
      commit({ ...applied, creator: { clips: [created] } });
      setClipId(created.id);
      return;
    }
    commit(applied);
  };

  return (
    <section className={`alert-suite ${wideTimeline ? 'is-wide' : ''}`}>
      <header className="suite-top">
        <nav className="suite-events" aria-label={ui('Animationen', 'Animations')}>
          {CREATOR_EVENTS.map(id => {
            const eventClips = config.creator.clips.filter(item => item.event === id);
            const menuOpen = variationMenu === id && eventClips.length > 1;
            return (
              <span key={id} className="suite-event">
                <button type="button" className={event === id ? 'is-active' : ''} aria-expanded={eventClips.length > 1 ? menuOpen : undefined} onClick={() => {
                  const nextOpen = eventClips.length > 1 && variationMenu !== id;
                  setVariationMenu(nextOpen ? id : '');
                  if (event !== id) { setEvent(id); setClipId(''); setSelected(''); setRangeOpen(false); setTool(''); }
                }}>
                  {ui(...EVENT_LABELS[id])}
                  {eventClips.length > 1 && <i aria-hidden="true">▾</i>}
                </button>
                {menuOpen && (
                  <div className="suite-event-menu" role="menu">
                    {eventClips.map((item, index) => (
                      <span key={item.id} className="suite-event-row">
                        <button type="button" role="menuitem" className={event === id && clip?.id === item.id ? 'is-active' : ''} onClick={() => { setEvent(id); setClipId(item.id); setSelected(''); setRangeOpen(false); setVariationMenu(''); }}>
                          {item.name || `${ui('Variation', 'Variation')} ${index + 1}`}
                        </button>
                        <button type="button" className="suite-remove" aria-label={ui('Variation entfernen', 'Remove variation')} onClick={() => removeVariation(item.id)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </span>
            );
          })}
          <button type="button" className="suite-add" onClick={addVariation}>{ui('Animation hinzufügen', 'Add animation')}</button>
        </nav>
        <div className="suite-sim-wrap">
          {showStatus && <span className={saved ? 'suite-saved is-saved' : 'suite-saved'}>{saved ? ui('Gespeichert', 'Saved') : ui('Speichert…', 'Saving…')}</span>}
          <div className="suite-obs-wrap">
            <button type="button" className="suite-obs-button" onClick={() => { setObsOpen(open => !open); setSimOpen(false); }}>{ui('Nach OBS exportieren', 'Export to OBS')}</button>
            {obsOpen && (
              <div className="suite-obs">
                <strong>{ui('Alerts als Browserquelle', 'Alerts as a browser source')}</strong>
                <input readOnly value={overlayToken ? `${window.location.origin}/overlay/alerts?token=${encodeURIComponent(overlayToken)}&lang=${language}` : ''} onFocus={node => node.currentTarget.select()} aria-label={ui('OBS-URL', 'OBS URL')} />
                <button type="button" disabled={!overlayToken} onClick={() => {
                  const url = `${window.location.origin}/overlay/alerts?token=${encodeURIComponent(overlayToken)}&lang=${language}`;
                  void navigator.clipboard.writeText(url).then(() => {
                    setObsCopied(true);
                    window.setTimeout(() => setObsCopied(false), 2000);
                  }).catch(() => setObsCopied(false));
                }}>{obsCopied ? ui('Kopiert', 'Copied') : ui('URL kopieren', 'Copy URL')}</button>
                <ol>
                  <li>{ui('In OBS: Quellen → + → Browser.', 'In OBS: Sources → + → Browser.')}</li>
                  <li>{ui(`URL einfügen. Größe ${resolution.width}×${resolution.height}. „Quelle deaktivieren, wenn nicht sichtbar“ aus lassen.`, `Paste the URL. Size ${resolution.width}×${resolution.height}. Leave “Shutdown source when not visible” off.`)}</li>
                  <li>{ui('Die Quelle bleibt leer, bis ein Alert abgespielt wird.', 'The source stays blank until an alert plays.')}</li>
                </ol>
              </div>
            )}
          </div>
          <button type="button" className="suite-simulate" onClick={() => { setSimOpen(open => !open); setObsOpen(false); }}>{ui('Alerts simulieren', 'Simulate alerts')}</button>
          {simOpen && (
            <div className="suite-sim">
              {[1, 5, 20, 50, 100, 200].map(value => (
                <button key={value} type="button" className={amount === value ? 'is-active' : ''} onClick={() => { setSimOpen(false); play(value); }}>{value}</button>
              ))}
              {(event === 'cheer' || event === 'tip') && <label><input type="checkbox" checked={withMessage} onChange={node => setWithMessage(node.target.checked)} />{ui('Mit Nachricht', 'With message')}</label>}
            </div>
          )}
        </div>
      </header>
      <div className="suite-workspace">
        <nav className="suite-rail" aria-label={ui('Einfügen', 'Insert')}>
          <span>{ui('Einfügen', 'Insert')}</span>
          {RAIL.map(item => (
            <button
              key={item.kind}
              type="button"
              className={item.kind === 'shape' && tool === 'shapes' ? 'is-active' : ''}
              title={ui(...item.label)}
              aria-label={ui(...item.label)}
              aria-expanded={item.kind === 'shape' ? tool === 'shapes' : undefined}
              onClick={() => {
                if (item.kind === 'shape') { setTool(current => current === 'shapes' ? '' : 'shapes'); return; }
                setTool('');
                addLayer(item.kind);
              }}
            >
              <item.icon aria-hidden="true" />
            </button>
          ))}
          <button type="button" className={tool === 'icons' ? 'is-active' : ''} title={ui('Animierte Icons', 'Animated icons')} aria-label={ui('Animierte Icons', 'Animated icons')} onClick={() => setTool(current => current === 'icons' ? '' : 'icons')}><Sparkles aria-hidden="true" /></button>
          <button type="button" className={tool === 'fx' ? 'is-active' : ''} title={ui('Effekte', 'Effects')} aria-label={ui('Effekte', 'Effects')} onClick={() => setTool(current => current === 'fx' ? '' : 'fx')}><Wand2 aria-hidden="true" /></button>
          <button type="button" className={tool === 'code' ? 'is-active' : ''} title={ui('Eigenes CSS', 'Custom code')} aria-label={ui('Eigenes CSS', 'Custom code')} onClick={() => setTool(current => current === 'code' ? '' : 'code')}><Code2 aria-hidden="true" /></button>
        </nav>
        <div className="suite-scene">
          <div className={`suite-frame is-frame-${frame}`} data-alert-frame={frame} data-alert-resolution={`${resolution.width}x${resolution.height}`} style={{ ['--alert-width' as string]: resolution.width, ['--alert-height' as string]: resolution.height }}>
              {showRange && (
                <button type="button" className="suite-chip" onClick={() => setRangeOpen(true)}>
                  {rangeLabel}
                  {playingClip?.id === clip?.id && clip ? <i>{ui('aktiv', 'active')}</i> : null}
                </button>
              )}
              {config.customCss ? <style>{config.customCss}</style> : null}
              {clip && clip.layers.length > 0
                ? <CreatorStage clip={clip} alert={preview} config={config} language={language} elapsedMs={playhead} playing={playing} editable={!playing} selectedId={selected} replayToken={replayToken} onSelect={setSelected} onText={(id, template) => {
                  const current = clip.layers.find(item => item.id === id);
                  if (current && current.template !== template) updateLayer({ ...current, template });
                }} onMove={(id, x, y) => {
                    const current = clip.layers.find(item => item.id === id);
                    if (current) updateLayer({ ...current, x, y });
                  }} onResize={(id, x, y, width, height) => {
                    const current = clip.layers.find(item => item.id === id);
                    if (current) updateLayer({ ...current, x, y, width, height });
                  }} />
                : (
                  <div className="suite-start">
                    <div className="suite-tabs" role="tablist">
                      <button type="button" className={starterTab === 'scratch' ? 'is-active' : ''} onClick={() => setStarterTab('scratch')}>{ui('Von vorn', 'From scratch')}</button>
                      <button type="button" className={starterTab === 'template' ? 'is-active' : ''} onClick={() => setStarterTab('template')}>{ui('Vorlage nutzen', 'Use a template')}</button>
                    </div>
                    {starterTab === 'scratch'
                      ? <p>{ui('Welche Ereignisse soll diese Alert Box zeigen? Wähle oben eines und füge dann Ebenen ein.', 'Which events should this alert box show? Pick one above, then insert layers.')}</p>
                      : <p>{ui('Die Vorlage legt Text, Icon und eine Fläche für dieses Ereignis an.', 'The template adds text, an icon and a plate for this event.')}</p>}
                    <button type="button" onClick={() => starterTab === 'scratch' ? addLayer('text') : useTemplate()}>
                      {starterTab === 'scratch' ? ui('Leere Animation anlegen', 'Create an empty animation') : ui('Vorlage übernehmen', 'Apply template')}
                    </button>
                  </div>
                )}
          </div>
        </div>
        <div className="suite-controls">
          <div className="suite-playbar">
            <time>{clock(playhead)}</time>
            <button type="button" aria-label={ui('Zum Anfang', 'Back to start')} onClick={() => { setPlaying(false); pauseCreatorTimeline(); setPlayhead(0); }}><RotateCcw aria-hidden="true" /></button>
            <button type="button" className={playing ? 'is-play is-paused' : 'is-play'} aria-label={playing ? ui('Pause', 'Pause') : ui('Abspielen', 'Play')} onClick={() => {
              if (playing) { setPlaying(false); pauseCreatorTimeline(); return; }
              play();
              playCreatorTimeline(0);
            }}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
            <button type="button" onClick={() => stretch(0.5)} title={ui('Timing stauchen', 'Compress timing')}>×0.5</button>
            <button type="button" onClick={() => stretch(2)} title={ui('Timing strecken', 'Stretch timing')}>×2</button>
            <em>{clock(duration)}</em>
          </div>
          <div className="suite-frame-picker" role="group" aria-label={ui('Rahmen', 'Frame')}>
            <button type="button" aria-pressed={frame === 'fullscreen'} className={frame === 'fullscreen' ? 'is-active' : ''} onClick={() => chooseFrame('fullscreen')}>{ui('Vollbild', 'Fullscreen')}</button>
            <button type="button" aria-pressed={frame === 'square'} className={frame === 'square' ? 'is-active' : ''} onClick={() => chooseFrame('square')}>{ui('Quadrat', 'Square')}</button>
            <span className="suite-resolution" data-alert-resolution={`${resolution.width}x${resolution.height}`} aria-label={ui(`Auflösung ${resolution.width}×${resolution.height}`, `Resolution ${resolution.width}×${resolution.height}`)}>{resolution.width}×{resolution.height}</span>
          </div>
          <button type="button" className="suite-layout" aria-pressed={wideTimeline} onClick={() => setWideTimeline(current => { const next = !current; try { localStorage.setItem('alert-creator-layout', next ? 'wide' : 'standard'); } catch { /* keep the choice for this visit */ } return next; })}>
            {wideTimeline ? ui('Timeline schmal', 'Timeline compact') : ui('Timeline breit', 'Timeline full width')}
          </button>
        </div>
        <div
          className="suite-timeline"
          style={{ ['--play-ratio' as string]: Math.min(1, playhead / duration) }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            const target = event.target;
            if (target instanceof Element && target.closest('.suite-lanes button')) return;
            const ruler = event.currentTarget.querySelector('.suite-ruler');
            if (!ruler) return;
            const surface = event.currentTarget;
            const pointerId = event.pointerId;
            const seek = (clientX: number) => {
              const rect = ruler.getBoundingClientRect();
              if (rect.width <= 0) return;
              const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
              setPlaying(false);
              pauseCreatorTimeline();
              setPlayhead(frameTime(ratio * duration, duration));
            };
            event.preventDefault();
            try { surface.setPointerCapture(pointerId); } catch { /* window listeners still follow the pointer */ }
            seek(event.clientX);
            const move = (pointer: PointerEvent) => {
              if (pointer.pointerId !== pointerId) return;
              seek(pointer.clientX);
            };
            const up = (pointer: PointerEvent) => {
              if (pointer.pointerId !== pointerId) return;
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              window.removeEventListener('pointercancel', up);
              if (surface.isConnected && surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
          }}
        >
            <div className="suite-ruler">
              {Array.from({ length: Math.floor(seconds / (seconds > 180 ? 30 : seconds > 60 ? 10 : seconds > 20 ? 5 : 1)) + 1 }, (_, index) => {
                const step = seconds > 180 ? 30 : seconds > 60 ? 10 : seconds > 20 ? 5 : 1;
                const second = index * step;
                return <span key={second} style={{ left: `${(second / seconds) * 100}%` }}>{second}:00</span>;
              })}
            </div>
            <i className="suite-playhead" aria-hidden="true" />
            <div className="suite-lanes">
              {alignGuide?.times.map(time => (
                <i key={time} className="suite-align-guide" data-timeline-guide="" style={{ left: `${(time / duration) * 100}%` }} aria-hidden="true">
                  {alignGuide.sameLength && time === alignGuide.times[0] ? <span>{ui('Gleiche Länge', 'Same length')}</span> : null}
                </i>
              ))}
              {(clip?.layers || []).map((item, index) => ({ item, index })).reverse().map(({ item, index }) => (
                <button key={item.id} type="button" data-stack={index} title={ui('Oben liegt vorne. Seitlich verschiebt die Zeit.', 'Higher row is in front. Drag sideways to change time.')} className={item.id === selected ? 'is-active' : ''} onClick={() => setSelected(item.id)}>
                  <b style={{ left: `${(item.startMs / duration) * 100}%`, width: `${Math.max(2, (item.lengthMs / duration) * 100)}%` }} title={item.kind === 'sound' && item.soundUrl ? mediaFileName(item.soundUrl) : undefined} onPointerDown={event => beginMove(event, item)}>
                    <span className="suite-resize is-start" aria-label={ui('Start ziehen', 'Drag start')} onPointerDown={event => beginResize(event, item, 'start')} />
                    <span className="suite-bar-label">{item.kind === 'sound' && item.soundUrl ? mediaFileName(item.soundUrl) : item.kind === 'shape' ? ui(...SHAPE_LABELS[item.shape]) : ui(...KIND_LABELS[item.kind])}</span>
                    {alignGuide?.sameLength && alignGuide.times.length === 0 && alignGuide.layerId === item.id ? <span className="suite-length-hint" aria-hidden="true">{ui('Gleiche Länge', 'Same length')}</span> : null}
                    <span className="suite-resize is-end" aria-label={ui('Ende ziehen', 'Drag end')} onPointerDown={event => beginResize(event, item, 'end')} />
                  </b>
                </button>
              ))}
            </div>
          </div>
        <aside className="suite-inspector properties-panel">
          <h2>{tool === 'shapes' ? ui('Formen', 'Shapes') : layer ? (layer.kind === 'shape' ? ui(...SHAPE_LABELS[layer.shape]) : ui(...KIND_LABELS[layer.kind])) : tool === 'icons' ? ui('Animierte Icons', 'Animated icons') : tool === 'fx' ? ui('Effekte', 'Effects') : tool === 'code' ? ui('Eigenes CSS', 'Custom code') : ui('Eigenschaften', 'Properties')}</h2>
          {tool === 'shapes' && (
            <div className="suite-grid">
              {CREATOR_SHAPES.map(shape => (
                <button key={shape} type="button" onClick={() => addShape(shape)}>{ui(...SHAPE_LABELS[shape])}</button>
              ))}
            </div>
          )}
          {tool === 'icons' && (
            <div className="suite-grid">
              <h3>{ui('Animierte Icons', 'Animated icons')}</h3>
              {ALERT_ICONS.map(icon => (
                <button key={icon} type="button" onClick={() => {
                  const created = emptyCreatorLayer('image', clip?.layers.length || 0);
                  created.id = `layer_${Date.now().toString(36)}`;
                  created.icon = icon as AlertIcon;
                  created.intro = 'pop';
                  created.outro = 'pop';
                  created.color = '#f0abfc';
                  created.width = 24;
                  created.height = 40;
                  writeLayers([...(clip?.layers || []), created]);
                  setSelected(created.id);
                }}>{icon}</button>
              ))}
            </div>
          )}
          {tool === 'fx' && (
            <div className="suite-grid">
              <h3>{ui('Effekte', 'Effects')}</h3>
              {layer ? ALERT_FX.map(fx => (
                <button key={fx} type="button" onClick={() => updateLayer(applyAlertFx(layer, fx as AlertFx))}>{fx}</button>
              )) : <p className="suite-empty">{ui('Zuerst eine Ebene wählen.', 'Select a layer first.')}</p>}
            </div>
          )}
          {tool === 'code' && (
            <div className="suite-grid">
              <h3>{ui('Eigenes CSS', 'Custom code')}</h3>
              <textarea className="custom-css-input" maxLength={6000} value={config.customCss} onChange={node => commit({ ...config, customCss: node.target.value.slice(0, 6000) })} />
            </div>
          )}
          {!layer && !rangeOpen && !tool && <p className="suite-empty">{clip?.layers.length ? ui('Wähle eine Ebene in der Timeline.', 'Select a layer in the timeline.') : ui('Links eine Ebene einfügen.', 'Use the menu on the left to insert items.')}</p>}
          {rangeOpen && clip && (
            <div className="suite-grid">
              <Field label={ui('Name', 'Name')}><input value={clip.name} onChange={node => writeLayers(clip.layers, { name: node.target.value })} /></Field>
              {ranged && (
                <>
                  <Field label={ui('Bereich', 'Range')}>
                    <select value={clip.range} onChange={node => writeLayers(clip.layers, { range: node.target.value as CreatorRange })}>
                      {CREATOR_RANGES.map(range => <option key={range} value={range}>{ui(...RANGE_LABELS[range])}</option>)}
                    </select>
                  </Field>
                  <Field label={ui('Von', 'From')}><input inputMode="numeric" value={clip.min} onChange={node => writeLayers(clip.layers, { min: Number(node.target.value) || 0 })} /></Field>
                  {clip.range === 'between' && <Field label={ui('Bis', 'To')}><input inputMode="numeric" value={clip.max} onChange={node => writeLayers(clip.layers, { max: Number(node.target.value) || 0 })} /></Field>}
                </>
              )}
              {(event === 'cheer' || event === 'tip') && (
                <Field label={ui('Nachricht', 'Message')}>
                  <select value={clip.message} onChange={node => writeLayers(clip.layers, { message: node.target.value as CreatorClip['message'] })}>
                    {CREATOR_MESSAGES.map(mode => <option key={mode} value={mode}>{mode === 'all' ? ui('Alle', 'Show all') : mode === 'with' ? ui('Nur mit Nachricht', 'With a message') : ui('Nur ohne Nachricht', 'Without a message')}</option>)}
                  </select>
                </Field>
              )}
              {(event === 'subscription' || event === 'resub' || event === 'gift') && (
                <Field label={ui('Stufe', 'Tier')}>
                  <select value={clip.tier} onChange={node => writeLayers(clip.layers, { tier: node.target.value as CreatorClip['tier'] })}>
                    {CREATOR_TIERS.map(tier => <option key={tier || 'all'} value={tier}>{tier === '' ? ui('Alle', 'All') : tier === 'prime' ? 'Prime' : tier === '1000' ? 'Tier 1' : tier === '2000' ? 'Tier 2' : 'Tier 3'}</option>)}
                  </select>
                </Field>
              )}
              <div className="suite-actions">
                <button type="button" onClick={() => {
                  const created = { ...blankClip(event, config.creator.clips.length, alertFrame(config.frame)), id: `clip_${Date.now().toString(36)}`, name: `${ui('Variation', 'Variation')} ${clips.length + 1}` };
                  commit({ ...config, creator: { clips: [...config.creator.clips, created] } });
                  setClipId(created.id);
                }}>{ui('Variation hinzufügen', 'Add variation')}</button>
                <button type="button" onClick={() => { replaceClip(null); setClipId(''); setRangeOpen(false); }}>{ui('Animation löschen', 'Delete animation')}</button>
              </div>
            </div>
          )}
          {layer && !tool && (
            <div className="suite-grid">
              <Field label={ui('Start', 'Start')}><input inputMode="numeric" value={layer.startMs} onChange={node => updateLayer({ ...layer, startMs: Number(node.target.value) || 0 })} /></Field>
              <Field label={ui('Länge', 'Length')}><input inputMode="numeric" value={layer.lengthMs} onChange={node => updateLayer({ ...layer, lengthMs: Number(node.target.value) || 200 })} /></Field>
              {layer.kind !== 'image' && (
                <>
                  <Field label={ui('Rein', 'In')}>
                    <select value={layer.intro} onChange={node => updateLayer({ ...layer, intro: node.target.value as CreatorMotion })}>{CREATOR_MOTIONS.map(motion => <option key={motion} value={motion}>{ui(...MOTION_IN[motion])}</option>)}</select>
                  </Field>
                  <Field label={ui('Raus', 'Out')}>
                    <select value={layer.outro} onChange={node => updateLayer({ ...layer, outro: node.target.value as CreatorMotion })}>{CREATOR_MOTIONS.map(motion => <option key={motion} value={motion}>{ui(...MOTION_OUT[motion])}</option>)}</select>
                  </Field>
                  <Field label="X"><input inputMode="numeric" value={layer.x} onChange={node => updateLayer({ ...layer, x: Number(node.target.value) || 0 })} /></Field>
                  <Field label="Y"><input inputMode="numeric" value={layer.y} onChange={node => updateLayer({ ...layer, y: Number(node.target.value) || 0 })} /></Field>
                  <Field label={ui('Breite', 'Width')}><input inputMode="numeric" value={layer.width} onChange={node => updateLayer({ ...layer, width: Number(node.target.value) || 4 })} /></Field>
                  <Field label={ui('Höhe', 'Height')}><input inputMode="numeric" value={layer.height} onChange={node => updateLayer({ ...layer, height: Number(node.target.value) || 4 })} /></Field>
                  <Field label={ui('Drehung', 'Rotation')}><input inputMode="numeric" value={layer.rotation} onChange={node => updateLayer({ ...layer, rotation: Number(node.target.value) || 0 })} /></Field>
                  <Field label={ui('Anker', 'Anchor')}>
                    <select value={layer.anchor} onChange={node => {
                      const anchor = node.target.value as CreatorLayer['anchor'];
                      const [anchorX, anchorY] = ANCHOR_POINT[anchor];
                      updateLayer({ ...layer, anchor, anchorX, anchorY });
                    }}>{CREATOR_ANCHORS.map(anchor => <option key={anchor} value={anchor}>{anchor}</option>)}</select>
                  </Field>
                  <Field label={ui('Deckkraft', 'Opacity')}><input inputMode="numeric" value={layer.opacity} onChange={node => updateLayer({ ...layer, opacity: Number(node.target.value) || 0 })} /></Field>
                </>
              )}
              {layer.kind === 'text' && (
                <>
                  <label className="suite-field suite-span">
                    <span>{ui('Text', 'Text')}</span>
                    <textarea ref={textRef} rows={3} value={layer.template} placeholder="{name} {amount} {months} {tier} {viewers} {message}" onChange={node => updateLayer({ ...layer, template: node.target.value })} />
                  </label>
                  <div className="suite-tokens" role="group" aria-label={ui('Platzhalter', 'Placeholders')}>
                    {TEXT_TOKENS.map(name => (
                      <button key={name} type="button" onMouseDown={event => event.preventDefault()} onClick={() => insertToken(`{${name}}`)}>{`{${name}}`}</button>
                    ))}
                  </div>
                  <Field label={ui('Ausrichtung', 'Align')}>
                    <select value={layer.align} onChange={node => updateLayer({ ...layer, align: node.target.value as CreatorLayer['align'] })}>
                      <option value="left">{ui('Links', 'Left')}</option>
                      <option value="center">{ui('Mitte', 'Center')}</option>
                      <option value="right">{ui('Rechts', 'Right')}</option>
                    </select>
                  </Field>
                  <AlertFontField
                    language={language}
                    family={layer.fontFamily}
                    fonts={config.fonts}
                    onFamily={family => updateLayer({ ...layer, fontFamily: family })}
                    onLibrary={(fonts, family) => {
                      if (!clip) return;
                      writeLayers(clip.layers.map(item => item.id === layer.id ? { ...item, fontFamily: family } : item), {}, fonts);
                    }}
                  />
                  <Field label={ui('Schriftgröße', 'Font size')}><input inputMode="numeric" value={layer.fontSize} onChange={node => updateLayer({ ...layer, fontSize: Number(node.target.value) || 12 })} /></Field>
                  <Field label={ui('Farbe', 'Color')}><input type="color" value={layer.color} onChange={node => updateLayer({ ...layer, color: node.target.value })} /></Field>
                  <Field label={ui('Schatten', 'Shadow')}><input type="checkbox" checked={layer.shadow} onChange={node => updateLayer({ ...layer, shadow: node.target.checked })} /></Field>
                  <Field label={ui('Kontur', 'Stroke')}><input type="checkbox" checked={layer.stroke} onChange={node => updateLayer({ ...layer, stroke: node.target.checked })} /></Field>
                  <Field label={ui('Platte', 'Plate')}><input type="checkbox" checked={layer.plate} onChange={node => updateLayer({ ...layer, plate: node.target.checked })} /></Field>
                </>
              )}
              {layer.kind === 'shape' && (
                <>
                  <Field label={ui('Form', 'Shape')}>
                    <select value={layer.shape} onChange={node => updateLayer(assignCreatorShape(layer, node.target.value as CreatorShape))}>
                      {CREATOR_SHAPES.map(shape => <option key={shape} value={shape}>{ui(...SHAPE_LABELS[shape])}</option>)}
                    </select>
                  </Field>
                  <Field label={ui('Füllung', 'Fill')}><input type="color" value={layer.color} onChange={node => updateLayer({ ...layer, color: node.target.value })} /></Field>
                  <Field label={ui('Kontur', 'Stroke')}><input type="checkbox" checked={layer.stroke} onChange={node => updateLayer({ ...layer, stroke: node.target.checked })} /></Field>
                  {layer.stroke && (
                    <>
                      <Field label={ui('Konturfarbe', 'Stroke color')}><input type="color" value={layer.strokeColor} onChange={node => updateLayer({ ...layer, strokeColor: node.target.value })} /></Field>
                      <Field label={ui('Konturstärke', 'Stroke width')}><input inputMode="numeric" value={layer.strokeWidth} onChange={node => updateLayer({ ...layer, strokeWidth: Number(node.target.value) || 0 })} /></Field>
                    </>
                  )}
                  {layer.shape === 'rounded' && (
                    <Field label={ui('Ecke', 'Radius')}><input inputMode="numeric" value={layer.radius} onChange={node => updateLayer({ ...layer, radius: Number(node.target.value) || 0 })} /></Field>
                  )}
                </>
              )}
              {layer.kind === 'sound' && (
                <>
                  <div className="suite-source">
                    {safeMediaUrl(layer.soundUrl)
                      ? <audio controls preload="metadata" src={safeMediaUrl(layer.soundUrl)} />
                      : <span>{ui('Keine Quelle', 'No source')}</span>}
                  </div>
                  <Field label={ui('Tondatei', 'Sound file')}><input value={layer.soundUrl} onChange={node => updateLayer({ ...layer, soundUrl: node.target.value })} /></Field>
                  <label className="suite-upload">
                    {ui('Ton hochladen', 'Upload sound')}
                    <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a,.webm" onChange={node => {
                      const file = node.target.files?.[0];
                      node.currentTarget.value = '';
                      void uploadLocalSound(layer, file);
                    }} />
                  </label>
                  {uploadNote && <p className="suite-hint">{uploadNote}</p>}
                  <Field label={ui('Lautstärke', 'Volume')}><input inputMode="numeric" value={layer.volume} onChange={node => updateLayer({ ...layer, volume: Number(node.target.value) || 0 })} /></Field>
                </>
              )}
              {layer.kind === 'image' && (
                <>
                  <div className="suite-tabs" role="tablist">
                    <button type="button" className={layer.role === 'content' ? 'is-active' : ''} onClick={() => updateLayer({ ...layer, role: 'content' })}>{ui('Inhalt', 'Content')}</button>
                    <button type="button" className={layer.role === 'background' ? 'is-active' : ''} onClick={() => updateLayer({ ...layer, role: 'background' })}>{ui('Hintergrund', 'Background')}</button>
                  </div>
                  <div className="suite-source">
                    {safeMediaUrl(layer.url) ? <img src={safeMediaUrl(layer.url)} alt="" /> : <span>{ui('Keine Quelle', 'No source')}</span>}
                  </div>
                  <label className="suite-upload">
                    <Pencil aria-hidden="true" />
                    {ui('Bild oder Animation hochladen', 'Upload image or animation')}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.gif,.webp,.png,.jpg,.jpeg" onChange={node => {
                      const file = node.target.files?.[0];
                      node.currentTarget.value = '';
                      void uploadLocalImage(layer, file);
                    }} />
                  </label>
                  {uploadNote && <p className="suite-hint">{uploadNote}</p>}
                  <div className="suite-span">
                    <Field label="URL"><input value={layer.url} onChange={node => updateLayer({ ...layer, url: node.target.value })} /></Field>
                  </div>
                  <div className="suite-span">
                    <Field label={ui('Füllung', 'Fill and resize')}>
                      <select value={layer.fit} onChange={node => updateLayer({ ...layer, fit: node.target.value as CreatorFit })}>
                        {CREATOR_FITS.map(fit => <option key={fit} value={fit}>{fit === 'cover' ? ui('Füllen und Seitenverhältnis behalten', 'Cover and keep ratio') : fit === 'stretch' ? ui('Strecken', 'Stretch') : ui('Einpassen und Seitenverhältnis behalten', 'Contain and keep ratio')}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label={ui('Ecke', 'Radius')}><input inputMode="numeric" value={layer.radius} onChange={node => updateLayer({ ...layer, radius: Number(node.target.value) || 0 })} /></Field>
                  <label className="suite-span suite-check"><input type="checkbox" checked={layer.gifFromStart} onChange={node => updateLayer({ ...layer, gifFromStart: node.target.checked })} />{ui('GIF am Anfang starten', 'Force GIF start at beginning')}</label>
                  <h3>{ui('Effekte und Animation', 'Effects & animation')}</h3>
                  <div className="suite-choice">
                    <label><input type="radio" name={`motion-${layer.id}`} checked={layer.motion === 'basic'} onChange={() => updateLayer({ ...layer, motion: 'basic' })} />{ui('Einfache Animationen', 'Use basic animations')}</label>
                    <label><input type="radio" name={`motion-${layer.id}`} checked={layer.motion === 'keyframes'} onChange={() => updateLayer({ ...layer, motion: 'keyframes' })} />{ui('Keyframes', 'Use keyframes')}</label>
                  </div>
                  {layer.motion === 'basic' && (
                    <>
                      <Field label={ui('Öffnen', 'Opening animation')}>
                        <select value={layer.intro} onChange={node => updateLayer({ ...layer, intro: node.target.value as CreatorMotion })}>{CREATOR_MOTIONS.map(motion => <option key={motion} value={motion}>{motion === 'pop' ? ui('Von der Mitte', 'Pop in from center') : ui(...MOTION_IN[motion])}</option>)}</select>
                      </Field>
                      <Field label={ui('Schließen', 'Closing animation')}>
                        <select value={layer.outro} onChange={node => updateLayer({ ...layer, outro: node.target.value as CreatorMotion })}>{CREATOR_MOTIONS.map(motion => <option key={motion} value={motion}>{motion === 'pop' ? ui('Zur Mitte', 'Pop out to center') : ui(...MOTION_OUT[motion])}</option>)}</select>
                      </Field>
                    </>
                  )}
                  <Axis label={ui('Drehung', 'Rotation')} axes={[
                    { name: 'X', suffix: '°', value: layer.rotateX, onChange: value => updateLayer({ ...layer, rotateX: value }) },
                    { name: 'Y', suffix: '°', value: layer.rotateY, onChange: value => updateLayer({ ...layer, rotateY: value }) },
                    { name: 'Z', suffix: '°', value: layer.rotation, onChange: value => updateLayer({ ...layer, rotation: value }) }
                  ]} />
                  <Axis label={ui('Verschiebung', 'Translation')} axes={[
                    { name: 'X', suffix: '%', value: layer.translateX, onChange: value => updateLayer({ ...layer, translateX: value }) },
                    { name: 'Y', suffix: '%', value: layer.translateY, onChange: value => updateLayer({ ...layer, translateY: value }) },
                    { name: 'Z', suffix: 'px', value: layer.translateZ, onChange: value => updateLayer({ ...layer, translateZ: value }) }
                  ]} />
                  <Axis label={ui('Position', 'Position')} axes={[
                    { name: 'X', suffix: '%', value: layer.x, onChange: value => updateLayer({ ...layer, x: value }) },
                    { name: 'Y', suffix: '%', value: layer.y, onChange: value => updateLayer({ ...layer, y: value }) },
                    { name: 'W', suffix: '%', value: layer.width, onChange: value => updateLayer({ ...layer, width: value }) },
                    { name: 'H', suffix: '%', value: layer.height, onChange: value => updateLayer({ ...layer, height: value }) }
                  ]} />
                  <Axis label={ui('Anker', 'Anchor')} axes={[
                    { name: 'X', suffix: '%', value: layer.anchorX, onChange: value => updateLayer({ ...layer, anchorX: value }) },
                    { name: 'Y', suffix: '%', value: layer.anchorY, onChange: value => updateLayer({ ...layer, anchorY: value }) }
                  ]} />
                  <Axis label={ui('Neigung', 'Skew')} axes={[
                    { name: 'X', suffix: '°', value: layer.skewX, onChange: value => updateLayer({ ...layer, skewX: value }) },
                    { name: 'Y', suffix: '°', value: layer.skewY, onChange: value => updateLayer({ ...layer, skewY: value }) }
                  ]} />
                  <div className="suite-span">
                    <Field label={ui('Deckkraft', 'Opacity')}><input inputMode="numeric" value={layer.opacity} onChange={node => updateLayer({ ...layer, opacity: Number(node.target.value) || 0 })} /></Field>
                  </div>
                </>
              )}
              {layer.kind === 'video' && (
                <>
                  <label className="suite-upload">
                    {ui('Video hochladen', 'Upload video')}
                    <input type="file" accept="video/mp4,video/webm,.mp4,.webm" onChange={node => {
                      const file = node.target.files?.[0];
                      node.currentTarget.value = '';
                      void uploadLocalVideo(layer, file);
                    }} />
                  </label>
                  {uploadNote && <p className="suite-hint">{uploadNote}</p>}
                  <Field label="URL"><input value={layer.url} onChange={node => updateLayer({ ...layer, url: node.target.value })} /></Field>
                  <Field label={ui('Passung', 'Fit')}>
                    <select value={layer.fit} onChange={node => updateLayer({ ...layer, fit: node.target.value as CreatorLayer['fit'] })}>
                      <option value="contain">{ui('Einpassen', 'Contain')}</option>
                      <option value="cover">{ui('Füllen', 'Cover')}</option>
                    </select>
                  </Field>
                  <Field label={ui('Ecke', 'Radius')}><input inputMode="numeric" value={layer.radius} onChange={node => updateLayer({ ...layer, radius: Number(node.target.value) || 0 })} /></Field>
                  {layer.kind === 'video' && <Field label={ui('Schleife', 'Loop')}><input type="checkbox" checked={layer.loop} onChange={node => updateLayer({ ...layer, loop: node.target.checked })} /></Field>}
                </>
              )}
              <div className="suite-keys">
                <button type="button" onClick={() => {
                  const timeMs = Math.max(0, playhead - layer.startMs);
                  const key = { timeMs, x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, opacity: layer.opacity, ease: 'linear' as CreatorEase };
                  const keyframes = [...layer.keyframes.filter(item => item.timeMs !== timeMs), key].sort((a, b) => a.timeMs - b.timeMs).slice(0, 16);
                  updateLayer({ ...layer, motion: 'keyframes', keyframes });
                }}>{ui('Keyframe', 'Keyframe')}</button>
                {activeKey && (
                  <>
                    <button type="button" onClick={() => setPlayhead(layer.startMs + (layer.keyframes[Math.max(0, layer.keyframes.indexOf(activeKey) - 1)] || activeKey).timeMs)}>{ui('Vorheriger', 'Previous')}</button>
                    <Field label={ui('Zeit', 'Time')}><input inputMode="numeric" value={activeKey.timeMs} onChange={node => updateLayer({ ...layer, keyframes: layer.keyframes.map(key => key === activeKey ? { ...key, timeMs: Number(node.target.value) || 0 } : key) })} /></Field>
                    <button type="button" onClick={() => {
                      const keyframes = layer.keyframes.filter(key => key !== activeKey);
                      updateLayer({ ...layer, motion: keyframes.length ? 'keyframes' : 'basic', keyframes });
                    }}>{ui('Löschen', 'Delete')}</button>
                    <button type="button" onClick={() => setPlayhead(layer.startMs + layer.keyframes[Math.min(layer.keyframes.length - 1, layer.keyframes.indexOf(activeKey) + 1)].timeMs)}>{ui('Nächster', 'Next')}</button>
                    <Field label={ui('Übergang', 'Transition')}>
                      <select value={activeKey.ease} onChange={node => updateLayer({ ...layer, keyframes: layer.keyframes.map(key => key === activeKey ? { ...key, ease: node.target.value as CreatorEase } : key) })}>
                        {CREATOR_EASES.map(ease => <option key={ease} value={ease}>{EASE_LABELS[ease]}</option>)}
                      </select>
                    </Field>
                  </>
                )}
              </div>
              <label className="suite-check"><input type="checkbox" checked={layer.hideOverflow} onChange={node => updateLayer({ ...layer, hideOverflow: node.target.checked })} />{ui('Überstand verstecken', 'Hide overflow')}</label>
              <div className="suite-tools">
                <button type="button" onClick={() => setClipboard(current => ({ ...current, coords: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, anchorX: layer.anchorX, anchorY: layer.anchorY, translateX: layer.translateX, translateY: layer.translateY, translateZ: layer.translateZ, skewX: layer.skewX, skewY: layer.skewY, rotateX: layer.rotateX, rotateY: layer.rotateY, opacity: layer.opacity } }))}>{ui('Koordinaten kopieren', 'Copy coords')}</button>
                <button type="button" disabled={!clipboard.coords} onClick={() => clipboard.coords && updateLayer({ ...layer, ...clipboard.coords })}>{ui('Koordinaten einfügen', 'Paste coords')}</button>
                <button type="button" onClick={() => setClipboard(current => ({ ...current, anim: { intro: layer.intro, outro: layer.outro, motion: layer.motion, keyframes: layer.keyframes.map(key => ({ ...key })) } }))}>{ui('Animation kopieren', 'Copy anim')}</button>
                <button type="button" disabled={!clipboard.anim} onClick={() => clipboard.anim && updateLayer({ ...layer, ...clipboard.anim, keyframes: clipboard.anim.keyframes.map(key => ({ ...key })) })}>{ui('Animation einfügen', 'Paste anim')}</button>
              </div>
              <button type="button" className="suite-danger" onClick={removeSelected}>{ui('Ebene löschen', 'Delete layer')}</button>
            </div>
          )}
          {(layer || rangeOpen) && <div className="suite-duplicate">
            <Field label={ui('Kopieren nach', 'Duplicate onto')}>
              <select value={copyTo} onChange={node => setCopyTo(node.target.value as CreatorEvent)}>
                {CREATOR_EVENTS.filter(id => id !== event).map(id => <option key={id} value={id}>{ui(...EVENT_LABELS[id])}</option>)}
              </select>
            </Field>
            <button type="button" disabled={!clip?.layers.length} onClick={() => {
              if (!clip) return;
              const copy = { ...clip, event: copyTo, id: `clip_${Date.now().toString(36)}`, name: clip.name, layers: clip.layers.map(item => ({ ...item, id: `${item.id}_${copyTo}`, keyframes: item.keyframes.map(key => ({ ...key })) })) };
              commit({ ...config, creator: { clips: [...config.creator.clips, copy] } });
            }}>{ui('Als duplizieren', 'Duplicate as')}</button>
          </div>}
        </aside>
      </div>
    </section>
  );
}
