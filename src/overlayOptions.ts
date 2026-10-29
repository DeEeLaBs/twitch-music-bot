import { defaultAlertBox, normalizeAlertBox, type AlertBoxConfig } from './alertBox.ts';
import { chatFromParams, chatSearchParams, DEFAULT_CHAT_OPTIONS, normalizeChat, type OverlayChatOptions } from './overlayChat.ts';
import { normalizeScene, type OverlayScene } from './scene.ts';

export const OVERLAY_THEMES = ['glass', 'neon', 'minimal', 'light', 'ocean', 'sunset', 'twitch', 'mono'] as const;
export const OVERLAY_LAYOUTS = ['horizontal', 'compact', 'stacked', 'banner', 'vertical', 'spotlight', 'textOnly', 'coverCard'] as const;
export const OVERLAY_FONT_STYLES = ['modern', 'condensed', 'rounded', 'mono'] as const;
export const OVERLAY_TEXT_ALIGNS = ['left', 'center'] as const;
export const OVERLAY_ARTWORK_SHAPES = ['rounded', 'square', 'circle', 'vinyl'] as const;
export const OVERLAY_ANIMATIONS = ['none', 'fade', 'slide', 'pulse'] as const;
export const OVERLAY_PROGRESS_STYLES = ['bar', 'pill', 'waveform', 'ring', 'spark', 'equalizer', 'border'] as const;
export const OVERLAY_ELEMENT_IDS = ['artwork', 'text', 'meta', 'progress', 'logo'] as const;
/** How the request popup enters (and leaves). "slideUp" rises from under the overlay's bottom edge. */
export const OVERLAY_POP_ANIMATIONS = ['drop', 'slideUp', 'slideSide', 'zoom', 'flip'] as const;
/** Where the popup sits inside the overlay; "cover" fills the whole card. */
export const OVERLAY_POP_POSITIONS = ['top', 'bottom', 'cover'] as const;
export const OVERLAY_POP_STYLES = ['accent', 'glass', 'theme', 'minimal'] as const;

export type OverlayTheme = typeof OVERLAY_THEMES[number];
export type OverlayLayout = typeof OVERLAY_LAYOUTS[number];
export type OverlayFontStyle = typeof OVERLAY_FONT_STYLES[number];
export type OverlayTextAlign = typeof OVERLAY_TEXT_ALIGNS[number];
export type OverlayArtworkShape = typeof OVERLAY_ARTWORK_SHAPES[number];
export type OverlayAnimation = typeof OVERLAY_ANIMATIONS[number];
export type OverlayProgressStyle = typeof OVERLAY_PROGRESS_STYLES[number];
export type OverlayElementId = typeof OVERLAY_ELEMENT_IDS[number];
export type OverlayPopAnimation = typeof OVERLAY_POP_ANIMATIONS[number];
export type OverlayPopPosition = typeof OVERLAY_POP_POSITIONS[number];
export type OverlayPopStyle = typeof OVERLAY_POP_STYLES[number];
export interface OverlayPosition { x: number; y: number; }
export type OverlayPositions = Record<OverlayElementId, OverlayPosition>;

export interface OverlayOptions {
  theme: OverlayTheme;
  layout: OverlayLayout;
  showProgress: boolean;
  showArtwork: boolean;
  showRequester: boolean;
  showTime: boolean;
  showSource: boolean;
  showRequesterAvatar: boolean;
  showRequesterBadge: boolean;
  /** Show a short popup when a viewer adds a song to the queue. */
  queuePop: boolean;
  /** How long that popup stays, in seconds. */
  queuePopSeconds: number;
  queuePopAnimation: OverlayPopAnimation;
  queuePopPosition: OverlayPopPosition;
  queuePopStyle: OverlayPopStyle;
  queuePopShowArt: boolean;
  useMarquee: boolean;
  hideWhenIdle: boolean;
  showLogo: boolean;
  showBorder: boolean;
  freePositioning: boolean;
  accent: string;
  scale: number;
  radius: number;
  backgroundOpacity: number;
  shadowStrength: number;
  logoSize: number;
  fontStyle: OverlayFontStyle;
  /** A chosen family from the shared font list. Empty keeps fontStyle. */
  fontFamily: string;
  textAlign: OverlayTextAlign;
  artworkShape: OverlayArtworkShape;
  animation: OverlayAnimation;
  progressStyle: OverlayProgressStyle;
  backgroundImageUrl: string;
  logoImageUrl: string;
  customCss: string;
  positions: OverlayPositions;
  chat: OverlayChatOptions;
  scene?: OverlayScene;
  alertBox: AlertBoxConfig;
}

