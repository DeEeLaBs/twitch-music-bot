import { normalizeAlertFonts, type AlertFontAsset } from './alertFonts.ts';
import { alertText, type AlertKind, type AlertTier, type StreamAlert } from './streamAlerts.ts';

/** Creator ruler. Ten seconds unless a longer video or sound extends it. */
export const CREATOR_TIMELINE_MIN_MS = 10_000;
/** Long enough for a normal clip. Longer files are trimmed to this cap. */
export const CREATOR_TIMELINE_MAX_MS = 10 * 60 * 1000;

export const ALERT_LAYOUTS = ['text-over', 'media-left', 'media-top'] as const;
export const ALERT_INTROS = ['fade', 'bounce', 'slide', 'zoom', 'none'] as const;
export const ALERT_TEXT_ANIMS = ['none', 'wiggle', 'pulse', 'wave'] as const;
export const ALERT_ALIGNS = ['left', 'center', 'right'] as const;
export const ALERT_MEDIA_FITS = ['contain', 'cover'] as const;
export const ALERT_FONTS = [
  { family: 'Inter, sans-serif', de: 'Inter', en: 'Inter' },
  { family: 'Segoe UI, sans-serif', de: 'Klar', en: 'Clear' },
  { family: '"Arial Narrow", "Roboto Condensed", sans-serif', de: 'Schmal', en: 'Narrow' },
  { family: '"Arial Black", Impact, sans-serif', de: 'Kräftig', en: 'Heavy' },
  { family: 'Impact, "Arial Narrow", sans-serif', de: 'Plakat', en: 'Poster' },
  { family: 'Georgia, serif', de: 'Serife', en: 'Serif' },
  { family: '"Segoe Script", "Brush Script MT", cursive', de: 'Schreibschrift', en: 'Script' },
  { family: 'ui-monospace, monospace', de: 'Mono', en: 'Mono' }
] as const;
export const ALERT_WEIGHTS = [400, 600, 800, 900] as const;
export const CREATOR_EVENTS = ['follow', 'subscription', 'resub', 'gift', 'cheer', 'raid', 'tip', 'host'] as const;
export const CREATOR_LAYER_KINDS = ['text', 'image', 'sound', 'video', 'shape'] as const;
export const CREATOR_SHAPES = ['rectangle', 'rounded', 'ellipse', 'line'] as const;
export const CREATOR_MOTIONS = ['none', 'fade', 'slide-bottom', 'slide-top', 'slide-left', 'slide-right', 'pop', 'flip-x', 'flip-y'] as const;
export const CREATOR_RANGES = ['to-infinite', 'between', 'exactly', 'highest'] as const;
export const CREATOR_EASES = ['none', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'elastic', 'swing', 'swing-in', 'swing-out', 'bounce'] as const;
export const CREATOR_ANCHORS = ['center', 'top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export const CREATOR_FITS = ['contain', 'cover', 'stretch'] as const;
export const CREATOR_ROLES = ['content', 'background'] as const;
export const CREATOR_TIERS = ['', 'prime', '1000', '2000', '3000'] as const;
export const CREATOR_MESSAGES = ['all', 'with', 'without'] as const;
export const RANGE_EVENTS = ['cheer', 'gift', 'raid', 'tip', 'host'] as const;
export const ALERT_ICONS = ['heart', 'star', 'bits', 'crown', 'bolt'] as const;
export const ALERT_FX = ['pop-center', 'slide-up', 'flip', 'fade'] as const;
export type AlertLayout = typeof ALERT_LAYOUTS[number];
export type AlertIntro = typeof ALERT_INTROS[number];
export type AlertTextAnim = typeof ALERT_TEXT_ANIMS[number];
export type AlertAlign = typeof ALERT_ALIGNS[number];
export type AlertMediaFit = typeof ALERT_MEDIA_FITS[number];
export type CreatorEvent = typeof CREATOR_EVENTS[number];
export type CreatorLayerKind = typeof CREATOR_LAYER_KINDS[number];
export type CreatorShape = typeof CREATOR_SHAPES[number];
export type CreatorMotion = typeof CREATOR_MOTIONS[number];
export type CreatorRange = typeof CREATOR_RANGES[number];
export type CreatorEase = typeof CREATOR_EASES[number];
export type CreatorAnchor = typeof CREATOR_ANCHORS[number];
export type CreatorFit = typeof CREATOR_FITS[number];
export type CreatorRole = typeof CREATOR_ROLES[number];
export type AlertIcon = typeof ALERT_ICONS[number];
export type AlertFx = typeof ALERT_FX[number];
export const ALERT_ICON_PATHS: Record<AlertIcon, string> = {
  heart: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10z',
  star: 'M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.7L12 17.8 6 20.3l1.5-6.7L2.2 9l6.9-.7z',
  bits: 'M12 2 22 12 12 22 2 12z',
  crown: 'M3 18h18l-1.5-9-5 5-3.5-7-3.5 7-5-5z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z'
};
export const ANCHOR_POINT: Record<CreatorAnchor, [number, number]> = {
  center: [50, 50], top: [50, 0], bottom: [50, 100], left: [0, 50], right: [100, 50],
  'top-left': [0, 0], 'top-right': [100, 0], 'bottom-left': [0, 100], 'bottom-right': [100, 100]
};

export interface CreatorKeyframe {
  timeMs: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  ease: CreatorEase;
}

export interface CreatorLayer {
  id: string;
  kind: CreatorLayerKind;
  startMs: number;
  lengthMs: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  anchor: CreatorAnchor;
  opacity: number;
  intro: CreatorMotion;
  outro: CreatorMotion;
  motion: 'basic' | 'keyframes';
  keyframes: CreatorKeyframe[];
  template: string;
  align: AlertAlign;
  fontSize: number;
  fontFamily: string;
  color: string;
  shadow: boolean;
  stroke: boolean;
  shape: CreatorShape;
  strokeWidth: number;
  strokeColor: string;
  plate: boolean;
  soundUrl: string;
  volume: number;
  url: string;
  fit: CreatorFit;
  radius: number;
  loop: boolean;
  role: CreatorRole;
  gifFromStart: boolean;
  rotateX: number;
  rotateY: number;
  translateX: number;
  translateY: number;
  translateZ: number;
  anchorX: number;
  anchorY: number;
  skewX: number;
  skewY: number;
  icon: AlertIcon | '';
  hideOverflow: boolean;
}

export const ALERT_FRAMES = ['fullscreen', 'square'] as const;
export type AlertFrame = typeof ALERT_FRAMES[number];

export function alertFrame(value: unknown): AlertFrame {
  return value === 'square' ? 'square' : 'fullscreen';
}

/** Design size of the alert stage. Layer x/y/width/height stay percentages of this box.
 *  With no saved size, fullscreen is 1920×1080 and square is 1080×1080.
 *  A saved size keeps its height: square makes both edges that height, fullscreen makes a 16:9 width from it. */
export function alertFrameSize(frame: AlertFrame, current?: { width?: unknown; height?: unknown } | null): { width: number; height: number } {
  const base = frame === 'square' ? { width: 1080, height: 1080 } : { width: 1920, height: 1080 };
  if (!current || (current.width == null && current.height == null)) return base;
  const height = clamp(current.height, 64, 7680, base.height);
  const width = clamp(current.width, 64, 7680, base.width);
  if (frame === 'square') {
    const edge = current.height == null ? width : height;
    return { width: edge, height: edge };
  }
  const edge = current.height == null ? Math.max(64, Math.round(width * 9 / 16)) : height;
  return { width: Math.round(edge * 16 / 9), height: edge };
}

/** Stage pixels for `resolution` inside `box`. Never scales up; a larger browser source keeps the resolution and centers the stage. */
export function containAlertResolution(resolution: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number } {
  const width = Number(box.width);
  const height = Number(box.height);
  if (!(width > 0) || !(height > 0) || !(resolution.width > 0) || !(resolution.height > 0)) {
    return { width: Math.max(1, resolution.width), height: Math.max(1, resolution.height) };
  }
  const scale = Math.min(1, width / resolution.width, height / resolution.height);
  return {
    width: Math.max(1, Math.floor(resolution.width * scale)),
    height: Math.max(1, Math.floor(resolution.height * scale))
  };
}

/** Largest stage of `frame` that fits inside `box`, in CSS pixels. */
export function fitAlertFrame(frame: AlertFrame, box: { width: number; height: number }): { width: number; height: number } {
  const size = alertFrameSize(frame);
  const width = Number(box.width);
  const height = Number(box.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(width / size.width, height / size.height);
  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
}

export interface CreatorClip {
  id: string;
  name: string;
  event: CreatorEvent;
  range: CreatorRange;
  min: number;
  max: number;
  tier: AlertTier | '';
  message: 'all' | 'with' | 'without';
  frame: AlertFrame;
  width: number;
  height: number;
  layers: CreatorLayer[];
}

export interface AlertCreator {
  clips: CreatorClip[];
}

export type { AlertFontAsset };

export interface AlertMatch {
  months: number;
  monthMin: number;
  tier: AlertTier | '';
  exactAmount: number;
  minAmount: number;
  maxAmount: number;
  minViewers: number;
}

export interface AlertVariation {
  id: string;
  name: string;
  kind: AlertKind;
  enabled: boolean;
  match: AlertMatch;
  template: string;
  mediaUrl: string;
  soundUrl: string;
  volume: number;
  layout: AlertLayout;
  durationMs: number;
  textDelayMs: number;
  introMs: number;
  outroMs: number;
  intro: AlertIntro;
  outro: AlertIntro;
  textAnim: AlertTextAnim;
}

export interface AlertSpeech {
  enabled: boolean;
  minAmount: number;
  voice: string;
  pitch: number;
  volume: number;
  announce: boolean;
  repeatLimit: number;
  blacklist: string;
}

export interface AlertBoxConfig {
  version: 1;
  /** Stage shape for every creator clip. A saved choice wins; if it was never stored, clips that already share one shape keep it. Missing data stays fullscreen. */
  frame: AlertFrame;
  layout: AlertLayout;
  durationMs: number;
  textDelayMs: number;
  introMs: number;
  outroMs: number;
  intro: AlertIntro;
  outro: AlertIntro;
  textAnim: AlertTextAnim;
  template: string;
  mediaUrl: string;
  soundUrl: string;
  volume: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  accent: string;
  shadow: boolean;
  shadowStrength: number;
  stroke: boolean;
  strokeWidth: number;
  strokeColor: string;
  plateColor: string;
  plateOpacity: number;
  radius: number;
  align: AlertAlign;
  mediaFit: AlertMediaFit;
  mediaRadius: number;
  speech: AlertSpeech;
  customCss: string;
  customHtml: string;
  variations: AlertVariation[];
  creator: AlertCreator;
  fonts: AlertFontAsset[];
}

export interface AlertPiece { text: string; accent: boolean }

export interface AlertPlan {
  layout: AlertLayout;
  durationMs: number;
  textDelayMs: number;
  introMs: number;
  outroMs: number;
  intro: AlertIntro;
  outro: AlertIntro;
  textAnim: AlertTextAnim;
  mediaUrl: string;
  soundUrl: string;
  volume: number;
  pieces: AlertPiece[];
  speech: string;
  totalMs: number;
  variationId: string;
}

const KINDS: AlertKind[] = ['follow', 'subscription', 'resub', 'gift', 'communitygift', 'tip', 'cheer', 'raid', 'host'];
const TIERS: Array<AlertTier | ''> = ['', 'prime', '1000', '2000', '3000'];

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}
function text(value: unknown, max: number) {
  return String(value || '').slice(0, max);
}
function color(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

export function emptyMatch(): AlertMatch {
  return { months: 0, monthMin: 0, tier: '', exactAmount: 0, minAmount: 0, maxAmount: 0, minViewers: 0 };
}

export function defaultAlertBox(): AlertBoxConfig {
  return {
    version: 1,
    frame: 'fullscreen',
    layout: 'text-over',
    durationMs: 10000,
    textDelayMs: 0,
    introMs: 400,
    outroMs: 400,
    intro: 'fade',
    outro: 'fade',
    textAnim: 'none',
    template: '{name}',
    mediaUrl: '',
    soundUrl: '',
    volume: 80,
    fontFamily: 'Inter, sans-serif',
    fontSize: 28,
    fontWeight: 800,
    color: '#ffffff',
    accent: '#f0abfc',
    shadow: true,
    shadowStrength: 50,
    stroke: false,
    strokeWidth: 1,
    strokeColor: '#000000',
    plateColor: '#09090b',
    plateOpacity: 72,
    radius: 16,
    align: 'center',
    mediaFit: 'contain',
    mediaRadius: 0,
    speech: { enabled: false, minAmount: 100, voice: '', pitch: 1, volume: 80, announce: true, repeatLimit: 4, blacklist: '' },
    customCss: '',
    customHtml: '',
    variations: [],
    creator: { clips: [] },
    fonts: []
  };
}

export function emptyCreatorLayer(kind: CreatorLayerKind, index: number): CreatorLayer {
  return {
    id: `layer_${index + 1}`,
    kind,
    startMs: 0,
    lengthMs: 4000,
    x: 10,
    y: 20 + index * 8,
    width: kind === 'sound' ? 40 : 60,
    height: kind === 'sound' ? 12 : 30,
    rotation: 0,
    anchor: 'center',
    opacity: 100,
    intro: 'fade',
    outro: 'fade',
    motion: 'basic',
    keyframes: [],
    template: '{name}',
    align: 'center',
    fontSize: 28,
    fontFamily: 'Inter, sans-serif',
    color: kind === 'shape' ? '#7c3aed' : '#ffffff',
    shadow: true,
    stroke: false,
    shape: 'rectangle',
    strokeWidth: 4,
    strokeColor: '#ffffff',
    plate: false,
    soundUrl: '',
    volume: 80,
    url: '',
    fit: 'contain',
    radius: 0,
    loop: false,
    role: 'content',
    gifFromStart: false,
    rotateX: 0,
    rotateY: 0,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    anchorX: 50,
    anchorY: 50,
    skewX: 0,
    skewY: 0,
    icon: '',
    hideOverflow: true
  };
}

/** New shape layer. A line is short; a rounded rectangle starts with a corner; an ellipse starts square. */
export function placeCreatorShape(index: number, shape: CreatorShape): CreatorLayer {
  const layer = emptyCreatorLayer('shape', index);
  return assignCreatorShape(layer, shape, true);
}

/** Switch the form of a shape layer. Corners follow the form. A fresh line is thin; an existing box stays where it is. */
export function assignCreatorShape(layer: CreatorLayer, shape: CreatorShape, fresh = false): CreatorLayer {
  const next: CreatorLayer = { ...layer, kind: 'shape', shape };
  if (shape === 'rectangle') next.radius = 0;
  if (shape === 'rounded' && next.radius < 4) next.radius = 16;
  if (shape === 'ellipse' && fresh) {
    next.width = 32;
    next.height = 32;
  }
  if (shape === 'line' && fresh) {
    next.height = 4;
    next.width = 72;
    next.y = 48;
  }
  return next;
}

/** Fill and stroke for a shape layer. Missing forms stay a rectangle, or a rounded one when a corner was already saved. */
export function creatorShapePaint(layer: Pick<CreatorLayer, 'kind' | 'shape' | 'color' | 'radius' | 'stroke' | 'strokeWidth' | 'strokeColor'>): { background?: string; borderRadius?: number | string; border?: string } {
  if (layer.kind !== 'shape') return {};
  const form = CREATOR_SHAPES.includes(layer.shape) ? layer.shape : layer.radius > 0 ? 'rounded' : 'rectangle';
  const border = layer.stroke && layer.strokeWidth > 0 ? `${layer.strokeWidth}px solid ${layer.strokeColor}` : undefined;
  if (form === 'ellipse') return { background: layer.color, borderRadius: '50%', border };
  if (form === 'rounded') return { background: layer.color, borderRadius: Math.max(1, layer.radius), border };
  if (form === 'line') return { background: 'transparent' };
  return { background: layer.color, border };
}

function matchFrom(value: Partial<AlertMatch> | undefined): AlertMatch {
  const empty = emptyMatch();
  return {
    months: clamp(value?.months, 0, 240, empty.months),
    monthMin: clamp(value?.monthMin, 0, 240, empty.monthMin),
    tier: oneOf(value?.tier, TIERS, ''),
    exactAmount: clamp(value?.exactAmount, 0, 1_000_000, 0),
    minAmount: clamp(value?.minAmount, 0, 1_000_000, 0),
    maxAmount: clamp(value?.maxAmount, 0, 1_000_000, 0),
    minViewers: clamp(value?.minViewers, 0, 1_000_000, 0)
  };
}

function variationFrom(value: Partial<AlertVariation>, index: number): AlertVariation {
  const base = defaultAlertBox();
  return {
    id: text(value.id, 40) || `var_${index + 1}`,
    name: text(value.name, 40) || `Variation ${index + 1}`,
    kind: oneOf(value.kind, KINDS, 'cheer'),
    enabled: value.enabled !== false,
    match: matchFrom(value.match),
    template: text(value.template, 240) || base.template,
    mediaUrl: text(value.mediaUrl, 500),
    soundUrl: text(value.soundUrl, 500),
    volume: clamp(value.volume, 0, 100, 80),
    layout: oneOf(value.layout, ALERT_LAYOUTS, base.layout),
    durationMs: clamp(value.durationMs, 1000, 30000, base.durationMs),
    textDelayMs: clamp(value.textDelayMs, 0, 10000, 0),
    introMs: clamp(value.introMs, 0, 4000, base.introMs),
    outroMs: clamp(value.outroMs, 0, 4000, base.outroMs),
    intro: oneOf(value.intro, ALERT_INTROS, base.intro),
    outro: oneOf(value.outro, ALERT_INTROS, base.outro),
    textAnim: oneOf(value.textAnim, ALERT_TEXT_ANIMS, 'none')
  };
}

function sharedAlertFrame(value: unknown, clips: CreatorClip[]): AlertFrame {
  if (value === 'square' || value === 'fullscreen') return value;
  if (clips.length > 0 && clips.every(clip => clip.frame === clips[0].frame)) return clips[0].frame;
  return 'fullscreen';
}

export function normalizeAlertBox(input: unknown): AlertBoxConfig {
  const base = defaultAlertBox();
  if (!input || typeof input !== 'object') return base;
  const raw = input as Partial<AlertBoxConfig>;
  const speech = raw.speech || base.speech;
  const creator = creatorFrom(raw.creator);
  const frame = sharedAlertFrame(raw.frame, creator.clips);
  return {
    ...base,
    layout: oneOf(raw.layout, ALERT_LAYOUTS, base.layout),
    durationMs: clamp(raw.durationMs, 1000, CREATOR_TIMELINE_MAX_MS, base.durationMs),
    textDelayMs: clamp(raw.textDelayMs, 0, 10000, base.textDelayMs),
    introMs: clamp(raw.introMs, 0, 4000, base.introMs),
    outroMs: clamp(raw.outroMs, 0, 4000, base.outroMs),
    intro: oneOf(raw.intro, ALERT_INTROS, base.intro),
    outro: oneOf(raw.outro, ALERT_INTROS, base.outro),
    textAnim: oneOf(raw.textAnim, ALERT_TEXT_ANIMS, base.textAnim),
    template: text(raw.template, 240) || base.template,
    mediaUrl: text(raw.mediaUrl, 500),
    soundUrl: text(raw.soundUrl, 500),
    volume: clamp(raw.volume, 0, 100, base.volume),
    fontFamily: text(raw.fontFamily, 80) || base.fontFamily,
    fontSize: clamp(raw.fontSize, 12, 96, base.fontSize),
    fontWeight: clamp(raw.fontWeight, 400, 900, base.fontWeight),
    color: color(raw.color, base.color),
    accent: color(raw.accent, base.accent),
    shadow: raw.shadow !== false,
    shadowStrength: clamp(raw.shadowStrength, 0, 100, base.shadowStrength),
    stroke: raw.stroke === true,
    strokeWidth: clamp(raw.strokeWidth, 0, 8, base.strokeWidth),
    strokeColor: color(raw.strokeColor, base.strokeColor),
    plateColor: color(raw.plateColor, base.plateColor),
    plateOpacity: clamp(raw.plateOpacity, 0, 100, base.plateOpacity),
    radius: clamp(raw.radius, 0, 48, base.radius),
    align: oneOf(raw.align, ALERT_ALIGNS, base.align),
    mediaFit: oneOf(raw.mediaFit, ALERT_MEDIA_FITS, base.mediaFit),
    mediaRadius: clamp(raw.mediaRadius, 0, 48, base.mediaRadius),
    speech: {
      enabled: speech.enabled === true,
      minAmount: clamp(speech.minAmount, 0, 1_000_000, base.speech.minAmount),
      voice: text(speech.voice, 80),
      pitch: Math.min(2, Math.max(0.5, Number(speech.pitch) || 1)),
      volume: clamp(speech.volume, 0, 100, base.speech.volume),
      announce: speech.announce !== false,
      repeatLimit: clamp(speech.repeatLimit, 1, 12, base.speech.repeatLimit),
      blacklist: text(speech.blacklist, 500)
    },
    customCss: text(raw.customCss, 4000),
    customHtml: text(raw.customHtml, 8000),
    variations: (Array.isArray(raw.variations) ? raw.variations : []).slice(0, 12).map(variationFrom),
    frame,
    creator: raw.frame === 'square' || raw.frame === 'fullscreen' ? applyAlertFrame({ ...base, creator }, frame).creator : creator,
    fonts: normalizeAlertFonts(raw.fonts)
  };
}

function keyframeFrom(value: Partial<CreatorKeyframe> | undefined, index: number): CreatorKeyframe {
  return {
    timeMs: clamp(value?.timeMs, 0, CREATOR_TIMELINE_MAX_MS, index * 500),
    x: clamp(value?.x, 0, 100, 10),
    y: clamp(value?.y, 0, 100, 20),
    width: clamp(value?.width, 4, 100, 60),
    height: clamp(value?.height, 4, 100, 30),
    rotation: clamp(value?.rotation, -360, 360, 0),
    opacity: clamp(value?.opacity, 0, 100, 100),
    ease: oneOf(value?.ease, CREATOR_EASES, 'linear')
  };
}

function layerFrom(value: Partial<CreatorLayer>, index: number): CreatorLayer {
  const kind = oneOf(value.kind, CREATOR_LAYER_KINDS, 'text');
  const empty = emptyCreatorLayer(kind, index);
  const anchor = oneOf(value.anchor, CREATOR_ANCHORS, 'center');
  const [fallbackX, fallbackY] = ANCHOR_POINT[anchor];
  return {
    ...empty,
    id: text(value.id, 40) || empty.id,
    kind,
    startMs: clamp(value.startMs, 0, CREATOR_TIMELINE_MAX_MS, 0),
    lengthMs: clamp(value.lengthMs, 200, CREATOR_TIMELINE_MAX_MS, empty.lengthMs),
    x: clamp(value.x, 0, 100, empty.x),
    y: clamp(value.y, 0, 100, empty.y),
    width: clamp(value.width, 4, 100, empty.width),
    height: clamp(value.height, 4, 100, empty.height),
    rotation: clamp(value.rotation, -360, 360, 0),
    anchor,
    opacity: clamp(value.opacity, 0, 100, 100),
    intro: oneOf(value.intro, CREATOR_MOTIONS, 'fade'),
    outro: oneOf(value.outro, CREATOR_MOTIONS, 'fade'),
    motion: value.motion === 'keyframes' ? 'keyframes' : 'basic',
    keyframes: (Array.isArray(value.keyframes) ? value.keyframes : []).slice(0, 16).map(keyframeFrom),
    template: text(value.template, 240) || empty.template,
    align: oneOf(value.align, ALERT_ALIGNS, 'center'),
    fontSize: clamp(value.fontSize, 12, 96, empty.fontSize),
    fontFamily: text(value.fontFamily, 120) || empty.fontFamily,
    color: color(value.color, empty.color),
    shadow: value.shadow !== false,
    stroke: value.stroke === true,
    shape: oneOf(value.shape, CREATOR_SHAPES, clamp(value.radius, 0, 48, 0) > 0 ? 'rounded' : 'rectangle'),
    strokeWidth: clamp(value.strokeWidth, 0, 64, empty.strokeWidth),
    strokeColor: color(value.strokeColor, empty.strokeColor),
    plate: value.plate === true,
    soundUrl: text(value.soundUrl, 500),
    volume: clamp(value.volume, 0, 100, 80),
    url: text(value.url, 500),
    fit: oneOf(value.fit, CREATOR_FITS, 'contain'),
    radius: clamp(value.radius, 0, 48, 0),
    loop: value.loop === true,
    role: oneOf(value.role, CREATOR_ROLES, 'content'),
    gifFromStart: value.gifFromStart === true,
    rotateX: clamp(value.rotateX, -360, 360, 0),
    rotateY: clamp(value.rotateY, -360, 360, 0),
    translateX: clamp(value.translateX, -200, 200, 0),
    translateY: clamp(value.translateY, -200, 200, 0),
    translateZ: clamp(value.translateZ, -400, 400, 0),
    anchorX: clamp(value.anchorX, 0, 100, fallbackX),
    anchorY: clamp(value.anchorY, 0, 100, fallbackY),
    skewX: clamp(value.skewX, -180, 180, 0),
    skewY: clamp(value.skewY, -180, 180, 0),
    icon: ALERT_ICONS.includes(value.icon as AlertIcon) ? value.icon as AlertIcon : '',
    hideOverflow: value.hideOverflow !== false
  };
}

export function blankClip(event: CreatorEvent, index = 0, frame: AlertFrame = 'fullscreen'): CreatorClip {
  const size = alertFrameSize(frame);
  return {
    id: `clip_${event}_${index + 1}`,
    name: '',
    event,
    range: 'to-infinite',
    min: 1,
    max: 100,
    tier: '',
    message: 'all',
    frame,
    width: size.width,
    height: size.height,
    layers: []
  };
}

/** Stores one stage shape on the alert box and on every creator clip. Layers stay put; each clip keeps its height and takes the matching square or 16:9 size. */
export function applyAlertFrame(config: AlertBoxConfig, frame: AlertFrame): AlertBoxConfig {
  const next = alertFrame(frame);
  return {
    ...config,
    frame: next,
    creator: {
      ...config.creator,
      clips: config.creator.clips.map(clip => {
        const size = alertFrameSize(next, clip);
        if (clip.frame === next && clip.width === size.width && clip.height === size.height) return clip;
        return { ...clip, frame: next, width: size.width, height: size.height };
      })
    }
  };
}

export function applyAlertFx(layer: CreatorLayer, fx: AlertFx): CreatorLayer {
  if (fx === 'pop-center') return { ...layer, motion: 'basic', intro: 'pop', outro: 'pop' };
  if (fx === 'slide-up') return { ...layer, motion: 'basic', intro: 'slide-bottom', outro: 'slide-bottom' };
  if (fx === 'flip') return { ...layer, motion: 'basic', intro: 'flip-y', outro: 'flip-y' };
  return { ...layer, motion: 'basic', intro: 'fade', outro: 'fade' };
}

const TEMPLATE_TEXT: Record<CreatorEvent, [string, string]> = {
  follow: ['{name} folgt jetzt', '{name} followed'],
  subscription: ['{name} hat abonniert', '{name} subscribed'],
  resub: ['{name} seit {months} Monaten', '{name} for {months} months'],
  gift: ['{name} schenkt {amount}', '{name} gifted {amount}'],
  cheer: ['{name} cheert {amount}', '{name} cheered {amount}'],
  raid: ['{name} raidet mit {viewers}', '{name} raids with {viewers}'],
  tip: ['{name} spendet {amount}', '{name} donated {amount}'],
  host: ['{name} hostet mit {viewers}', '{name} hosts with {viewers}']
};

const TEMPLATE_ICON: Record<CreatorEvent, AlertIcon> = {
  follow: 'star', subscription: 'crown', resub: 'crown', gift: 'crown',
  cheer: 'bits', raid: 'bolt', tip: 'heart', host: 'bolt'
};

export function templateLayers(event: CreatorEvent, language: 'de' | 'en' = 'de'): CreatorLayer[] {
  const shape = emptyCreatorLayer('shape', 0);
  shape.id = 'layer_bar';
  shape.role = 'background';
  shape.x = 4;
  shape.y = 22;
  shape.width = 92;
  shape.height = 52;
  shape.radius = 16;
  shape.shape = 'rounded';
  shape.opacity = 70;
  const icon = emptyCreatorLayer('image', 1);
  icon.id = 'layer_icon';
  icon.icon = TEMPLATE_ICON[event];
  icon.x = 8;
  icon.y = 28;
  icon.width = 22;
  icon.height = 40;
  icon.intro = 'pop';
  icon.outro = 'pop';
  icon.color = '#f0abfc';
  const text = emptyCreatorLayer('text', 2);
  text.id = 'layer_text';
  text.template = TEMPLATE_TEXT[event][language === 'de' ? 0 : 1];
  text.x = 32;
  text.y = 30;
  text.width = 60;
  text.height = 36;
  text.intro = 'slide-left';
  return [shape, icon, text];
}

/** Saved layer order is the stack. Later layers are in front. Sound stays in that order and is never painted. */
export function creatorPaintOrder<T extends { kind: string }>(layers: readonly T[]): T[] {
  return layers.filter(layer => layer.kind !== 'sound');
}

/** Places `id` at `toIndex` in the saved stack. Later indexes paint in front. Layer timing is left untouched. */
export function moveCreatorLayer<T extends { id: string }>(layers: readonly T[], id: string, toIndex: number): T[] {
  const current = layers.find(layer => layer.id === id);
  if (!current) return [...layers];
  const next = layers.filter(layer => layer.id !== id);
  const index = Math.max(0, Math.min(next.length, Math.round(toIndex)));
  next.splice(index, 0, current);
  return next;
}

function creatorFrom(value: AlertCreator | undefined): AlertCreator {
  const clips = Array.isArray(value?.clips) ? value.clips : [];
  const counts = new Map<CreatorEvent, number>();
  const next: CreatorClip[] = [];
  for (const clip of clips) {
    if (next.length >= 32) break;
    const event = oneOf(clip?.event, CREATOR_EVENTS, 'follow');
    const count = counts.get(event) || 0;
    if (count >= 8) continue;
    counts.set(event, count + 1);
    const frame = alertFrame(clip?.frame);
    const size = alertFrameSize(frame, clip);
    next.push({
      id: text(clip?.id, 40) || `clip_${event}_${count + 1}`,
      name: text(clip?.name, 40),
      event,
      range: oneOf(clip?.range, CREATOR_RANGES, 'to-infinite'),
      min: clamp(clip?.min, 0, 1_000_000, 1),
      max: clamp(clip?.max, 0, 1_000_000, 100),
      tier: oneOf(clip?.tier, CREATOR_TIERS, ''),
      message: oneOf(clip?.message, CREATOR_MESSAGES, 'all'),
      frame,
      width: size.width,
      height: size.height,
      layers: (Array.isArray(clip?.layers) ? clip.layers : []).slice(0, 24).map(layerFrom)
    });
  }
  return { clips: next };
}

function rangeMatches(clip: CreatorClip, alert: StreamAlert): boolean {
  if (!RANGE_EVENTS.includes(alert.kind as typeof RANGE_EVENTS[number])) return true;
  const amount = alert.kind === 'raid' || alert.kind === 'host' ? (alert.viewers || alert.amount) : alert.amount;
  if (clip.range === 'between') return amount >= clip.min && amount <= clip.max;
  if (clip.range === 'exactly') return amount === clip.min;
  if (clip.range === 'to-infinite') return amount >= clip.min;
  return true;
}

export function creatorClipFor(config: AlertBoxConfig, alert: StreamAlert): CreatorClip | null {
  const rank: Record<CreatorRange, number> = { exactly: 3, between: 2, highest: 1, 'to-infinite': 0 };
  const matched = config.creator.clips
    .map((clip, index) => ({ clip, index }))
    .filter(({ clip }) => {
      if (clip.event !== alert.kind || !clip.layers.length || !rangeMatches(clip, alert)) return false;
      if (clip.tier && (alert.kind === 'subscription' || alert.kind === 'resub' || alert.kind === 'gift') && alert.tier !== clip.tier) return false;
      if ((alert.kind === 'cheer' || alert.kind === 'tip') && clip.message === 'with' && !alert.message.trim()) return false;
      if ((alert.kind === 'cheer' || alert.kind === 'tip') && clip.message === 'without' && alert.message.trim()) return false;
      return true;
    })
    .sort((a, b) => rank[b.clip.range] - rank[a.clip.range] || Number(Boolean(b.clip.tier)) - Number(Boolean(a.clip.tier)) || a.index - b.index);
  return matched[0]?.clip ?? null;
}

export function alertForClip(clip: CreatorClip): StreamAlert {
  const raid = clip.event === 'raid' || clip.event === 'host';
  const amount = clip.range === 'between' ? Math.min(clip.min, clip.max) : clip.min;
  const count = Math.max(0, amount);
  const months = clip.event === 'resub' ? Math.max(1, count) : clip.event === 'subscription' ? 1 : 0;
  return {
    id: `creator-${clip.id}`,
    kind: clip.event,
    user: 'Viewer',
    amount: clip.event === 'resub' ? months : count,
    createdAt: 0,
    message: clip.message === 'without' ? '' : 'Hello',
    months,
    tier: clip.tier,
    currency: clip.event === 'tip' ? 'EUR' : '',
    viewers: raid ? count : 0
  };
}

function easeUnit(t: number, ease: CreatorEase): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (ease === 'none') return clamped >= 1 ? 1 : 0;
  if (ease === 'ease-in') return clamped * clamped;
  if (ease === 'ease-out') return 1 - (1 - clamped) * (1 - clamped);
  if (ease === 'ease-in-out') return clamped < 0.5 ? 2 * clamped * clamped : 1 - ((-2 * clamped + 2) ** 2) / 2;
  if (ease === 'bounce') return 1 - Math.abs(Math.cos(clamped * Math.PI * 2.5)) * (1 - clamped);
  if (ease === 'elastic') return clamped === 0 || clamped === 1 ? clamped : 2 ** (-10 * clamped) * Math.sin((clamped * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
  if (ease === 'swing-in') return clamped * clamped * (2.5 * clamped - 1.5);
  if (ease === 'swing-out') return 1 - (1 - clamped) * (1 - clamped) * (2.5 * (1 - clamped) - 1.5);
  if (ease === 'swing') return easeUnit(easeUnit(clamped, 'swing-in'), 'swing-out');
  return clamped;
}

export function creatorPose(layer: CreatorLayer, localMs: number): Pick<CreatorLayer, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity'> {
  const base = { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, opacity: layer.opacity };
  if (layer.motion !== 'keyframes' || layer.keyframes.length === 0) return base;
  const keys = [...layer.keyframes].sort((a, b) => a.timeMs - b.timeMs);
  if (localMs <= keys[0].timeMs) return keys[0];
  const last = keys[keys.length - 1];
  if (localMs >= last.timeMs) return last;
  const nextIndex = keys.findIndex(key => key.timeMs >= localMs);
  const next = keys[nextIndex];
  const prev = keys[nextIndex - 1];
  const span = Math.max(1, next.timeMs - prev.timeMs);
  const t = easeUnit((localMs - prev.timeMs) / span, prev.ease);
  const mix = (from: number, to: number) => from + (to - from) * t;
  return {
    x: mix(prev.x, next.x),
    y: mix(prev.y, next.y),
    width: mix(prev.width, next.width),
    height: mix(prev.height, next.height),
    rotation: mix(prev.rotation, next.rotation),
    opacity: mix(prev.opacity, next.opacity)
  };
}

export function filterAlertMessage(message: string, repeatLimit: number, blacklist: string): string {
  const limit = Math.max(1, repeatLimit);
  const collapsed = message.replace(new RegExp(`(.)\\1{${limit},}`, 'gu'), match => match.slice(0, limit));
  const blocked = blacklist.split(',').map(word => word.trim().toLowerCase()).filter(Boolean);
  if (!blocked.length) return collapsed;
  return collapsed.split(/\s+/).filter(word => !blocked.includes(word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))).join(' ');
}

/** A text layer is a flex row, so a normal space at the edge of a span is discarded. Keep one non-breaking space there instead. */
function visibleLiteral(part: string): string {
  return part.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]|[ \t]$/g, '\u00A0');
}

