import type { OverlayChatOptions } from './overlayChat.ts';

export const SCENE_VERSION = 1 as const;
export const SCENE_WIDGET_TYPES = ['twitch-chat', 'music-player', 'alert', 'label', 'goal', 'leaderboard', 'countdown', 'text', 'image', 'video', 'fx'] as const;
export type SceneWidgetType = typeof SCENE_WIDGET_TYPES[number];
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface SceneFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export interface SceneWidget {
  id: string;
  type: SceneWidgetType;
  frame: SceneFrame;
  css: string;
  fontSize: number;
  /** Empty uses the widget's default face. */
  fontFamily: string;
  fadeMs: number;
  variant: string;
  /** False hides the layer on the overlay canvas. Missing means visible. */
  visible: boolean;
}

export interface OverlayScene {
  version: typeof SCENE_VERSION;
  id: string;
  design: { width: number; height: number };
  grid: number;
  widgets: SceneWidget[];
}

export const DESIGN_PRESETS = [
  { id: '720', label: '1280×720 (720p)', width: 1280, height: 720 },
  { id: '1080', label: '1920×1080 (1080p)', width: 1920, height: 1080 },
  { id: '1440', label: '2560×1440 (1440p)', width: 2560, height: 1440 },
  { id: '2160', label: '3840×2160 (4K)', width: 3840, height: 2160 }
] as const;

const MIN_FRAME: Record<SceneWidgetType, { width: number; height: number }> = {
  'twitch-chat': { width: 280, height: 200 },
  'music-player': { width: 360, height: 96 },
  alert: { width: 280, height: 72 },
  label: { width: 180, height: 48 },
  goal: { width: 220, height: 56 },
  leaderboard: { width: 220, height: 140 },
  countdown: { width: 160, height: 72 },
  text: { width: 120, height: 48 },
  image: { width: 80, height: 80 },
  video: { width: 120, height: 80 },
  fx: { width: 160, height: 120 }
};

const DEFAULT_FONT: Record<SceneWidgetType, number> = {
  'twitch-chat': 16,
  'music-player': 18,
  alert: 28,
  label: 22,
  goal: 18,
  leaderboard: 16,
  countdown: 28,
  text: 28,
  image: 14,
  video: 14,
  fx: 14
};

const WIDGET_IDS: Record<SceneWidgetType, string> = {
  'twitch-chat': 'w_chat',
  'music-player': 'w_player',
  alert: 'w_alert',
  label: 'w_label',
  goal: 'w_goal',
  leaderboard: 'w_board',
  countdown: 'w_timer',
  text: 'w_text',
  image: 'w_image',
  video: 'w_video',
  fx: 'w_fx'
};

export function widgetId(type: SceneWidgetType): string {
  return WIDGET_IDS[type];
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function round(value: number): number {
  return Math.round(value);
}

export function fitScale(viewportWidth: number, viewportHeight: number, designWidth: number, designHeight: number): number {
  if (viewportWidth <= 0 || viewportHeight <= 0 || designWidth <= 0 || designHeight <= 0) return 1;
  return Math.min(viewportWidth / designWidth, viewportHeight / designHeight);
}

export function pointerToDesign(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  design: { width: number; height: number }
): { x: number; y: number } {
  const sx = rect.width / design.width;
  const sy = rect.height / design.height;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx === 0 || sy === 0) return { x: 0, y: 0 };
  return { x: (clientX - rect.left) / sx, y: (clientY - rect.top) / sy };
}

export function parseResolution(value: string | null | undefined): { width: number; height: number } | null {
  const match = /^(\d{3,4})x(\d{3,4})$/i.exec((value || '').trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 640 || height < 360 || width > 3840 || height > 3840) return null;
  return { width, height };
}

export function designForRender(scene: OverlayScene, query: string | null | undefined): { width: number; height: number; queryIgnored: boolean } {
  const parsed = parseResolution(query);
  if (!parsed) return { width: scene.design.width, height: scene.design.height, queryIgnored: false };
  const matches = parsed.width === scene.design.width && parsed.height === scene.design.height;
  return { width: scene.design.width, height: scene.design.height, queryIgnored: !matches };
}

