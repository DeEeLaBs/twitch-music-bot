import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clipboard,
  ExternalLink,
  HelpCircle,
  Layers,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { PlaybackState, Track } from '../types.ts';
import { ObsPlayerDock } from './ObsPlayerDock.tsx';
import {
  buildDockSearch,
  DEFAULT_DOCK_OPTIONS,
  parseDockOptions,
  type DockLayout,
  type DockOptions,
} from '../dockOptions.ts';

type Props = {
  playback: PlaybackState;
  queue: Track[];
  language?: 'de' | 'en';
  player?: 'youtube_music' | 'spotify';
  playerConnected?: boolean;
};

const COLOR_PRESETS = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Cyan', hex: '#06b6d4' },
];

const SAMPLE_TRACK: Track = {
  id: 'preview-sample-1',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  duration: 200,
  url: 'https://music.youtube.com/watch?v=4NRXx6U8ABQ',
  videoId: '4NRXx6U8ABQ',
  albumArtUrl: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
  requester: { username: 'streamfan', displayName: 'StreamFan', badge: 'vip', color: '#a855f7' },
  requestedAt: Date.now() - 35000,
  requestSource: 'youtube',
};

const SAMPLE_QUEUE: Track[] = [
  {
    id: 'preview-queue-1',
    title: 'Starboy',
    artist: 'The Weeknd feat. Daft Punk',
    duration: 230,
    url: 'https://music.youtube.com/watch?v=dQTnMUey4S8',
    albumArtUrl: 'https://i.ytimg.com/vi/dQTnMUey4S8/hqdefault.jpg',
    requester: { username: 'chatmod', displayName: 'ChatMod', badge: 'moderator' },
    requestedAt: Date.now() - 15000,
    requestSource: 'youtube',
  },
  {
    id: 'preview-queue-2',
    title: 'Save Your Tears',
    artist: 'The Weeknd',
    duration: 215,
    url: 'https://music.youtube.com/watch?v=XXYlFuWEuKI',
    albumArtUrl: 'https://i.ytimg.com/vi/XXYlFuWEuKI/hqdefault.jpg',
    requester: { username: 'viewer99', displayName: 'Viewer99', badge: 'viewer' },
    requestedAt: Date.now() - 5000,
    requestSource: 'spotify',
  },
];

const SAMPLE_PLAYBACK: PlaybackState = {
  currentSong: SAMPLE_TRACK,
  isPlaying: true,
  progressSeconds: 84,
  durationSeconds: 200,
  volume: 75,
  source: 'queue',
  status: 'playing',
};

type PreviewErrorBoundaryProps = { children: React.ReactNode };
type PreviewErrorBoundaryState = { hasError: boolean };