function fieldNumber(value: number): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '0';
}

export function alertPieces(template: string, alert: StreamAlert, language: 'de' | 'en' = 'en'): AlertPiece[] {
  const values: Record<string, string> = {
    name: alert.user,
    user: alert.user,
    amount: fieldNumber(alert.amount),
    currency: alert.currency.trim(),
    months: fieldNumber(alert.months),
    tier: alert.tier,
    viewers: fieldNumber(alert.viewers),
    message: alert.message
  };
  const parts = template.split(/(\{[a-z]+\})/i);
  const pieces: AlertPiece[] = [];
  let skipSpace = false;
  for (const part of parts) {
    if (!part) continue;
    const token = /^\{([a-z]+)\}$/i.exec(part);
    if (token) {
      const key = token[1].toLowerCase();
      if (!Object.hasOwn(values, key)) continue;
      const value = values[key];
      if (!value) {
        const last = pieces[pieces.length - 1];
        if (last && !last.accent && /[ \t]$/.test(last.text)) last.text = last.text.replace(/[ \t]$/, '');
        else skipSpace = true;
        continue;
      }
      skipSpace = false;
      pieces.push({ text: value, accent: true });
      continue;
    }
    const literal = skipSpace ? part.replace(/^[ \t]/, '') : part;
    skipSpace = false;
    const last = pieces[pieces.length - 1];
    if (last && !last.accent) last.text += literal;
    else pieces.push({ text: literal, accent: false });
  }
  for (const piece of pieces) {
    if (!piece.accent) piece.text = visibleLiteral(piece.text);
  }
  const visible = pieces.filter(piece => piece.text);
  if (visible.length) return visible;
  if (/\{(?:name|user|amount|currency|months|tier|viewers|message)\}/i.test(template)) return [];
  return [{ text: alertText(alert, language), accent: false }];
}

