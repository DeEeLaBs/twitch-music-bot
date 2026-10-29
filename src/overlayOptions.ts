export const OVERLAY_THEMES = ['glass', 'neon', 'minimal', 'light', 'ocean', 'sunset', 'twitch', 'mono'] as const;
export const OVERLAY_LAYOUTS = ['horizontal', 'compact', 'stacked', 'banner', 'vertical', 'spotlight', 'textOnly', 'coverCard'] as const;
export const OVERLAY_FONT_STYLES = ['modern', 'condensed', 'rounded', 'mono'] as const;
export const OVERLAY_TEXT_ALIGNS = ['left', 'center'] as const;
export const OVERLAY_ARTWORK_SHAPES = ['rounded', 'square', 'circle', 'vinyl'] as const;
export const OVERLAY_ANIMATIONS = ['none', 'fade', 'slide', 'pulse'] as const;
export const OVERLAY_PROGRESS_STYLES = ['bar', 'pill', 'waveform', 'ring', 'spark', 'equalizer', 'border'] as const;
export const OVERLAY_ELEMENT_IDS = ['artwork', 'text', 'meta', 'progress', 'logo'] as const;

export type OverlayTheme = typeof OVERLAY_THEMES[number];
export type OverlayLayout = typeof OVERLAY_LAYOUTS[number];
export type OverlayFontStyle = typeof OVERLAY_FONT_STYLES[number];
export type OverlayTextAlign = typeof OVERLAY_TEXT_ALIGNS[number];
export type OverlayArtworkShape = typeof OVERLAY_ARTWORK_SHAPES[number];
export type OverlayAnimation = typeof OVERLAY_ANIMATIONS[number];
export type OverlayProgressStyle = typeof OVERLAY_PROGRESS_STYLES[number];
export type OverlayElementId = typeof OVERLAY_ELEMENT_IDS[number];
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
  textAlign: OverlayTextAlign;
  artworkShape: OverlayArtworkShape;
  animation: OverlayAnimation;
  progressStyle: OverlayProgressStyle;
  backgroundImageUrl: string;
  logoImageUrl: string;
  customCss: string;
  positions: OverlayPositions;
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
  showSource: false, showRequesterAvatar: false, showRequesterBadge: true, useMarquee: true, hideWhenIdle: false,
  showLogo: false, showBorder: true, freePositioning: false, accent: '#a855f7', scale: 100, radius: 18, backgroundOpacity: 92,
  shadowStrength: 55, logoSize: 54, fontStyle: 'modern', textAlign: 'left', artworkShape: 'rounded', animation: 'fade',
  progressStyle: 'bar', backgroundImageUrl: '', logoImageUrl: '', customCss: '', positions: DEFAULT_OVERLAY_POSITIONS
};

const isOne = (value: string | null, fallback: boolean) => value === null ? fallback : value === '1';
const clampNumber = (value: string | null, fallback: number, min: number, max: number) => {
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
    textAlign: oneOf(params.get('textAlign'), OVERLAY_TEXT_ALIGNS, DEFAULT_OVERLAY_OPTIONS.textAlign),
    artworkShape: oneOf(params.get('artworkShape'), OVERLAY_ARTWORK_SHAPES, DEFAULT_OVERLAY_OPTIONS.artworkShape),
    animation: oneOf(params.get('animation'), OVERLAY_ANIMATIONS, DEFAULT_OVERLAY_OPTIONS.animation),
    progressStyle: oneOf(params.get('progressStyle'), OVERLAY_PROGRESS_STYLES, DEFAULT_OVERLAY_OPTIONS.progressStyle),
    backgroundImageUrl: safeText(params.get('backgroundImageUrl'), 500),
    logoImageUrl: safeText(params.get('logoImageUrl'), 500),
    customCss: safeText(params.get('customCss'), 6000),
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
    useMarquee: options.useMarquee ? '1' : '0', hideWhenIdle: options.hideWhenIdle ? '1' : '0', showLogo: options.showLogo ? '1' : '0', showBorder: options.showBorder ? '1' : '0',
    freePositioning: options.freePositioning ? '1' : '0', accent: normalizeAccent(options.accent), scale: String(options.scale), radius: String(options.radius),
    backgroundOpacity: String(options.backgroundOpacity), shadowStrength: String(options.shadowStrength), logoSize: String(options.logoSize),
    fontStyle: options.fontStyle, textAlign: options.textAlign, artworkShape: options.artworkShape, animation: options.animation, progressStyle: options.progressStyle,
    backgroundImageUrl: options.backgroundImageUrl || '', logoImageUrl: options.logoImageUrl || '', customCss: options.customCss || '',
    posArtwork: positionString(options.positions.artwork), posText: positionString(options.positions.text), posMeta: positionString(options.positions.meta),
    posProgress: positionString(options.positions.progress), posLogo: positionString(options.positions.logo)
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