class PreviewErrorBoundary extends React.Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  declare props: Readonly<PreviewErrorBoundaryProps>;
  state: PreviewErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PreviewErrorBoundaryState {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Dock preview error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center text-xs text-neutral-400">
          <p className="text-amber-400 font-semibold mb-2">Vorschau konnte nicht geladen werden</p>
          <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
            Vorschau neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ObsDockStudio({ playback, queue, language = 'de', player = 'youtube_music', playerConnected = true }: Props) {
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState<DockOptions>(() => {
    try {
      const saved = window.localStorage.getItem('obs-dock-options-v1');
      if (saved) return parseDockOptions(new URLSearchParams(buildDockSearch({ ...DEFAULT_DOCK_OPTIONS, ...JSON.parse(saved) })));
    } catch { /* Use defaults if browser storage is unavailable or damaged. */ }
    return DEFAULT_DOCK_OPTIONS;
  });
  useEffect(() => {
    try { window.localStorage.setItem('obs-dock-options-v1', JSON.stringify(options)); } catch { /* Browser storage is optional. */ }
  }, [options]);
  const [autoSimulation, setAutoSimulation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [previewBackground, setPreviewBackground] = useState<'transparent' | 'dark'>('transparent');
  const [guideOpen, setGuideOpen] = useState(() => {
    try { return window.localStorage.getItem('obs-dock-guide-v1') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('obs-dock-guide-v1', guideOpen ? '1' : '0'); } catch { /* Browser storage is optional. */ }
  }, [guideOpen]);
  const safeQueue = Array.isArray(queue) ? queue : [];
  const [useDemoData, setUseDemoData] = useState(() => !playback?.currentSong && safeQueue.length === 0);

  const dockUrl = useMemo(() => {
    const origin = typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
    return `${origin}/dock/player?${buildDockSearch(options)}`;
  }, [options]);

  function patch(next: Partial<DockOptions>) {
    setOptions((current) => ({ ...current, ...next }));
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(dockUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      const input = document.createElement('input');
      input.value = dockUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  const effectivePlayback = useDemoData || !playback?.currentSong ? SAMPLE_PLAYBACK : playback;
  const effectiveQueue = useDemoData || safeQueue.length === 0 ? SAMPLE_QUEUE : safeQueue;

  // Resolve what layout orientation the preview container shell should simulate
  const effectivePreviewLayout = options.layout === 'auto' ? autoSimulation : options.layout;
  const previewOptions: DockOptions = {
    ...options,
    layout: options.layout === 'auto' ? autoSimulation : options.layout,
  };

  const layoutOptions: Array<{ id: DockLayout; title: string; desc: string }> = [
    {
      id: 'auto',
      title: 'Auto',
      desc: language === 'de'
        ? 'Passt sich dynamisch an Breite & Höhe des Dock-Fensters in OBS an.'
        : 'Dynamically adapts between horizontal and vertical based on dock size in OBS.',
    },
    {
      id: 'horizontal',
      title: 'Horizontal',
      desc: language === 'de'
        ? 'Feste Querformat-Leiste für den oberen oder unteren Dock-Bereich.'
        : 'Fixed landscape bar for top or bottom dock areas.',
    },
    {
      id: 'vertical',
      title: language === 'de' ? 'Vertikal' : 'Vertical',
      desc: language === 'de'
        ? 'Schlanke Hochformat-Leiste für linke oder rechte OBS-Spalten.'
        : 'Slim portrait sidebar for left or right OBS columns.',
    },
  ];

  return (
    <section className="dock-studio" aria-label={language === 'de' ? 'Songbot-Dock gestalten' : 'Customize Songbot dock'}>
      <div className={`dock-studio-body${guideOpen ? '' : ' is-guide-hidden'}`}>
        <div className="dock-studio-controls">
          {/* Group 1: Layout & Dimension */}
          <fieldset className="control-group">
            <legend>
              <SlidersHorizontal aria-hidden="true" />
              {language === 'de' ? 'Layout & Format' : 'Layout & format'}
            </legend>
            <div className="layout-options">
              {layoutOptions.map((item) => {
                const isSelected = options.layout === item.id;
                return (
                  <label
                    key={item.id}
                    className={`layout-option ${isSelected ? 'is-selected' : ''}`}
                    title={item.desc}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="dock-layout-choice"
                      checked={isSelected}
                      onChange={() => patch({ layout: item.id })}
                    />
                    <strong>{item.title}</strong>
                    <small>{item.desc}</small>
                  </label>
                );
              })}
            </div>

            <div className="range-grid mt-4">
              <label>
                <span>
                  {language === 'de' ? 'Queue-Einträge' : 'Queue items'}{' '}
                  <output>{options.queueItems}</output>
                </span>
                <input
                  type="range"
                  min="1"
                  max="25"
                  step="1"
                  value={options.queueItems}
                  disabled={!options.showQueue}
                  onChange={(event) => patch({ queueItems: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>
                  {language === 'de' ? 'Skalierung' : 'Scale'}{' '}
                  <output>{Math.round(options.scale * 100)}%</output>
                </span>
                <input
                  type="range"
                  min="0.8"
                  max="1.25"
                  step="0.05"
                  value={options.scale}
                  onChange={(event) => patch({ scale: Number(event.target.value) })}
                />
              </label>
            </div>
          </fieldset>

          {/* Group 2: Content & Toggles */}
          <fieldset className="control-group">
            <legend>
              <Layers aria-hidden="true" />
              {language === 'de' ? 'Inhalte & Elemente' : 'Content & elements'}
            </legend>
            <div className="toggle-grid">
              {[
                ['showQueue', language === 'de' ? 'Warteschlange' : 'Queue'],
                ['showCover', language === 'de' ? 'Cover-Artwork' : 'Artwork'],
                ['showProgress', language === 'de' ? 'Fortschrittsbalken' : 'Progress bar'],
                ['showVolume', language === 'de' ? 'Lautstärkeregler' : 'Volume slider'],
                ['showLinks', language === 'de' ? 'Schnelllinks' : 'Quick links'],
              ].map(([key, label]) => (
                <label className="switch-row" key={key}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(options[key as keyof DockOptions])}
                    onChange={(event) =>
                      patch({ [key]: event.target.checked } as Partial<DockOptions>)
                    }
                  />
                  <span className="switch" aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          {/* Group 3: Appearance & Styling */}
          <fieldset className="control-group">
            <legend>
              <Palette aria-hidden="true" />
              {language === 'de' ? 'Darstellung & Design' : 'Appearance & design'}
            </legend>

            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-neutral-300 block mb-1.5">
                  {language === 'de' ? 'Dichte' : 'Density'}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['comfortable', 'compact'] as const).map((mode) => {
                    const active = options.density === mode;
                    return (
                      <label
                        key={mode}
                        className={`theme-option ${active ? 'is-selected' : ''}`}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="dock-density"
                          checked={active}
                          onChange={() => patch({ density: mode })}
                        />
                        <span className="text-xs font-semibold">
                          {mode === 'comfortable'
                            ? (language === 'de' ? 'Komfortabel' : 'Comfortable')
                            : (language === 'de' ? 'Kompakt' : 'Compact')}
                        </span>
                      </label>
                    );
                  })}
                </div>
            </div>

            <div className="space-y-1.5 pt-1">
                <span className="text-xs font-bold text-neutral-300 block">
                  {language === 'de' ? 'Akzentfarbe' : 'Accent color'}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOR_PRESETS.map((preset) => {
                    const isSelected = options.accent.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${
                          isSelected
                            ? 'scale-110 border-white ring-2 ring-purple-500'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                        title={preset.name}
                        onClick={() => patch({ accent: preset.hex })}
                      />
                    );
                  })}
                  <div className="color-control ml-auto">
                    <input
                      type="color"
                      value={options.accent}
                      onChange={(event) => patch({ accent: event.target.value })}
                      title={language === 'de' ? 'Eigene Farbe wählen' : 'Pick custom color'}
                    />
                    <output>{options.accent.toUpperCase()}</output>
                  </div>
                </div>
              </div>
            </div>
          </fieldset>
        </div>

        <div className="dock-studio-stage-wrap">
          <div className="preview-toolbar">
            <div className="flex items-center gap-2">
              <strong>{language === 'de' ? 'Vorschau' : 'Preview'}</strong>
              {options.layout === 'auto' && (
                <span className="text-[11px] text-purple-400 font-mono bg-purple-950/60 border border-purple-800/50 px-2 py-0.5 rounded-md">
                  {language === 'de' ? 'Auto-Testmodus' : 'Auto test mode'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {options.layout === 'auto' ? (
                <div role="group" aria-label={language === 'de' ? 'Format testen' : 'Test orientation'}>
                  {(['horizontal', 'vertical'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={autoSimulation === mode ? 'is-active' : ''}
                      onClick={() => setAutoSimulation(mode)}
                    >
                      {mode === 'horizontal'
                        ? 'Horizontal'
                        : (language === 'de' ? 'Vertikal' : 'Vertical')}
                    </button>
                  ))}
                </div>
              ) : (
                <div role="group" aria-label={language === 'de' ? 'Layout wechseln' : 'Switch layout'}>
                  {(['horizontal', 'vertical'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={options.layout === mode ? 'is-active' : ''}
                      onClick={() => patch({ layout: mode })}
                    >
                      {mode === 'horizontal'
                        ? 'Horizontal'
                        : (language === 'de' ? 'Vertikal' : 'Vertical')}
                    </button>
                  ))}
                </div>
              )}

              <div role="group" aria-label={language === 'de' ? 'Bühnen-Hintergrund' : 'Stage background'}>
                {(['transparent', 'dark'] as const).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    className={previewBackground === bg ? 'is-active' : ''}
                    onClick={() => setPreviewBackground(bg)}
                    title={
                      bg === 'transparent'
                        ? (language === 'de' ? 'Transparenter Hintergrund' : 'Transparent background')
                        : (language === 'de' ? 'Dunkler Hintergrund' : 'Dark background')
                    }
                  >
                    {bg === 'transparent'
                      ? (language === 'de' ? 'Schachbrett' : 'Grid')
                      : (language === 'de' ? 'Dunkel' : 'Dark')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() => setOptions(DEFAULT_DOCK_OPTIONS)}
                title={language === 'de' ? 'Auf Standardwerte zurücksetzen' : 'Reset to defaults'}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {language === 'de' ? 'Zurücksetzen' : 'Reset'}
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1${guideOpen ? ' is-active' : ''}`}
                aria-pressed={guideOpen}
                onClick={() => setGuideOpen(open => !open)}
                title={guideOpen
                  ? (language === 'de' ? 'Anleitung ausblenden' : 'Hide the guide')
                  : (language === 'de' ? 'Anleitung einblenden' : 'Show the guide')}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {language === 'de' ? 'Anleitung' : 'Guide'}
              </button>
            </div>
          </div>

          {/* Stage with centered preview shell */}
          <div className={`dock-stage stage-${previewBackground}`}>
            <div
              className={`obs-dock-preview-shell obs-dock-preview-shell--${effectivePreviewLayout}`}
            >
              <PreviewErrorBoundary>
                <ObsPlayerDock
                  playback={effectivePlayback}
                  queue={effectiveQueue}
                  language={language}
                  interactive={false}
                  options={previewOptions}
                  player={player}
                  playerConnected={playerConnected}
                />
              </PreviewErrorBoundary>
            </div>
          </div>

          {/* Demo toggle */}
          <label className="switch-row preview-demo-switch">
            <span>
              {language === 'de'
                ? 'Demo-Song & Warteschlange in Vorschau'
                : 'Demo track & queue in preview'}
            </span>
            <input
              type="checkbox"
              checked={useDemoData}
              onChange={(e) => setUseDemoData(e.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
          </label>

          <div className="dock-url-card">
            <div className="dock-url-head">
              <strong>{language === 'de' ? 'OBS Dock-URL' : 'OBS Dock URL'}</strong>
              <span>{language === 'de' ? 'Echtzeit-Synchron' : 'Live sync'}</span>
            </div>
            <div className="copy-row">
              <input
                id="dock-url-input"
                readOnly
                value={dockUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={language === 'de' ? 'Dock-URL' : 'Dock URL'}
              />
              <button className="primary-button" type="button" onClick={() => void copyUrl()}>
                {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                {copied ? (language === 'de' ? 'Kopiert' : 'Copied') : (language === 'de' ? 'Kopieren' : 'Copy')}
              </button>
              <a className="secondary-button" href={dockUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                {language === 'de' ? 'Testen' : 'Test'}
              </a>
            </div>
          </div>
        </div>

        {guideOpen && (
        <aside className="dock-studio-guide" aria-label={language === 'de' ? 'Anleitung' : 'Guide'}>
          <div className="obs-dock-guide-header">
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div>
              <h2>{language === 'de' ? 'Anleitung' : 'Guide'}</h2>
              <p>{language === 'de' ? 'Player direkt in OBS einbetten.' : 'Embed the player in OBS.'}</p>
            </div>
          </div>
          <ol className="dock-guide-steps">
            <li>
              <b>1</b>
              <div>
                <strong>{language === 'de' ? 'URL kopieren' : 'Copy the URL'}</strong>
                <span>{language === 'de' ? 'Layout, Farbe und sichtbare Teile stecken schon im Link.' : 'Layout, color, and visible parts are already in the link.'}</span>
              </div>
            </li>
            <li>
              <b>2</b>
              <div>
                <strong>{language === 'de' ? 'Menü in OBS öffnen' : 'Open the OBS menu'}</strong>
                <span className="obs-dock-path">
                  <span>Docks</span>
                  <ArrowRight aria-hidden="true" />
                  <span>{language === 'de' ? 'Benutzerdefinierte Browser-Docks…' : 'Custom Browser Docks…'}</span>
                </span>
              </div>
            </li>
            <li>
              <b>3</b>
              <div>
                <strong>{language === 'de' ? 'Dock anlegen' : 'Create the dock'}</strong>
                <span>
                  {language === 'de' ? 'Name' : 'Name'} <kbd className="obs-dock-kbd">Music Bot</kbd>
                  {language === 'de' ? ', URL mit' : ', paste with'} <kbd className="obs-dock-kbd">Ctrl+V</kbd>
                  {language === 'de' ? ', dann Übernehmen.' : ', then Apply.'}
                </span>
              </div>
            </li>
            <li>
              <b>4</b>
              <div>
                <strong>{language === 'de' ? 'Fenster einrasten' : 'Place the window'}</strong>
                <span>{language === 'de' ? 'An der Titelleiste neben Chat, Mixer oder als Tab ziehen.' : 'Drag it by the title bar next to chat, the mixer, or into a tab.'}</span>
              </div>
            </li>
          </ol>
          <p className="dock-guide-note">
            <Sparkles aria-hidden="true" />
            <span>{language === 'de' ? 'Pause, Skip, Lautstärke und Queue funktionieren direkt in OBS.' : 'Pause, skip, volume, and the queue work inside OBS.'}</span>
          </p>
          <p className="dock-guide-note">
            <HelpCircle aria-hidden="true" />
            <span>{language === 'de' ? 'Kein Docks-Menü? OBS 27+, sonst Ansicht → Docks.' : 'No Docks menu? OBS 27+, or View → Docks on older versions.'}</span>
          </p>
        </aside>
        )}
      </div>
    </section>
  );
}

export default ObsDockStudio;
