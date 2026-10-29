import { Fragment, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ALERT_ICON_PATHS, alertPieces, creatorPaintOrder, creatorPose, creatorShapePaint, safeMediaUrl, type AlertBoxConfig, type CreatorClip, type CreatorFit, type CreatorLayer } from '../../alertBox.ts';
import type { StreamAlert } from '../../streamAlerts.ts';
import { AlertFontFaces } from './AlertFontFaces.tsx';

type TimelineMedia = {
  node: HTMLMediaElement;
  startMs: number;
  lengthMs: number;
  loop: boolean;
  volume: number;
};

const timelineMedia = new Set<TimelineMedia>();

/** Scrubbing and play-start align tightly. Playback tolerates this much drift before a seek. */
const SCRUB_DRIFT_SEC = 0.04;
const FOLLOW_DRIFT_SEC = 0.35;

function mediaTime(node: HTMLMediaElement, offsetMs: number, loop: boolean) {
  const seconds = Math.max(0, offsetMs / 1000);
  const duration = node.duration;
  if (!Number.isFinite(duration) || duration <= 0) return seconds;
  if (loop) return seconds % duration;
  return Math.min(seconds, Math.max(0, duration - 0.001));
}

function mediaDrift(node: HTMLMediaElement, target: number, loop: boolean) {
  const time = node.currentTime;
  if (!Number.isFinite(time) || !Number.isFinite(target)) return Number.POSITIVE_INFINITY;
  const duration = node.duration;
  if (loop && Number.isFinite(duration) && duration > 0) {
    const wrapped = ((time - target) % duration + duration) % duration;
    return Math.min(wrapped, duration - wrapped);
  }
  return Math.abs(time - target);
}

/**
 * Identity transforms still promote a layer. `translateZ(0)` under a perspective
 * ancestor makes Chrome resample the video into that layer, so preview frames drop.
 * Omit the transform unless something actually moves.
 */
function layerTransform(layer: CreatorLayer, rotation: number) {
  const has3d = layer.translateZ !== 0 || layer.rotateX !== 0 || layer.rotateY !== 0;
  const parts = [
    layer.translateX !== 0 || layer.translateY !== 0 ? `translate(${layer.translateX}%, ${layer.translateY}%)` : '',
    has3d ? `translateZ(${layer.translateZ}px) rotateX(${layer.rotateX}deg) rotateY(${layer.rotateY}deg)` : '',
    rotation !== 0 ? `rotate(${rotation}deg)` : '',
    layer.skewX !== 0 || layer.skewY !== 0 ? `skew(${layer.skewX}deg, ${layer.skewY}deg)` : ''
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/** Writes currentTime only when the element is outside `limitSec` of the playhead. */
function seekMedia(node: HTMLMediaElement, offsetMs: number, loop: boolean, limitSec: number) {
  try {
    const target = mediaTime(node, offsetMs, loop);
    if (mediaDrift(node, target, loop) <= limitSec) return;
    node.currentTime = target;
  } catch { /* metadata not ready yet */ }
}

function cueMedia(entry: TimelineMedia, elapsedMs: number, play: boolean) {
  const node = entry.node;
  const local = elapsedMs - entry.startMs;
  const inWindow = local >= 0 && local <= entry.lengthMs;
  const level = Math.min(1, Math.max(0, entry.volume));
  node.muted = level <= 0;
  node.volume = level;
  seekMedia(node, Math.min(entry.lengthMs, Math.max(0, local)), entry.loop, SCRUB_DRIFT_SEC);
  if (play && inWindow) void node.play().catch(() => {});
  else node.pause();
}

/** Called from the timeline Play click so audible playback stays inside the user gesture. */
export function playCreatorTimeline(elapsedMs: number) {
  for (const entry of timelineMedia) cueMedia(entry, elapsedMs, true);
}

export function pauseCreatorTimeline() {
  for (const entry of timelineMedia) entry.node.pause();
}

function TimelineClip({
  kind, src, loop, fit, radius, offsetMs, playing, volume, startMs, lengthMs
}: {
  kind: 'video' | 'audio';
  src: string;
  loop: boolean;
  fit: CreatorFit;
  radius: number;
  offsetMs: number;
  playing: boolean;
  volume: number;
  startMs: number;
  lengthMs: number;
}) {
  const nodeRef = useRef<HTMLMediaElement | null>(null);
  const entryRef = useRef<TimelineMedia | null>(null);
  const propsRef = useRef({ startMs, lengthMs, loop, volume });
  propsRef.current = { startMs, lengthMs, loop, volume };
  const wasPlaying = useRef(false);
  const playingRef = useRef(playing);
  const offsetRef = useRef(offsetMs);
  const loopRef = useRef(loop);
  const volumeRef = useRef(volume);
  playingRef.current = playing;
  offsetRef.current = offsetMs;
  loopRef.current = loop;
  volumeRef.current = volume;
  const attachRef = useRef((node: HTMLMediaElement | null) => {
    if (entryRef.current) {
      timelineMedia.delete(entryRef.current);
      entryRef.current = null;
    }
    nodeRef.current = node;
    if (!node) return;
    const entry = { node, ...propsRef.current };
    entryRef.current = entry;
    timelineMedia.add(entry);
  });

  useEffect(() => {
    const entry = entryRef.current;
    if (!entry) return;
    entry.startMs = startMs;
    entry.lengthMs = lengthMs;
    entry.loop = loop;
    entry.volume = volume;
  }, [startMs, lengthMs, loop, volume]);

  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (kind !== 'video') return undefined;
    const parent = nodeRef.current?.parentElement;
    if (!parent) return undefined;
    const fitBox = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width < 1 || height < 1) return;
      setBox(current => current.width === width && current.height === height ? current : { width, height });
    };
    fitBox();
    const observer = new ResizeObserver(fitBox);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [kind, src]);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return undefined;
    const onReady = () => {
      seekMedia(node, offsetRef.current, loopRef.current, SCRUB_DRIFT_SEC);
      if (playingRef.current && node.paused && !(node.ended && !loopRef.current)) void node.play().catch(() => {});
    };
    node.addEventListener('loadedmetadata', onReady);
    return () => node.removeEventListener('loadedmetadata', onReady);
  }, [src]);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const level = Math.min(1, Math.max(0, volumeRef.current));
    node.muted = level <= 0;
    node.volume = level;
    const started = playing && !wasPlaying.current;
    wasPlaying.current = playing;
    if (level <= 0) {
      if (!node.paused) node.pause();
      return;
    }
    if (!playing) {
      if (!node.paused) node.pause();
      seekMedia(node, offsetRef.current, loopRef.current, SCRUB_DRIFT_SEC);
      return;
    }
    // Follow the media clock. A late playhead tick must not seek unless the element itself drifted.
    if (!node.seeking) seekMedia(node, offsetRef.current, loopRef.current, started ? SCRUB_DRIFT_SEC : FOLLOW_DRIFT_SEC);
    if (!node.seeking && node.paused && !(node.ended && !loopRef.current)) void node.play().catch(() => {});
  }, [src, loop, offsetMs, playing, volume]);

  if (kind === 'audio') return <audio ref={attachRef.current} src={src} preload="auto" loop={loop} hidden />;
  const sized = box.width > 0 && box.height > 0;
  return (
    <video
      ref={attachRef.current}
      src={src}
      playsInline
      preload="auto"
      loop={loop}
      draggable={false}
      style={{
        width: sized ? `${box.width}px` : '100%',
        height: sized ? `${box.height}px` : '100%',
        objectFit: fit === 'stretch' ? 'fill' : fit,
        borderRadius: radius > 0 ? radius : undefined
      }}
    />
  );
}