export const DEFAULT_OVERLAY_POSITIONS: OverlayPositions = {
  artwork: { x: 16, y: 50 },
  text: { x: 53, y: 39 },
  meta: { x: 53, y: 68 },
  progress: { x: 50, y: 91 },
  logo: { x: 91, y: 18 }
};

export const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
  theme: 'glass', layout: 'horizontal', showProgress: true, showArtwork: true, showRequester: true, showTime: true,
  showSource: false, showRequesterAvatar: false, showRequesterBadge: true, queuePop: true, queuePopSeconds: 4, queuePopAnimation: 'drop', queuePopPosition: 'top', queuePopStyle: 'accent', queuePopShowArt: true, useMarquee: true, hideWhenIdle: false,
  showLogo: false, showBorder: true, freePositioning: false, accent: '#a855f7', scale: 100, radius: 18, backgroundOpacity: 92,
  shadowStrength: 55, logoSize: 54, fontStyle: 'modern', fontFamily: '', textAlign: 'left', artworkShape: 'rounded', animation: 'fade',
  progressStyle: 'bar', backgroundImageUrl: '', logoImageUrl: '', customCss: '', positions: DEFAULT_OVERLAY_POSITIONS,
  chat: DEFAULT_CHAT_OPTIONS,
  alertBox: defaultAlertBox()
};

export function mergeOverlayOptions(options?: Partial<OverlayOptions> | null): OverlayOptions {
  const incoming = options || {};
  return {
    ...DEFAULT_OVERLAY_OPTIONS,
    ...incoming,
    fontFamily: String(incoming.fontFamily || '').slice(0, 120),
    positions: { ...DEFAULT_OVERLAY_POSITIONS, ...(incoming.positions || {}) },
    chat: normalizeChat(incoming.chat),
    scene: incoming.scene ? normalizeScene(incoming.scene) : undefined,
    alertBox: normalizeAlertBox(incoming.alertBox)
  };
}