function matches(rule: AlertMatch, alert: StreamAlert): number {
  let score = 0;
  const months = alert.months || (alert.kind === 'resub' ? alert.amount : 0);
  if (rule.months) {
    if (months !== rule.months) return 0;
    score += 10;
  }
  if (rule.monthMin) {
    if (months < rule.monthMin) return 0;
    score += 5;
  }
  if (rule.tier) {
    if (alert.tier !== rule.tier) return 0;
    score += 8;
  }
  if (rule.exactAmount) {
    if (alert.amount !== rule.exactAmount) return 0;
    score += 10;
  }
  if (rule.minAmount) {
    if (alert.amount < rule.minAmount) return 0;
    score += 6;
  }
  if (rule.maxAmount) {
    if (alert.amount > rule.maxAmount) return 0;
    score += 4;
  }
  if (rule.minViewers) {
    if ((alert.viewers || alert.amount) < rule.minViewers) return 0;
    score += 6;
  }
  return score;
}

export function matchVariation(config: AlertBoxConfig, alert: StreamAlert): AlertVariation | null {
  let best: AlertVariation | null = null;
  let bestScore = 0;
  for (const variation of config.variations) {
    if (!variation.enabled || variation.kind !== alert.kind) continue;
    const score = matches(variation.match, alert);
    if (score > bestScore) {
      best = variation;
      bestScore = score;
    }
  }
  return best;
}