export function overlayBrowserUrl(origin: string, token: string, scene: OverlayScene): string {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  params.set('scene', scene.id || 'main');
  params.set('resolution', `${scene.design.width}x${scene.design.height}`);
  return `${origin}/overlay?${params.toString()}`;
}

function clampFrame(frame: SceneFrame, type: SceneWidgetType, design: { width: number; height: number }): SceneFrame {
  const min = MIN_FRAME[type];
  const width = clamp(round(frame.width), min.width, design.width, min.width);
  const height = clamp(round(frame.height), min.height, design.height, min.height);
  const x = clamp(round(frame.x), 0, Math.max(0, design.width - width), 0);
  const y = clamp(round(frame.y), 0, Math.max(0, design.height - height), 0);
  return { x, y, width, height, z: clamp(round(frame.z), 1, 20, 1) };
}

function widgetFromUnknown(value: unknown, design: { width: number; height: number }): SceneWidget | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SceneWidget>;
  if (!SCENE_WIDGET_TYPES.includes(raw.type as SceneWidgetType)) return null;
  const type = raw.type as SceneWidgetType;
  const frame = raw.frame || { x: 48, y: 48, width: 480, height: 280, z: 1 };
  return {
    id: WIDGET_IDS[type],
    type,
    frame: clampFrame({
      x: Number(frame.x),
      y: Number(frame.y),
      width: Number(frame.width),
      height: Number(frame.height),
      z: Number(frame.z)
    }, type, design),
    css: String(raw.css || '').slice(0, 2000),
    fontSize: clamp(Number(raw.fontSize), 12, 32, DEFAULT_FONT[type]),
    fontFamily: String(raw.fontFamily || '').slice(0, 120),
    fadeMs: clamp(round(Number(raw.fadeMs)), 0, 1000, type === 'music-player' ? 350 : 180),
    variant: String(raw.variant || '').slice(0, 500),
    visible: raw.visible !== false
  };
}

export function normalizeScene(input: unknown): OverlayScene | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Partial<OverlayScene>;
  const design = {
    width: clamp(round(Number(raw.design?.width)), 640, 3840, 1920),
    height: clamp(round(Number(raw.design?.height)), 360, 3840, 1080)
  };
  const seen = new Set<SceneWidgetType>();
  const widgets: SceneWidget[] = [];
  for (const item of Array.isArray(raw.widgets) ? raw.widgets : []) {
    const widget = widgetFromUnknown(item, design);
    if (!widget || seen.has(widget.type)) continue;
    seen.add(widget.type);
    widgets.push(widget);
  }
  return {
    version: SCENE_VERSION,
    id: String(raw.id || 'main').slice(0, 40) || 'main',
    design,
    grid: clamp(round(Number(raw.grid)), 4, 64, 8),
    widgets
  };
}

export function defaultPlayerFrame(design: { width: number; height: number }): SceneFrame {
  const width = Math.min(720, design.width - 96);
  const height = Math.min(172, design.height - 96);
  return clampFrame({ x: 48, y: design.height - height - 48, width, height, z: 1 }, 'music-player', design);
}

export function defaultChatFrame(design: { width: number; height: number }): SceneFrame {
  const width = Math.min(480, design.width - 96);
  const height = Math.min(520, design.height - 160);
  return clampFrame({ x: design.width - width - 48, y: 48, width, height, z: 2 }, 'twitch-chat', design);
}

export function sceneFromLegacy(chat: Pick<OverlayChatOptions, 'enabled' | 'x' | 'y' | 'width' | 'height'>): OverlayScene {
  const design = { width: 1920, height: 1080 };
  const widgets: SceneWidget[] = [{
    id: 'w_player',
    type: 'music-player',
    frame: defaultPlayerFrame(design),
    css: '',
    fontSize: DEFAULT_FONT['music-player'],
    fontFamily: '',
    fadeMs: 350,
    variant: '',
    visible: true
  }];
  if (chat.enabled) {
    widgets.push({
      id: 'w_chat',
      type: 'twitch-chat',
      frame: clampFrame({
        x: (chat.x / 100) * design.width,
        y: (chat.y / 100) * design.height,
        width: (chat.width / 100) * design.width,
        height: (chat.height / 100) * design.height,
        z: 2
      }, 'twitch-chat', design),
      css: '',
      fontSize: DEFAULT_FONT['twitch-chat'],
      fontFamily: '',
      fadeMs: 180,
      variant: '',
      visible: true
    });
  }
  return normalizeScene({ version: SCENE_VERSION, id: 'main', design, grid: 8, widgets })!;
}