const isOne = (value: string | null, fallback: boolean) => value === null ? fallback : value === '1';
const clampNumber = (value: string | null, fallback: number, min: number, max: number) => {
  // A missing or empty parameter must mean "use the default", not Number(null) === 0 clamped up to the minimum.
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const oneOf = <T extends readonly string[]>(value: string | null, allowed: T, fallback: T[number]): T[number] => value && allowed.includes(value) ? value as T[number] : fallback;
const safeText = (value: string | null, max: number) => (value || '').slice(0, max);
const parsePosition = (value: string | null, fallback: OverlayPosition): OverlayPosition => {
  if (!value) return fallback;
  const [x, y] = value.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
};
const positionString = (position: OverlayPosition) => `${Math.round(position.x * 10) / 10},${Math.round(position.y * 10) / 10}`;

export function normalizeAccent(value: string | null | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_OVERLAY_OPTIONS.accent;
}

export function parseOverlayOptions(params: URLSearchParams): OverlayOptions {
  return {
    theme: oneOf(params.get('theme'), OVERLAY_THEMES, DEFAULT_OVERLAY_OPTIONS.theme),
    layout: oneOf(params.get('layout'), OVERLAY_LAYOUTS, DEFAULT_OVERLAY_OPTIONS.layout),
    showProgress: isOne(params.get('showProgress'), DEFAULT_OVERLAY_OPTIONS.showProgress),
    showArtwork: isOne(params.get('showArtwork'), DEFAULT_OVERLAY_OPTIONS.showArtwork),
    showRequester: isOne(params.get('showRequester'), DEFAULT_OVERLAY_OPTIONS.showRequester),
    showTime: isOne(params.get('showTime'), DEFAULT_OVERLAY_OPTIONS.showTime),
    showSource: isOne(params.get('showSource'), DEFAULT_OVERLAY_OPTIONS.showSource),
    showRequesterAvatar: isOne(params.get('showRequesterAvatar'), DEFAULT_OVERLAY_OPTIONS.showRequesterAvatar),
    showRequesterBadge: isOne(params.get('showRequesterBadge'), DEFAULT_OVERLAY_OPTIONS.showRequesterBadge),
    queuePop: isOne(params.get('queuePop'), DEFAULT_OVERLAY_OPTIONS.queuePop),
    queuePopSeconds: clampNumber(params.get('queuePopSeconds'), DEFAULT_OVERLAY_OPTIONS.queuePopSeconds, 2, 10),
    queuePopAnimation: oneOf(params.get('queuePopAnimation'), OVERLAY_POP_ANIMATIONS, DEFAULT_OVERLAY_OPTIONS.queuePopAnimation),
    queuePopPosition: oneOf(params.get('queuePopPosition'), OVERLAY_POP_POSITIONS, DEFAULT_OVERLAY_OPTIONS.queuePopPosition),
    queuePopStyle: oneOf(params.get('queuePopStyle'), OVERLAY_POP_STYLES, DEFAULT_OVERLAY_OPTIONS.queuePopStyle),
    queuePopShowArt: isOne(params.get('queuePopShowArt'), DEFAULT_OVERLAY_OPTIONS.queuePopShowArt),
    useMarquee: isOne(params.get('useMarquee'), DEFAULT_OVERLAY_OPTIONS.useMarquee),
    hideWhenIdle: isOne(params.get('hideWhenIdle'), DEFAULT_OVERLAY_OPTIONS.hideWhenIdle),
    showLogo: isOne(params.get('showLogo'), DEFAULT_OVERLAY_OPTIONS.showLogo),
    showBorder: isOne(params.get('showBorder'), DEFAULT_OVERLAY_OPTIONS.showBorder),
    freePositioning: isOne(params.get('freePositioning'), DEFAULT_OVERLAY_OPTIONS.freePositioning),
    accent: normalizeAccent(params.get('accent')),
    scale: clampNumber(params.get('scale'), DEFAULT_OVERLAY_OPTIONS.scale, 70, 160),
    radius: clampNumber(params.get('radius'), DEFAULT_OVERLAY_OPTIONS.radius, 0, 40),
    backgroundOpacity: clampNumber(params.get('backgroundOpacity'), DEFAULT_OVERLAY_OPTIONS.backgroundOpacity, 25, 100),
    shadowStrength: clampNumber(params.get('shadowStrength'), DEFAULT_OVERLAY_OPTIONS.shadowStrength, 0, 100),
    logoSize: clampNumber(params.get('logoSize'), DEFAULT_OVERLAY_OPTIONS.logoSize, 24, 140),
    fontStyle: oneOf(params.get('fontStyle'), OVERLAY_FONT_STYLES, DEFAULT_OVERLAY_OPTIONS.fontStyle),
    fontFamily: safeText(params.get('fontFamily'), 120),
    textAlign: oneOf(params.get('textAlign'), OVERLAY_TEXT_ALIGNS, DEFAULT_OVERLAY_OPTIONS.textAlign),
    artworkShape: oneOf(params.get('artworkShape'), OVERLAY_ARTWORK_SHAPES, DEFAULT_OVERLAY_OPTIONS.artworkShape),
    animation: oneOf(params.get('animation'), OVERLAY_ANIMATIONS, DEFAULT_OVERLAY_OPTIONS.animation),
    progressStyle: oneOf(params.get('progressStyle'), OVERLAY_PROGRESS_STYLES, DEFAULT_OVERLAY_OPTIONS.progressStyle),
    backgroundImageUrl: safeText(params.get('backgroundImageUrl'), 500),
    logoImageUrl: safeText(params.get('logoImageUrl'), 500),
    customCss: safeText(params.get('customCss'), 6000),
    chat: chatFromParams(params),
    alertBox: defaultAlertBox(),
    positions: {
      artwork: parsePosition(params.get('posArtwork'), DEFAULT_OVERLAY_POSITIONS.artwork),
      text: parsePosition(params.get('posText'), DEFAULT_OVERLAY_POSITIONS.text),
      meta: parsePosition(params.get('posMeta'), DEFAULT_OVERLAY_POSITIONS.meta),
      progress: parsePosition(params.get('posProgress'), DEFAULT_OVERLAY_POSITIONS.progress),
      logo: parsePosition(params.get('posLogo'), DEFAULT_OVERLAY_POSITIONS.logo)
    }
  };
}

export function createOverlaySearch(options: OverlayOptions): string {
  return new URLSearchParams({
    theme: options.theme, layout: options.layout, showProgress: options.showProgress ? '1' : '0', showArtwork: options.showArtwork ? '1' : '0',
    showRequester: options.showRequester ? '1' : '0', showTime: options.showTime ? '1' : '0', showSource: options.showSource ? '1' : '0',
    showRequesterAvatar: options.showRequesterAvatar ? '1' : '0', showRequesterBadge: options.showRequesterBadge ? '1' : '0',
    queuePop: options.queuePop ? '1' : '0', queuePopSeconds: String(options.queuePopSeconds),
    queuePopAnimation: options.queuePopAnimation, queuePopPosition: options.queuePopPosition, queuePopStyle: options.queuePopStyle, queuePopShowArt: options.queuePopShowArt ? '1' : '0',
    useMarquee: options.useMarquee ? '1' : '0', hideWhenIdle: options.hideWhenIdle ? '1' : '0', showLogo: options.showLogo ? '1' : '0', showBorder: options.showBorder ? '1' : '0',
    freePositioning: options.freePositioning ? '1' : '0', accent: normalizeAccent(options.accent), scale: String(options.scale), radius: String(options.radius),
    backgroundOpacity: String(options.backgroundOpacity), shadowStrength: String(options.shadowStrength), logoSize: String(options.logoSize),
    fontStyle: options.fontStyle, fontFamily: options.fontFamily || '', textAlign: options.textAlign, artworkShape: options.artworkShape, animation: options.animation, progressStyle: options.progressStyle,
    backgroundImageUrl: options.backgroundImageUrl || '', logoImageUrl: options.logoImageUrl || '', customCss: options.customCss || '',
    posArtwork: positionString(options.positions.artwork), posText: positionString(options.positions.text), posMeta: positionString(options.positions.meta),
    posProgress: positionString(options.positions.progress), posLogo: positionString(options.positions.logo),
    ...chatSearchParams(options.chat || DEFAULT_CHAT_OPTIONS)
  }).toString();
}

export function recommendedOverlaySize(layout: OverlayLayout, scale: number) {
  const base = layout === 'stacked' ? { width: 360, height: 440 } : layout === 'compact' ? { width: 420, height: 110 } :
    layout === 'banner' ? { width: 760, height: 120 } : layout === 'vertical' ? { width: 360, height: 520 } :
    layout === 'spotlight' ? { width: 420, height: 440 } : layout === 'textOnly' ? { width: 540, height: 110 } :
    // The cover card itself is at least 160px high; leave room for its shadow.
    layout === 'coverCard' ? { width: 440, height: 180 } : { width: 560, height: 160 };
  const factor = scale / 100; return { width: Math.ceil(base.width * factor), height: Math.ceil(base.height * factor) };
}

/** Ready-made popup designs for the Overlay Studio. Each one only sets the popup's design, nothing else. */
export type QueuePopDesignValues = Pick<OverlayOptions, 'queuePopAnimation' | 'queuePopPosition' | 'queuePopStyle' | 'queuePopShowArt'>;
export const QUEUE_POP_PRESETS: ReadonlyArray<{ id: string; name: { de: string; en: string }; hint: { de: string; en: string }; values: QueuePopDesignValues }> = [
  { id: 'classic', name: { de: 'Klassisch', en: 'Classic' }, hint: { de: 'Fällt oben ins Overlay', en: 'Drops in at the top' }, values: { queuePopAnimation: 'drop', queuePopPosition: 'top', queuePopStyle: 'accent', queuePopShowArt: true } },
  { id: 'rise', name: { de: 'Von unten', en: 'Rise' }, hint: { de: 'Gleitet unter dem Overlay hervor', en: 'Slides up from under the overlay' }, values: { queuePopAnimation: 'slideUp', queuePopPosition: 'bottom', queuePopStyle: 'accent', queuePopShowArt: true } },
  { id: 'glass', name: { de: 'Glas', en: 'Glass' }, hint: { de: 'Schiebt sich seitlich herein', en: 'Slides in from the side' }, values: { queuePopAnimation: 'slideSide', queuePopPosition: 'bottom', queuePopStyle: 'glass', queuePopShowArt: true } },
  { id: 'stage', name: { de: 'Bühne', en: 'Stage' }, hint: { de: 'Zoomt über die ganze Karte', en: 'Zooms over the whole card' }, values: { queuePopAnimation: 'zoom', queuePopPosition: 'cover', queuePopStyle: 'accent', queuePopShowArt: true } },
  { id: 'flip', name: { de: 'Kippkarte', en: 'Flip' }, hint: { de: 'Klappt im Stil des Overlays auf', en: 'Flips open in the overlay style' }, values: { queuePopAnimation: 'flip', queuePopPosition: 'top', queuePopStyle: 'theme', queuePopShowArt: true } },
  { id: 'subtle', name: { de: 'Dezent', en: 'Subtle' }, hint: { de: 'Kleine Pille, steigt von unten auf', en: 'Small pill rising from below' }, values: { queuePopAnimation: 'slideUp', queuePopPosition: 'bottom', queuePopStyle: 'minimal', queuePopShowArt: false } }
];