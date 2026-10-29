export type DockLayout = 'auto' | 'horizontal' | 'vertical';
export type DockDensity = 'compact' | 'comfortable';

export type DockOptions = {
  layout: DockLayout;
  showQueue: boolean;
  queueItems: number;
  showCover: boolean;
  showProgress: boolean;
  showVolume: boolean;
  showLinks: boolean;
  density: DockDensity;
  accent: string;
  opacity: number;
  scale: number;
};

export const DEFAULT_DOCK_OPTIONS: DockOptions = {
  layout: 'auto',
  showQueue: true,
  queueItems: 8,
  showCover: true,
  showProgress: true,
  showVolume: true,
  showLinks: true,
  density: 'comfortable',
  accent: '#ffffff',
  opacity: 1,
  scale: 1,
};

const boolParam = (params: URLSearchParams, key: string, fallback: boolean) => {
  const value = params.get(key);
  if (value === null) return fallback;
  return value !== '0' && value !== 'false';
};

const numberParam = (params: URLSearchParams, key: string, fallback: number, min: number, max: number) => {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

export function parseDockOptions(params: URLSearchParams): DockOptions {
  const layout = params.get('layout');
  const density = params.get('density');
  const accent = params.get('accent');
  return {
    layout: layout === 'horizontal' || layout === 'vertical' ? layout : 'auto',
    showQueue: boolParam(params, 'queue', true),
    queueItems: Math.round(numberParam(params, 'queueItems', 8, 1, 25)),
    showCover: boolParam(params, 'cover', true),
    showProgress: boolParam(params, 'progress', true),
    showVolume: boolParam(params, 'volume', true),
    showLinks: boolParam(params, 'links', true),
    density: density === 'compact' ? 'compact' : 'comfortable',
    accent: accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#ffffff',
    opacity: numberParam(params, 'opacity', 1, 0.35, 1),
    scale: numberParam(params, 'scale', 1, 0.8, 1.25),
  };
}

export function buildDockSearch(options: DockOptions) {
  const params = new URLSearchParams();
  const rawOpacity = Number(options?.opacity ?? 1);
  const safeOpacity = Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0.35, rawOpacity)) : 1;
  const rawScale = Number(options?.scale ?? 1);
  const safeScale = Number.isFinite(rawScale) ? Math.min(1.25, Math.max(0.8, rawScale)) : 1;
  const rawQueueItems = Number(options?.queueItems ?? 8);
  const safeQueueItems = Number.isFinite(rawQueueItems) ? Math.round(Math.min(25, Math.max(1, rawQueueItems))) : 8;
  const safeAccent = options?.accent && /^#[0-9a-f]{6}$/i.test(options.accent) ? options.accent.toLowerCase() : '#ffffff';

  params.set('layout', options?.layout === 'horizontal' || options?.layout === 'vertical' ? options.layout : 'auto');
  params.set('queue', options?.showQueue ? '1' : '0');
  params.set('queueItems', String(safeQueueItems));
  params.set('cover', options?.showCover ? '1' : '0');
  params.set('progress', options?.showProgress ? '1' : '0');
  params.set('volume', options?.showVolume ? '1' : '0');
  params.set('links', options?.showLinks ? '1' : '0');
  params.set('density', options?.density === 'compact' ? 'compact' : 'comfortable');
  params.set('accent', safeAccent);
  params.set('opacity', safeOpacity.toFixed(2));
  params.set('scale', safeScale.toFixed(2));
  return params.toString();
}