export function planAlert(config: AlertBoxConfig, alert: StreamAlert, language: 'de' | 'en' = 'en'): AlertPlan {
  const variation = matchVariation(config, alert);
  const source = variation || config;
  const filtered = { ...alert, message: filterAlertMessage(alert.message, config.speech.repeatLimit, config.speech.blacklist) };
  const template = variation?.template || config.template || alertText(alert, language);
  const pieces = alertPieces(template.includes('{') ? template : `${template}`, filtered, language);
  const spokenBody = filtered.message;
  const headline = pieces.map(piece => piece.text).join('').replaceAll('\u00A0', ' ');
  const paid = alert.kind === 'cheer' || alert.kind === 'tip' || alert.kind === 'gift' || alert.kind === 'communitygift';
  const speechAllowed = config.speech.enabled && (!paid || alert.amount >= config.speech.minAmount);
  const speech = speechAllowed ? (config.speech.announce ? `${headline}${spokenBody ? `: ${spokenBody}` : ''}` : spokenBody) : '';
  const durationMs = source.durationMs;
  const outroMs = Math.min(source.outroMs, durationMs);
  return {
    layout: source.layout,
    durationMs,
    textDelayMs: Math.min(source.textDelayMs, durationMs),
    introMs: source.introMs,
    outroMs,
    intro: source.intro,
    outro: source.outro,
    textAnim: source.textAnim,
    mediaUrl: source.mediaUrl,
    soundUrl: source.soundUrl,
    volume: source.volume / 100,
    pieces,
    speech,
    totalMs: durationMs,
    variationId: variation?.id || ''
  };
}