export function chatPercents(frame: SceneFrame, design: { width: number; height: number }): Pick<OverlayChatOptions, 'x' | 'y' | 'width' | 'height'> {
  const pct = (part: number, total: number) => Math.round((part / total) * 1000) / 10;
  return {
    x: pct(frame.x, design.width),
    y: pct(frame.y, design.height),
    width: pct(frame.width, design.width),
    height: pct(frame.height, design.height)
  };
}

export function resizeScene(scene: OverlayScene, width: number, height: number): OverlayScene {
  const next = { width: clamp(round(width), 640, 3840, scene.design.width), height: clamp(round(height), 360, 3840, scene.design.height) };
  const sx = next.width / scene.design.width;
  const sy = next.height / scene.design.height;
  const fontFactor = Math.min(sx, sy);
  return normalizeScene({
    ...scene,
    design: next,
    widgets: scene.widgets.map(widget => ({
      ...widget,
      fontSize: widget.fontSize * fontFactor,
      frame: {
        ...widget.frame,
        x: widget.frame.x * sx,
        y: widget.frame.y * sy,
        width: widget.frame.width * sx,
        height: widget.frame.height * sy
      }
    }))
  })!;
}

export function pixelFactor(from: { width: number; height: number }, to: { width: number; height: number }): number {
  if (from.width <= 0 || from.height <= 0) return 1;
  return Math.min(to.width / from.width, to.height / from.height);
}

function snapTo(value: number, grid: number, enabled: boolean): number {
  if (!enabled || grid <= 1) return round(value);
  return round(value / grid) * grid;
}

export type AlignmentKind = 'center' | 'canvas' | 'symmetric';