function AlertLine({ template, onChange }: { template: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || document.activeElement === node) return;
    if (node.textContent !== template) node.textContent = template;
  }, [template]);
  return (
    <span
      ref={ref}
      className="creator-text-run"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Alert text"
      onInput={event => onChange(event.currentTarget.textContent ?? '')}
      onBlur={event => {
        if (event.currentTarget.textContent !== template) event.currentTarget.textContent = template;
      }}
    />
  );
}

/** Corners keep the pixel aspect ratio. A line's ends move freely so the stroke can re-angle. Sides change one axis. Sizes stay percentages of the stage. */
const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type ResizeHandle = typeof RESIZE_HANDLES[number];
const MIN_LAYER_PX = 24;
const MIN_LINE_PX = 2;
const MAX_LAYER_PERCENT = 200;
const MAX_OUTSIDE_PERCENT = 50;

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

type ResizeLimits = { minPx?: number; lockCorners?: boolean };

function resizeLimits(layer: CreatorLayer): ResizeLimits | undefined {
  if (layer.kind === 'shape' && layer.shape === 'line') return { minPx: MIN_LINE_PX, lockCorners: false };
  return undefined;
}

function resizeMediaLayer(
  handle: ResizeHandle,
  origin: { x: number; y: number; width: number; height: number },
  dxPx: number,
  dyPx: number,
  stageW: number,
  stageH: number,
  limits?: ResizeLimits
) {
  if (stageW < 1 || stageH < 1) return origin;
  const minPx = limits?.minPx ?? MIN_LAYER_PX;
  const left = (origin.x / 100) * stageW;
  const top = (origin.y / 100) * stageH;
  const width = Math.max(1, (origin.width / 100) * stageW);
  const height = Math.max(1, (origin.height / 100) * stageH);
  const movesLeft = handle.includes('w');
  const movesRight = handle.includes('e');
  const movesTop = handle.includes('n');
  const movesBottom = handle.includes('s');
  const lock = handle.length === 2 && limits?.lockCorners !== false;
  let nextW = width;
  let nextH = height;
  if (movesRight) nextW = width + dxPx;
  if (movesLeft) nextW = width - dxPx;
  if (movesBottom) nextH = height + dyPx;
  if (movesTop) nextH = height - dyPx;
  const outsideX = stageW * (MAX_OUTSIDE_PERCENT / 100);
  const outsideY = stageH * (MAX_OUTSIDE_PERCENT / 100);
  const maxW = stageW * (MAX_LAYER_PERCENT / 100);
  const maxH = stageH * (MAX_LAYER_PERCENT / 100);
  if (lock) {
    const scaleW = nextW / width;
    const scaleH = nextH / height;
    let scale = Math.abs(scaleW - 1) >= Math.abs(scaleH - 1) ? scaleW : scaleH;
    const minScale = Math.max(minPx / width, minPx / height);
    let maxScale = Math.min(maxW / width, maxH / height);
    if (movesRight) maxScale = Math.min(maxScale, (stageW + outsideX - left) / width);
    if (movesLeft) maxScale = Math.min(maxScale, (left + width + outsideX) / width);
    if (movesBottom) maxScale = Math.min(maxScale, (stageH + outsideY - top) / height);
    if (movesTop) maxScale = Math.min(maxScale, (top + height + outsideY) / height);
    scale = Math.min(Math.max(maxScale, minScale), Math.max(minScale, scale));
    nextW = width * scale;
    nextH = height * scale;
  } else {
    if (movesLeft || movesRight) {
      if (movesRight) nextW = Math.min(nextW, stageW + outsideX - left);
      if (movesLeft) nextW = Math.min(nextW, left + width + outsideX);
      nextW = Math.min(maxW, Math.max(minPx, nextW));
    }
    if (movesTop || movesBottom) {
      if (movesBottom) nextH = Math.min(nextH, stageH + outsideY - top);
      if (movesTop) nextH = Math.min(nextH, top + height + outsideY);
      nextH = Math.min(maxH, Math.max(minPx, nextH));
    }
  }
  const nextLeft = movesLeft ? left + width - nextW : left;
  const nextTop = movesTop ? top + height - nextH : top;
  return {
    x: roundPercent((nextLeft / stageW) * 100),
    y: roundPercent((nextTop / stageH) * 100),
    width: roundPercent((nextW / stageW) * 100),
    height: roundPercent((nextH / stageH) * 100)
  };
}