export function safeMediaUrl(value: string): string {
  if (value.startsWith('/overlay-assets/')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch { /* empty until a real URL is entered */ }
  return '';
}

/** Same ceiling as alert images. Base64 of 12 MB still fits the 20 MB JSON body. */
export const ALERT_SOUND_MAX_BYTES = 12 * 1024 * 1024;

export function alertSoundType(fileName: string, fileType: string): string {
  const named = fileName.toLowerCase();
  const raw = fileType.toLowerCase().split(';')[0].trim();
  const fromName = named.endsWith('.mp3') ? 'audio/mpeg'
    : named.endsWith('.wav') ? 'audio/wav'
    : named.endsWith('.ogg') ? 'audio/ogg'
    : named.endsWith('.m4a') ? 'audio/mp4'
    : named.endsWith('.webm') ? 'audio/webm'
    : '';
  if (raw === 'audio/mpeg' || raw === 'audio/mp3') return 'audio/mpeg';
  if (raw === 'audio/wav' || raw === 'audio/x-wav' || raw === 'audio/wave' || raw === 'audio/vnd.wave') return 'audio/wav';
  if (raw === 'audio/ogg' || raw === 'application/ogg') return 'audio/ogg';
  if (raw === 'audio/mp4' || raw === 'audio/x-m4a' || raw === 'audio/m4a' || raw === 'audio/aac') return 'audio/mp4';
  if (raw === 'audio/webm') return 'audio/webm';
  if (!raw || raw === 'application/octet-stream') return fromName;
  return fromName;
}

export function dataUrlWithType(raw: string, type: string): string {
  const comma = raw.indexOf(',');
  if (comma < 0) return raw;
  return raw.startsWith(`data:${type};`) ? raw : `data:${type};base64,${raw.slice(comma + 1)}`;
}

export function mediaFileName(url: string): string {
  const leaf = url.split('?')[0].split('/').pop() || '';
  try { return decodeURIComponent(leaf); } catch { return leaf; }
}