export interface AlignmentGuide {
  kind: AlignmentKind;
  otherId: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function frameCenter(frame: SceneFrame) {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

export function alignmentGuides(
  widgets: ReadonlyArray<{ id: string; frame: SceneFrame }>,
  selectedId: string | null,
  design: { width: number; height: number },
  threshold = 4
): AlignmentGuide[] {
  const selected = widgets.find(widget => widget.id === selectedId);
  if (!selected) return [];
  const origin = frameCenter(selected.frame);
  const canvas = { x: design.width / 2, y: design.height / 2 };
  const near = (left: number, right: number) => Math.abs(left - right) <= threshold;
  const guides: AlignmentGuide[] = [];
  if (near(origin.x, canvas.x) || near(origin.y, canvas.y)) {
    guides.push({ kind: 'canvas', otherId: null, x1: origin.x, y1: origin.y, x2: canvas.x, y2: canvas.y });
  }
  for (const other of widgets) {
    if (other.id === selected.id) continue;
    const target = frameCenter(other.frame);
    const sameX = near(origin.x, target.x);
    const sameY = near(origin.y, target.y);
    const mirrorX = near((origin.x + target.x) / 2, canvas.x);
    const mirrorY = near((origin.y + target.y) / 2, canvas.y);
    const symmetric = (mirrorX && mirrorY) || (mirrorX && sameY) || (mirrorY && sameX);
    if (symmetric && !(sameX && sameY)) {
      guides.push({ kind: 'symmetric', otherId: other.id, x1: origin.x, y1: origin.y, x2: target.x, y2: target.y });
      continue;
    }
    if (sameX || sameY) {
      guides.push({ kind: 'center', otherId: other.id, x1: origin.x, y1: origin.y, x2: target.x, y2: target.y });
    }
  }
  return guides;
}

export function moveFrame(frame: SceneFrame, dx: number, dy: number, type: SceneWidgetType, design: { width: number; height: number }, grid: number, snap: boolean): SceneFrame {
  return clampFrame({
    ...frame,
    x: snapTo(frame.x + dx, grid, snap),
    y: snapTo(frame.y + dy, grid, snap)
  }, type, design);
}

/** A goal ring is a circle. The editor draws the shorter side, centered, until a resize saves that square. */
export function displayFrame(widget: Pick<SceneWidget, 'type' | 'variant' | 'frame'>): SceneFrame {
  if (widget.type !== 'goal' || widget.variant.split('|')[1] !== 'ring') return widget.frame;
  const { frame } = widget;
  if (frame.width === frame.height) return frame;
  const size = Math.min(frame.width, frame.height);
  return {
    ...frame,
    x: frame.x + (frame.width - size) / 2,
    y: frame.y + (frame.height - size) / 2,
    width: size,
    height: size
  };
}

export function resizeFrame(
  frame: SceneFrame,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  type: SceneWidgetType,
  design: { width: number; height: number },
  grid: number,
  snap: boolean,
  square = false
): SceneFrame {
  if (square) return resizeSquare(frame, handle, dx, dy, type, design, grid, snap);
  let x = frame.x;
  let y = frame.y;
  let width = frame.width;
  let height = frame.height;
  if (handle.includes('e')) width = snapTo(frame.width + dx, grid, snap);
  if (handle.includes('s')) height = snapTo(frame.height + dy, grid, snap);
  if (handle.includes('w')) {
    const right = frame.x + frame.width;
    x = snapTo(frame.x + dx, grid, snap);
    width = right - x;
  }
  if (handle.includes('n')) {
    const bottom = frame.y + frame.height;
    y = snapTo(frame.y + dy, grid, snap);
    height = bottom - y;
  }
  return clampFrame({ ...frame, x, y, width, height }, type, design);
}

/** Every handle changes the diameter. The opposite corner stays put; a side handle keeps the circle centered on the other axis. */
function resizeSquare(
  frame: SceneFrame,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  type: SceneWidgetType,
  design: { width: number; height: number },
  grid: number,
  snap: boolean
): SceneFrame {
  const east = handle.includes('e');
  const west = handle.includes('w');
  const south = handle.includes('s');
  const north = handle.includes('n');
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const widthChange = east ? dx : west ? -dx : 0;
  const heightChange = south ? dy : north ? -dy : 0;
  const corner = handle.length === 2;
  const useWidth = corner ? Math.abs(widthChange) >= Math.abs(heightChange) : east || west;
  const size = snapTo((useWidth ? frame.width : frame.height) + (useWidth ? widthChange : heightChange), grid, snap);
  let x = frame.x;
  let y = frame.y;
  if (corner) {
    x = east ? frame.x : right - size;
    y = south ? frame.y : bottom - size;
  } else if (east || west) {
    x = east ? frame.x : right - size;
    y = frame.y + frame.height / 2 - size / 2;
  } else {
    y = south ? frame.y : bottom - size;
    x = frame.x + frame.width / 2 - size / 2;
  }
  return clampSquare({ ...frame, x, y, width: size, height: size }, type, design);
}

function clampSquare(frame: SceneFrame, type: SceneWidgetType, design: { width: number; height: number }): SceneFrame {
  const minSide = Math.min(MIN_FRAME[type].width, MIN_FRAME[type].height);
  const size = clamp(round(frame.width), minSide, Math.min(design.width, design.height), minSide);
  const x = clamp(round(frame.x), 0, Math.max(0, design.width - size), 0);
  const y = clamp(round(frame.y), 0, Math.max(0, design.height - size), 0);
  return { x, y, width: size, height: size, z: clamp(round(frame.z), 1, 20, 1) };
}

export function defaultFrame(type: SceneWidgetType, design: { width: number; height: number }): SceneFrame {
  if (type === 'twitch-chat') return defaultChatFrame(design);
  if (type === 'music-player') return defaultPlayerFrame(design);
  const sizes: Record<SceneWidgetType, { width: number; height: number; x: number; y: number }> = {
    'twitch-chat': { width: 480, height: 520, x: 48, y: 48 },
    'music-player': { width: 720, height: 172, x: 48, y: 48 },
    alert: { width: 640, height: 120, x: (design.width - 640) / 2, y: 72 },
    label: { width: 420, height: 72, x: 48, y: 48 },
    goal: { width: 480, height: 88, x: 48, y: 136 },
    leaderboard: { width: 360, height: 280, x: 48, y: 240 },
    countdown: { width: 280, height: 120, x: design.width - 328, y: design.height - 168 },
    text: { width: 640, height: 140, x: (design.width - 640) / 2, y: (design.height - 140) / 2 },
    image: { width: 320, height: 180, x: design.width - 368, y: 48 },
    video: { width: 480, height: 270, x: design.width - 528, y: 260 },
    fx: { width: 480, height: 320, x: (design.width - 480) / 2, y: (design.height - 320) / 2 }
  };
  const size = sizes[type];
  return clampFrame({ ...size, z: 3 }, type, design);
}

export function placeWidget(scene: OverlayScene, type: SceneWidgetType, at?: { x: number; y: number }): OverlayScene {
  const existing = scene.widgets.find(widget => widget.type === type);
  if (existing) return scene;
  const base = defaultFrame(type, scene.design);
  const frame = at
    ? clampFrame({ ...base, x: at.x - base.width / 2, y: at.y - base.height / 2, z: scene.widgets.length + 1 }, type, scene.design)
    : { ...base, z: scene.widgets.length + 1 };
  const widget: SceneWidget = {
    id: WIDGET_IDS[type],
    type,
    frame,
    css: '',
    fontSize: DEFAULT_FONT[type],
    fontFamily: '',
    fadeMs: type === 'music-player' ? 350 : 180,
    variant: type === 'label' ? 'follower' : type === 'goal' ? 'follower' : type === 'leaderboard' ? 'bits' : type === 'countdown' ? 'track' : '',
    visible: true
  };
  return { ...scene, widgets: [...scene.widgets, widget] };
}

export function updateWidget(scene: OverlayScene, id: string, patch: Partial<SceneWidget>): OverlayScene {
  return {
    ...scene,
    widgets: scene.widgets.map(widget => {
      if (widget.id !== id) return widget;
      const next = { ...widget, ...patch, id: widget.id, type: widget.type };
      next.frame = clampFrame(next.frame, next.type, scene.design);
      next.css = String(next.css || '').slice(0, 2000);
      next.variant = String(next.variant || '').slice(0, 500);
      next.fontSize = clamp(round(next.fontSize), 12, 32, widget.fontSize);
      next.fontFamily = String(next.fontFamily || '').slice(0, 120);
      next.fadeMs = clamp(round(next.fadeMs), 0, 1000, widget.fadeMs);
      next.visible = next.visible !== false;
      return next;
    })
  };
}

export function removeWidget(scene: OverlayScene, id: string): OverlayScene {
  return { ...scene, widgets: scene.widgets.filter(widget => widget.id !== id) };
}

export function bindScene<T extends { chat: OverlayChatOptions; radius: number; logoSize: number }>(options: T, scene: OverlayScene, factor = 1): T & { scene: OverlayScene } {
  const chatWidget = scene.widgets.find(widget => widget.type === 'twitch-chat');
  const chat = {
    ...options.chat,
    enabled: Boolean(chatWidget),
    fontSize: clamp(round(options.chat.fontSize * factor), 12, 32, options.chat.fontSize),
    ...(chatWidget ? chatPercents(chatWidget.frame, scene.design) : {})
  };
  return {
    ...options,
    radius: clamp(round(options.radius * factor), 0, 40, options.radius),
    logoSize: clamp(round(options.logoSize * factor), 24, 140, options.logoSize),
    scene,
    chat
  };
}

export function bringToFront(scene: OverlayScene, id: string): OverlayScene {
  const top = scene.widgets.reduce((max, widget) => Math.max(max, widget.frame.z), 0) + 1;
  return updateWidget(scene, id, { frame: { ...(scene.widgets.find(widget => widget.id === id)?.frame || { x: 0, y: 0, width: 360, height: 120, z: top }), z: top } });
}