/** Pixel slack before a moving edge eases onto a center or sibling line. Past this, the pointer wins. */
const ALIGN_SNAP_PX = 6;
const ALIGN_MATCH_PX = 1.25;

type AlignBox = { left: number; top: number; right: number; bottom: number };
type GuideKind = 'center' | 'align';
type AlignGuide = { key: string; kind: GuideKind; axis: 'x' | 'y'; x1: number; y1: number; x2: number; y2: number };
type AlignMark = { at: number; kind: GuideKind; spanStart: number; spanEnd: number };

function alignBox(x: number, y: number, width: number, height: number, stageW: number, stageH: number): AlignBox {
  const left = (x / 100) * stageW;
  const top = (y / 100) * stageH;
  return { left, top, right: left + (width / 100) * stageW, bottom: top + (height / 100) * stageH };
}

function alignTargets(layers: readonly CreatorLayer[], skipId: string, stageW: number, stageH: number) {
  const boxes: AlignBox[] = [];
  for (const item of layers) {
    if (item.id === skipId || item.kind === 'sound' || item.role === 'background') continue;
    if (item.width <= 0 || item.height <= 0) continue;
    boxes.push(alignBox(item.x, item.y, item.width, item.height, stageW, stageH));
  }
  return boxes;
}

function xMarks(others: readonly AlignBox[], stageW: number, stageH: number): AlignMark[] {
  const marks: AlignMark[] = [{ at: stageW / 2, kind: 'center', spanStart: 0, spanEnd: stageH }];
  for (const other of others) {
    const mid = (other.left + other.right) / 2;
    for (const at of [other.left, mid, other.right]) marks.push({ at, kind: 'align', spanStart: other.top, spanEnd: other.bottom });
  }
  return marks;
}

function yMarks(others: readonly AlignBox[], stageW: number, stageH: number): AlignMark[] {
  const marks: AlignMark[] = [{ at: stageH / 2, kind: 'center', spanStart: 0, spanEnd: stageW }];
  for (const other of others) {
    const mid = (other.top + other.bottom) / 2;
    for (const at of [other.top, mid, other.bottom]) marks.push({ at, kind: 'align', spanStart: other.left, spanEnd: other.right });
  }
  return marks;
}

/** Smallest shift that lands a source on a mark. Canvas center is listed first, so a tie prefers it. */
function bestShift(sources: readonly number[], marks: readonly AlignMark[]) {
  let best = ALIGN_SNAP_PX + 1;
  let delta = 0;
  for (const source of sources) {
    for (const mark of marks) {
      const next = mark.at - source;
      const distance = Math.abs(next);
      if (distance > ALIGN_SNAP_PX || distance >= best) continue;
      best = distance;
      delta = next;
    }
  }
  return best <= ALIGN_SNAP_PX ? delta : 0;
}

/** Resize moves an edge by `scale` times the center gap, because the center travels half as far as that edge. */
function bestEdge(parts: readonly { value: number; scale: number }[], marks: readonly AlignMark[]) {
  let best = ALIGN_SNAP_PX + 1;
  let edge = 0;
  for (const part of parts) {
    for (const mark of marks) {
      const gap = mark.at - part.value;
      const distance = Math.abs(gap);
      if (distance > ALIGN_SNAP_PX || distance >= best) continue;
      best = distance;
      edge = gap * part.scale;
    }
  }
  return { edge: best <= ALIGN_SNAP_PX ? edge : 0, gap: best <= ALIGN_SNAP_PX ? best : ALIGN_SNAP_PX + 1 };
}

function guidesForAxis(box: AlignBox, marks: readonly AlignMark[], stageW: number, stageH: number, axis: 'x' | 'y'): AlignGuide[] {
  const sources = axis === 'x'
    ? [box.left, (box.left + box.right) / 2, box.right]
    : [box.top, (box.top + box.bottom) / 2, box.bottom];
  const guides: AlignGuide[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    if (!sources.some(source => Math.abs(source - mark.at) <= ALIGN_MATCH_PX)) continue;
    const key = `${axis}:${mark.kind}:${Math.round(mark.at)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (axis === 'x') {
      const top = mark.kind === 'center' ? 0 : Math.min(box.top, mark.spanStart);
      const bottom = mark.kind === 'center' ? stageH : Math.max(box.bottom, mark.spanEnd);
      const x = (mark.at / stageW) * 100;
      guides.push({ key, kind: mark.kind, axis, x1: x, x2: x, y1: (top / stageH) * 100, y2: (bottom / stageH) * 100 });
    } else {
      const left = mark.kind === 'center' ? 0 : Math.min(box.left, mark.spanStart);
      const right = mark.kind === 'center' ? stageW : Math.max(box.right, mark.spanEnd);
      const y = (mark.at / stageH) * 100;
      guides.push({ key, kind: mark.kind, axis, x1: (left / stageW) * 100, x2: (right / stageW) * 100, y1: y, y2: y });
    }
  }
  const centers = new Set(guides.filter(guide => guide.kind === 'center').map(guide => Math.round(axis === 'x' ? guide.x1 : guide.y1)));
  return guides.filter(guide => guide.kind === 'center' || !centers.has(Math.round(axis === 'x' ? guide.x1 : guide.y1)));
}

function percentBox(box: AlignBox, stageW: number, stageH: number) {
  return {
    x: roundPercent((box.left / stageW) * 100),
    y: roundPercent((box.top / stageH) * 100),
    width: roundPercent(((box.right - box.left) / stageW) * 100),
    height: roundPercent(((box.bottom - box.top) / stageH) * 100)
  };
}

function boxInBounds(box: AlignBox, stageW: number, stageH: number, minPx = MIN_LAYER_PX) {
  const outsideX = stageW * (MAX_OUTSIDE_PERCENT / 100);
  const outsideY = stageH * (MAX_OUTSIDE_PERCENT / 100);
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return width >= minPx - 0.5
    && height >= minPx - 0.5
    && width <= stageW * (MAX_LAYER_PERCENT / 100) + 0.5
    && height <= stageH * (MAX_LAYER_PERCENT / 100) + 0.5
    && box.left >= -outsideX - 0.5
    && box.top >= -outsideY - 0.5
    && box.right <= stageW + outsideX + 0.5
    && box.bottom <= stageH + outsideY + 0.5;
}

function snapMove(x: number, y: number, width: number, height: number, others: readonly AlignBox[], stageW: number, stageH: number) {
  const box = alignBox(x, y, width, height, stageW, stageH);
  const vertical = xMarks(others, stageW, stageH);
  const horizontal = yMarks(others, stageW, stageH);
  const dx = bestShift([box.left, (box.left + box.right) / 2, box.right], vertical);
  const dy = bestShift([box.top, (box.top + box.bottom) / 2, box.bottom], horizontal);
  let left = box.left + dx;
  let top = box.top + dy;
  const nx = Math.min(100, Math.max(0, (left / stageW) * 100));
  const ny = Math.min(100, Math.max(0, (top / stageH) * 100));
  left = (roundPercent(nx) / 100) * stageW;
  top = (roundPercent(ny) / 100) * stageH;
  const placed = { left, top, right: left + (box.right - box.left), bottom: top + (box.bottom - box.top) };
  return {
    x: roundPercent(nx),
    y: roundPercent(ny),
    guides: [
      ...guidesForAxis(placed, vertical, stageW, stageH, 'x'),
      ...guidesForAxis(placed, horizontal, stageW, stageH, 'y')
    ]
  };
}

function snapResize(handle: ResizeHandle, next: { x: number; y: number; width: number; height: number }, others: readonly AlignBox[], stageW: number, stageH: number, limits?: ResizeLimits) {
  const minPx = limits?.minPx ?? MIN_LAYER_PX;
  const box = alignBox(next.x, next.y, next.width, next.height, stageW, stageH);
  const movesLeft = handle.includes('w');
  const movesRight = handle.includes('e');
  const movesTop = handle.includes('n');
  const movesBottom = handle.includes('s');
  const lock = handle.length === 2 && limits?.lockCorners !== false;
  const vertical = xMarks(others, stageW, stageH);
  const horizontal = yMarks(others, stageW, stageH);
  const xParts = [
    movesLeft ? { value: box.left, scale: 1 } : null,
    movesRight ? { value: box.right, scale: 1 } : null,
    (movesLeft || movesRight) ? { value: (box.left + box.right) / 2, scale: 2 } : null
  ].filter((part): part is { value: number; scale: number } => part !== null);
  const yParts = [
    movesTop ? { value: box.top, scale: 1 } : null,
    movesBottom ? { value: box.bottom, scale: 1 } : null,
    (movesTop || movesBottom) ? { value: (box.top + box.bottom) / 2, scale: 2 } : null
  ].filter((part): part is { value: number; scale: number } => part !== null);
  const xBest = bestEdge(xParts, vertical);
  const yBest = bestEdge(yParts, horizontal);
  let left = box.left;
  let right = box.right;
  let top = box.top;
  let bottom = box.bottom;
  if (lock) {
    const useX = xBest.gap <= ALIGN_SNAP_PX && xBest.gap <= yBest.gap;
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    if (useX) {
      if (movesRight) right += xBest.edge;
      if (movesLeft) left += xBest.edge;
      let nextW = Math.max(minPx, right - left);
      let nextH = nextW * (height / width);
      if (movesLeft) left = right - nextW;
      else right = left + nextW;
      if (movesTop) top = bottom - nextH;
      else bottom = top + nextH;
    } else if (yBest.gap <= ALIGN_SNAP_PX) {
      if (movesBottom) bottom += yBest.edge;
      if (movesTop) top += yBest.edge;
      let nextH = Math.max(minPx, bottom - top);
      let nextW = nextH * (width / height);
      if (movesTop) top = bottom - nextH;
      else bottom = top + nextH;
      if (movesLeft) left = right - nextW;
      else right = left + nextW;
    }
  } else {
    if (movesRight) right += xBest.edge;
    if (movesLeft) left += xBest.edge;
    if (right - left < minPx) {
      if (movesLeft) left = right - minPx;
      else right = left + minPx;
    }
    if (movesBottom) bottom += yBest.edge;
    if (movesTop) top += yBest.edge;
    if (bottom - top < minPx) {
      if (movesTop) top = bottom - minPx;
      else bottom = top + minPx;
    }
  }
  const placed = { left, top, right, bottom };
  const safe = boxInBounds(placed, stageW, stageH, minPx) ? placed : box;
  const sized = percentBox(safe, stageW, stageH);
  return {
    ...sized,
    guides: [
      ...guidesForAxis(safe, vertical, stageW, stageH, 'x'),
      ...guidesForAxis(safe, horizontal, stageW, stageH, 'y')
    ]
  };
}

/**
 * `fit-content` stops at the slot width, so a wrapped line leaves an empty frame and the
 * selection outline loses its sides where the slot clips them. Measure the longest line
 * and size the text layer to that, plus the 6px padding.
 */
function hugTextLayer(layer: HTMLElement) {
  const text = layer.querySelector('.creator-text');
  if (!(text instanceof HTMLElement)) return;
  const slot = layer.parentElement;
  const cap = slot instanceof HTMLElement ? slot.clientWidth : Number.POSITIVE_INFINITY;
  layer.style.width = 'fit-content';
  const range = document.createRange();
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  let max = 0;
  while (walker.nextNode()) {
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.width > max) max = rect.width;
    }
  }
  const style = getComputedStyle(layer);
  const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  let next = Math.ceil(max + pad);
  if (cap > 0 && next > cap) next = Math.floor(cap);
  layer.style.width = next > 0 ? `${next}px` : 'fit-content';
}

function HugText({ signature }: { signature: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const layer = ref.current?.parentElement;
    if (!(layer instanceof HTMLElement)) return;
    const fit = () => hugTextLayer(layer);
    fit();
    const slot = layer.parentElement;
    const observer = slot instanceof Element ? new ResizeObserver(fit) : null;
    if (slot instanceof Element) observer?.observe(slot);
    const onFonts = () => fit();
    document.fonts?.addEventListener('loadingdone', onFonts);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener('loadingdone', onFonts);
    };
  }, [signature]);
  return <span ref={ref} hidden />;
}

export function CreatorStage({
  clip, alert, config, language, elapsedMs, playing, muted = false, editable = false, selectedId = '', onSelect, onMove, onResize, onText, replayToken = 0
}: {
  clip: CreatorClip;
  alert: StreamAlert;
  config: AlertBoxConfig;
  language: 'de' | 'en';
  elapsedMs: number;
  playing: boolean;
  muted?: boolean;
  editable?: boolean;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, x: number, y: number, width: number, height: number) => void;
  onText?: (id: string, template: string) => void;
  replayToken?: number;
}) {
  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);
  const onSelectRef = useRef(onSelect);
  onMoveRef.current = onMove;
  onResizeRef.current = onResize;
  onSelectRef.current = onSelect;
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  const clearGuides = () => setGuides(current => (current.length ? [] : current));
  const stageRef = useRef<HTMLDivElement>(null);
  const guideClipRef = useRef(clip);
  guideClipRef.current = clip;
  useEffect(() => {
    const onNudge = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; x: number; y: number; width: number; height: number }>).detail;
      const stage = stageRef.current;
      if (!detail || !stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const others = alignTargets(guideClipRef.current.layers, detail.id, rect.width, rect.height);
      const box = alignBox(detail.x, detail.y, detail.width, detail.height, rect.width, rect.height);
      setGuides([
        ...guidesForAxis(box, xMarks(others, rect.width, rect.height), rect.width, rect.height, 'x'),
        ...guidesForAxis(box, yMarks(others, rect.width, rect.height), rect.width, rect.height, 'y')
      ]);
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        setGuides(current => (current.length ? [] : current));
      }
    };
    window.addEventListener('creator-media-nudge', onNudge);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('creator-media-nudge', onNudge);
      window.removeEventListener('keyup', onUp);
    };
  }, []);
  const dragRef = useRef<{
    pointerId: number;
    move: (ev: PointerEvent) => void;
    stop: (ev: PointerEvent) => void;
  } | null>(null);
  useEffect(() => () => {
    const drag = dragRef.current;
    if (!drag) return;
    window.removeEventListener('pointermove', drag.move);
    window.removeEventListener('pointerup', drag.stop);
    window.removeEventListener('pointercancel', drag.stop);
  }, []);
  const place = (layer: CreatorLayer, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || !onMoveRef.current || event.button !== 0) return;
    const writing = event.target instanceof Element ? event.target.closest('[contenteditable="true"]') : null;
    if (writing && document.activeElement === writing) return;
    const node = event.currentTarget;
    const stage = node.closest('.creator-stage');
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    const previous = dragRef.current;
    if (previous) {
      window.removeEventListener('pointermove', previous.move);
      window.removeEventListener('pointerup', previous.stop);
      window.removeEventListener('pointercancel', previous.stop);
    }
    try { node.setPointerCapture(event.pointerId); } catch { /* the pointer can already be gone */ }
    const rect = stage.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = layer.x;
    const originY = layer.y;
    const originWidth = layer.width;
    const originHeight = layer.height;
    const others = alignTargets(clip.layers, layer.id, rect.width, rect.height);
    const pointerId = event.pointerId;
    let dragged = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!dragged && distance < 4) return;
      if (!dragged) {
        dragged = true;
        if (writing instanceof HTMLElement) writing.blur();
      }
      if (rect.width < 1 || rect.height < 1) return;
      const x = originX + ((ev.clientX - startX) / rect.width) * 100;
      const y = originY + ((ev.clientY - startY) / rect.height) * 100;
      const snapped = snapMove(x, y, originWidth, originHeight, others, rect.width, rect.height);
      onMoveRef.current?.(layer.id, snapped.x, snapped.y);
      setGuides(snapped.guides);
    };
    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (dragRef.current?.pointerId === pointerId) dragRef.current = null;
      if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
      clearGuides();
      if (!dragged && writing instanceof HTMLElement) writing.focus();
    };
    dragRef.current = { pointerId, move, stop };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    onSelectRef.current?.(layer.id);
  };
  const beginResize = (layer: CreatorLayer, handle: ResizeHandle, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!editable || !onResizeRef.current || event.button !== 0) return;
    const stage = event.currentTarget.closest('.creator-stage');
    if (!(stage instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const previous = dragRef.current;
    if (previous) {
      window.removeEventListener('pointermove', previous.move);
      window.removeEventListener('pointerup', previous.stop);
      window.removeEventListener('pointercancel', previous.stop);
    }
    const node = event.currentTarget;
    try { node.setPointerCapture(event.pointerId); } catch { /* the pointer can already be gone */ }
    const rect = stage.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    const others = alignTargets(clip.layers, layer.id, rect.width, rect.height);
    const limits = resizeLimits(layer);
    const pointerId = event.pointerId;
    const rotation = -(layer.rotation || 0) * Math.PI / 180;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const rawX = ev.clientX - startX;
      const rawY = ev.clientY - startY;
      const dx = rawX * Math.cos(rotation) - rawY * Math.sin(rotation);
      const dy = rawX * Math.sin(rotation) + rawY * Math.cos(rotation);
      const next = resizeMediaLayer(handle, origin, dx, dy, rect.width, rect.height, limits);
      const snapped = rect.width > 1 && rect.height > 1
        ? snapResize(handle, next, others, rect.width, rect.height, limits)
        : { ...next, guides: [] as AlignGuide[] };
      onResizeRef.current?.(layer.id, snapped.x, snapped.y, snapped.width, snapped.height);
      setGuides(snapped.guides);
    };
    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (dragRef.current?.pointerId === pointerId) dragRef.current = null;
      if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
      clearGuides();
    };
    dragRef.current = { pointerId, move, stop };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    onSelectRef.current?.(layer.id);
  };
  const paintRank = new Map(creatorPaintOrder(clip.layers).map((item, index) => [item.id, index]));
  const perspective = clip.layers.some(item => item.translateZ !== 0 || item.rotateX !== 0 || item.rotateY !== 0);
  return (
    <div ref={stageRef} className="creator-stage" style={perspective ? { perspective: '800px' } : undefined}>
      <AlertFontFaces fonts={config.fonts} />
      {clip.layers.map(layer => {
        const rank = paintRank.get(layer.id) ?? 0;
        const local = elapsedMs - layer.startMs;
        const inWindow = local >= 0 && local <= layer.lengthMs;
        const visible = editable || inWindow;
        const videoSrc = layer.kind === 'video' ? safeMediaUrl(layer.url) : '';
        const soundSrc = layer.kind === 'sound' ? safeMediaUrl(layer.soundUrl) : '';
        if (layer.kind === 'sound') {
          if (!soundSrc) return null;
          const offsetMs = Math.min(layer.lengthMs, Math.max(0, local));
          return (
            <TimelineClip
              key={layer.id}
              kind="audio"
              src={soundSrc}
              loop={layer.loop}
              fit={layer.fit}
              radius={layer.radius}
              offsetMs={offsetMs}
              playing={playing && inWindow}
              volume={muted ? 0 : Math.min(1, Math.max(0, layer.volume / 100))}
              startMs={layer.startMs}
              lengthMs={layer.lengthMs}
            />
          );
        }
        if (!visible && !videoSrc) return null;
        const posed = creatorPose(layer, Math.max(0, local));
        const pose = editable ? layer : posed;
        const introWindow = Math.min(400, layer.lengthMs / 2);
        const motion = !editable && layer.motion === 'basic'
          ? (layer.lengthMs - local <= introWindow ? layer.outro : local <= introWindow ? layer.intro : 'none')
          : 'none';
        const phase = layer.lengthMs - local <= introWindow ? 'out' : 'in';
        const plate = config.plateColor;
        const background = layer.kind === 'image' && layer.role === 'background';
        const offsetMs = Math.min(layer.lengthMs, Math.max(0, local));
        const mediaPlaying = playing && inWindow;
        const transform = layerTransform(layer, pose.rotation);
        // A rounded or overflowing layer has to clip. A plain video must not: overflow
        // hidden on the transformed parent is what resamples every frame.
        const clipLayer = layer.radius > 0 || (layer.kind !== 'video' && layer.hideOverflow);
        const shapePaint = creatorShapePaint(layer);
        const lineShape = layer.kind === 'shape' && layer.shape === 'line';
        const resizable = editable && visible && selectedId === layer.id && !background && (layer.kind === 'image' || layer.kind === 'video' || layer.kind === 'shape');
        const textLayer = layer.kind === 'text';
        const layerNode = (
          <div
            className={`creator-layer ${textLayer ? 'is-text' : ''} ${editable ? 'is-editable' : visible ? `is-${phase} motion-${motion}` : ''} ${selectedId === layer.id ? 'is-selected' : ''} ${background ? 'is-background' : ''}`}
            data-shape={layer.kind === 'shape' ? layer.shape : undefined}
            data-stack={textLayer ? undefined : rank}
            style={{
              left: textLayer ? 'auto' : background ? '0%' : `${pose.x}%`,
              top: textLayer ? 'auto' : background ? '0%' : `${pose.y}%`,
              width: textLayer ? undefined : background ? '100%' : `${pose.width}%`,
              height: textLayer ? 'fit-content' : background ? '100%' : `${pose.height}%`,
              maxWidth: textLayer ? '100%' : undefined,
              position: textLayer ? 'relative' : undefined,
              padding: textLayer ? 6 : undefined,
              opacity: visible ? pose.opacity / 100 : 0,
              visibility: visible ? 'visible' : 'hidden',
              pointerEvents: textLayer ? (editable && visible ? 'auto' : 'none') : editable && visible ? undefined : 'none',
              transform: textLayer ? undefined : transform,
              transformOrigin: !textLayer && transform ? `${layer.anchorX}% ${layer.anchorY}%` : undefined,
              color: layer.color,
              fontSize: layer.fontSize,
              fontFamily: layer.kind === 'text' ? layer.fontFamily : undefined,
              textAlign: layer.align,
              borderRadius: layer.kind === 'shape' ? shapePaint.borderRadius : layer.radius > 0 ? layer.radius : undefined,
              border: layer.kind === 'shape' ? shapePaint.border : undefined,
              overflow: lineShape ? 'visible' : clipLayer ? 'hidden' : 'visible',
              background: layer.kind === 'shape' ? shapePaint.background : layer.plate ? plate : 'transparent',
              zIndex: textLayer ? undefined : rank
            }}
            onPointerDown={event => place(layer, event)}
            onDragStart={event => event.preventDefault()}
          >
            {lineShape && (
              <svg className="creator-shape-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="0" x2="100" y2="100" stroke={layer.stroke ? layer.strokeColor : layer.color} strokeWidth={Math.max(1, layer.stroke && layer.strokeWidth > 0 ? layer.strokeWidth : 4)} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {layer.kind === 'text' && (
              <p
                className={`creator-text ${layer.shadow ? 'has-shadow' : ''} ${layer.stroke ? 'has-stroke' : ''}`}
                style={{ fontFamily: layer.fontFamily, textAlign: layer.align, justifyContent: layer.align === 'left' ? 'flex-start' : layer.align === 'right' ? 'flex-end' : 'center' }}
              >
                {editable
                  ? <AlertLine template={layer.template} onChange={value => onText?.(layer.id, value)} />
                  : alertPieces(layer.template, alert, language).map((piece, index) => (
                    <span key={`${piece.text}-${index}`} className={piece.accent ? 'is-accent' : ''}>{piece.text}</span>
                  ))}
              </p>
            )}
            {textLayer && <HugText signature={`${layer.template}\0${layer.fontSize}\0${layer.fontFamily}\0${layer.align}`} />}
            {layer.kind === 'image' && layer.icon && !safeMediaUrl(layer.url) && (
              <svg className="creator-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d={ALERT_ICON_PATHS[layer.icon]} fill="currentColor" />
              </svg>
            )}
            {layer.kind === 'image' && safeMediaUrl(layer.url) && (
              <img key={layer.gifFromStart ? `${layer.id}-${replayToken}` : layer.id} src={safeMediaUrl(layer.url)} alt="" draggable={false} style={{ objectFit: layer.fit === 'stretch' ? 'fill' : layer.fit, borderRadius: layer.radius }} />
            )}
            {videoSrc && (
              <TimelineClip
                kind="video"
                src={videoSrc}
                loop={layer.loop}
                fit={layer.fit}
                radius={layer.radius}
                offsetMs={offsetMs}
                playing={mediaPlaying}
                volume={muted ? 0 : 1}
                startMs={layer.startMs}
                lengthMs={layer.lengthMs}
              />
            )}
          </div>
        );
        return (
          <Fragment key={layer.id}>
            {textLayer ? (
              <div
                className={`creator-text-slot is-align-${layer.align}`}
                data-stack={rank}
                style={{
                  left: `${pose.x}%`,
                  top: `${pose.y}%`,
                  width: `${pose.width}%`,
                  height: `${pose.height}%`,
                  zIndex: rank,
                  transform,
                  transformOrigin: transform ? `${layer.anchorX}% ${layer.anchorY}%` : undefined,
                  overflow: textLayer ? 'visible' : clipLayer ? 'hidden' : 'visible'
                }}
              >
                {layerNode}
              </div>
            ) : layerNode}
            {resizable && (
              <div
                className="creator-resize-frame"
                style={{
                  left: `${pose.x}%`,
                  top: `${pose.y}%`,
                  width: `${pose.width}%`,
                  height: `${pose.height}%`,
                  zIndex: 30,
                  transform,
                  transformOrigin: transform ? `${layer.anchorX}% ${layer.anchorY}%` : undefined
                }}
              >
                {RESIZE_HANDLES.map(handle => (
                  <span
                    key={handle}
                    className={`creator-resize is-${handle}`}
                    role="slider"
                    aria-label={language === 'de' ? 'Größe ziehen' : 'Drag to resize'}
                    aria-valuemin={MIN_LAYER_PX}
                    aria-valuenow={Math.round(handle.includes('n') || handle.includes('s') ? pose.height : pose.width)}
                    onPointerDown={event => beginResize(layer, handle, event)}
                  />
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
      {guides.length > 0 && (
        <div className="creator-align" style={{ zIndex: 40 }} aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {guides.map(guide => (
              <line key={guide.key} x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2} />
            ))}
          </svg>
          {guides.map(guide => {
            const label = guide.kind === 'center'
              ? (language === 'de' ? 'Zentriert' : 'Centered')
              : (language === 'de' ? 'Ausgerichtet' : 'Aligned');
            const midX = (guide.x1 + guide.x2) / 2;
            const midY = (guide.y1 + guide.y2) / 2;
            return (
              <span
                key={`${guide.key}-hint`}
                className={`creator-align-hint is-${guide.axis}`}
                style={guide.axis === 'x' ? { left: `${guide.x1}%`, top: `${midY}%` } : { left: `${midX}%`, top: `${guide.y1}%` }}
              >{label}</span>
            );
          })}
        </div>
      )}
    </div>
  );
}
