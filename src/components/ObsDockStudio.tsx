import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  HelpCircle,
  Info,
  Layers,
  Monitor,
  Move,
  Palette,
  PanelTopOpen,
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

export function ObsDockStudio({ playback, queue, language = 'de' }: Props) {
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
      title: language === 'de' ? 'Auto-Responsive (Empfohlen)' : 'Auto-Responsive (Recommended)',
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
    <section className="studio-shell" aria-labelledby="dock-studio-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <PanelTopOpen aria-hidden="true" /> OBS Custom Browser Dock
          </span>
          <h2 id="dock-studio-title">
            {language === 'de' ? 'Songbot-Dock gestalten' : 'Customize Songbot dock'}
          </h2>
          <p>
            {language === 'de'
              ? 'Passe Layout, Warteschlange, Player-Elemente und Darstellung an. Die erzeugte URL übernimmt alle Einstellungen direkt in OBS.'
              : 'Customize layout, queue, player controls and appearance. The generated URL carries the settings directly into OBS.'}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setOptions(DEFAULT_DOCK_OPTIONS)}
          title={language === 'de' ? 'Auf Standardwerte zurücksetzen' : 'Reset to defaults'}
        >
          <RotateCcw aria-hidden="true" />
          {language === 'de' ? 'Zurücksetzen' : 'Reset'}
        </button>
      </div>

      <div className="studio-layout">
        <div className="studio-controls">
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

              <div className="range-grid">
                <label>
                  <span>
                    {language === 'de' ? 'Hintergrund-Deckkraft' : 'Background opacity'}{' '}
                    <output>{Math.round(options.opacity * 100)}%</output>
                  </span>
                  <input
                    type="range"
                    min="0.35"
                    max="1"
                    step="0.05"
                    value={options.opacity}
                    onChange={(event) => patch({ opacity: Number(event.target.value) })}
                  />
                </label>
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

        {/* Right Column: Live Preview & Ready Output */}
        <div className="studio-preview-column">
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

          {/* Setup / Output Card directly under the preview */}
          <div className="obs-output-card">
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" aria-hidden="true" />
                  {language === 'de' ? 'OBS Dock-URL bereit' : 'OBS Dock URL ready'}
                </h3>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  {language === 'de' ? 'Echtzeit-Synchron' : 'Live Sync'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                {language === 'de'
                  ? 'Kopiere diese URL und binde sie in OBS Studio als benutzerdefiniertes Browser-Dock ein:'
                  : 'Copy this URL and add it as a custom browser dock in OBS Studio:'}
              </p>
            </div>

            <div className="copy-row">
              <input
                id="dock-url-input"
                readOnly
                value={dockUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={language === 'de' ? 'Dock-URL' : 'Dock URL'}
              />
              <button
                className="primary-button"
                type="button"
                onClick={() => void copyUrl()}
              >
                {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                {copied
                  ? (language === 'de' ? 'Kopiert' : 'Copied')
                  : (language === 'de' ? 'URL kopieren' : 'Copy URL')}
              </button>
            </div>

            <div className="output-actions">
              <a
                className="secondary-button"
                href={dockUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink aria-hidden="true" />
                {language === 'de' ? 'Dock im Browser testen' : 'Test dock in browser'}
              </a>
              <span className="text-xs text-neutral-400 font-mono">
                {options.layout === 'auto'
                  ? 'layout=auto (Responsive)'
                  : `${options.layout} · ${options.density}`}
              </span>
            </div>

            <div className="bg-purple-950/25 border border-purple-800/35 rounded-xl p-3 text-xs text-purple-200/90 leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong className="text-purple-300">
                  {language === 'de' ? 'Tipp:' : 'Tip:'}
                </strong>{' '}
                {language === 'de'
                  ? 'Verwende Auto-Responsive für frei verschiebbare OBS-Docks. Die Lautstärke wird beim Ziehen lokal flüssig angezeigt und nach dem Loslassen an YouTube Music übertragen.'
                  : 'Use Auto-Responsive for resizable OBS docks. Volume changes update smoothly in real-time and are dispatched to YouTube Music after dragging.'}
              </div>
            </div>
          </div>

          {/* Detailed Step-by-Step OBS Implementation Guide */}
          <div className="obs-dock-guide">
            <div className="obs-dock-guide-header">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <BookOpen className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-neutral-100">
                  {language === 'de'
                    ? 'Schritt-für-Schritt-Anleitung: Dock in OBS einbinden'
                    : 'Step-by-Step Guide: How to implement dock into OBS'}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {language === 'de'
                    ? 'Folge diesen 4 Schritten, um den interaktiven Player direkt in deine OBS-Benutzeroberfläche einzubetten:'
                    : 'Follow these 4 steps to embed the interactive player directly into your OBS interface:'}
                </p>
              </div>
            </div>

            <div className="obs-dock-steps-list">
              {/* Step 1 */}
              <div className="obs-dock-step-item">
                <div className="obs-dock-step-badge">1</div>
                <div className="obs-dock-step-content">
                  <div className="obs-dock-step-title">
                    <span>{language === 'de' ? 'Dock-URL kopieren' : 'Copy Dock URL'}</span>
                  </div>
                  <p className="obs-dock-step-desc">
                    {language === 'de'
                      ? 'Klicke oben auf „URL kopieren“. Deine gewählten Einstellungen (Layout, Akzentfarbe, sichtbare Elemente) sind bereits fest in der URL hinterlegt.'
                      : 'Click “Copy URL” above. Your selected settings (layout, accent color, visible elements) are already encoded into the URL.'}
                  </p>
                  <div className="mt-2">
                    <button
                      type="button"
                      className="secondary-button text-xs py-1 px-2.5 inline-flex items-center gap-1.5"
                      onClick={() => void copyUrl()}
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> : <Clipboard className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />}
                      <span>{copied ? (language === 'de' ? 'URL kopiert!' : 'URL copied!') : (language === 'de' ? 'URL jetzt kopieren' : 'Copy URL now')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="obs-dock-step-item">
                <div className="obs-dock-step-badge">2</div>
                <div className="obs-dock-step-content">
                  <div className="obs-dock-step-title">
                    <Monitor className="w-4 h-4 text-purple-400" aria-hidden="true" />
                    <span>{language === 'de' ? 'Menü in OBS Studio öffnen' : 'Open Menu in OBS Studio'}</span>
                  </div>
                  <p className="obs-dock-step-desc">
                    {language === 'de'
                      ? 'Öffne OBS Studio und klicke ganz oben in der Hauptmenüleiste auf:'
                      : 'Open OBS Studio and click in the top main menu bar on:'}
                  </p>
                  <div className="obs-dock-path">
                    <span>Docks</span>
                    <ArrowRight className="w-3 h-3 text-purple-400 shrink-0" aria-hidden="true" />
                    <span>{language === 'de' ? 'Benutzerdefinierte Browser-Docks…' : 'Custom Browser Docks…'}</span>
                  </div>
                  <p className="obs-dock-step-desc text-neutral-500">
                    {language === 'de'
                      ? '(Es öffnet sich das OBS-Einstellungsfenster mit einer Tabelle für deine Docks)'
                      : '(The OBS settings dialog will open showing a list of your docks)'}
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="obs-dock-step-item">
                <div className="obs-dock-step-badge">3</div>
                <div className="obs-dock-step-content">
                  <div className="obs-dock-step-title">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                    <span>{language === 'de' ? 'Dock anlegen & URL einfügen' : 'Create Dock & Paste URL'}</span>
                  </div>
                  <div className="obs-dock-step-desc space-y-1.5 mt-1">
                    <div>
                      <strong className="text-neutral-200">
                        {language === 'de' ? '1. Dock-Name:' : '1. Dock Name:'}
                      </strong>{' '}
                      {language === 'de'
                        ? 'Trage in der linken Spalte einen Namen ein (z. B.'
                        : 'Enter a name in the left column (e.g.'}{' '}
                      <span className="obs-dock-kbd">Music Bot</span>
                      {language === 'de' ? ').' : ').'}
                    </div>
                    <div>
                      <strong className="text-neutral-200">
                        {language === 'de' ? '2. URL:' : '2. URL:'}
                      </strong>{' '}
                      {language === 'de'
                        ? 'Klicke in das rechte URL-Feld und füge die kopierte URL ein mit'
                        : 'Click into the right URL field and paste your copied URL using'}{' '}
                      <kbd className="obs-dock-kbd">Strg + V</kbd>
                      <span className="text-neutral-500 text-[11px] ml-1">
                        {language === 'de' ? '(Mac: Cmd + V)' : '(Mac: Cmd + V)'}
                      </span>
                    </div>
                    <div>
                      <strong className="text-neutral-200">
                        {language === 'de' ? '3. Übernehmen:' : '3. Apply:'}
                      </strong>{' '}
                      {language === 'de'
                        ? 'Klicke unten rechts im Dialog auf den Button „Übernehmen“ (bzw. „Apply“).'
                        : 'Click the “Apply” button in the bottom right corner of the dialog.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="obs-dock-step-item">
                <div className="obs-dock-step-badge">4</div>
                <div className="obs-dock-step-content">
                  <div className="obs-dock-step-title">
                    <Move className="w-4 h-4 text-purple-400" aria-hidden="true" />
                    <span>{language === 'de' ? 'Dock im OBS-Fenster platzieren' : 'Position Dock in OBS'}</span>
                  </div>
                  <p className="obs-dock-step-desc">
                    {language === 'de'
                      ? 'Das neue Player-Dock öffnet sich sofort als eigenes Fenster in OBS. Klicke auf die Titelleiste des Fensters und ziehe es mit gedrückter Maustaste an die gewünschte Position in OBS (z. B. neben den Twitch-Chat, über den Audio-Mixer oder als Tab). OBS rastet es automatisch ein.'
                      : 'The player dock window opens immediately in OBS. Drag it by its title bar to your desired position in OBS (e.g. next to Twitch chat, above audio mixer, or as a tab). OBS will automatically dock it into place.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Pro-Tips & Troubleshooting */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="bg-purple-950/20 border border-purple-800/30 rounded-xl p-3 text-xs text-purple-200/90 leading-relaxed flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="text-purple-300 block mb-0.5">
                    {language === 'de' ? 'Volle Interaktivität' : 'Fully Interactive'}
                  </strong>
                  {language === 'de'
                    ? 'Du kannst Songs pausieren, überspringen, die Lautstärke regeln und durch die Warteschlange scrollen – direkt in OBS, ohne Tabwechsel während des Games.'
                    : 'Pause or skip songs, adjust volume, and view the queue directly inside OBS without switching windows.'}
                </div>
              </div>

              <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-300 leading-relaxed flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="text-neutral-200 block mb-0.5">
                    {language === 'de' ? 'Reiter „Docks“ fehlt?' : 'Missing “Docks” Menu?'}
                  </strong>
                  {language === 'de'
                    ? 'Browser-Docks erfordern OBS Studio v27+. Bei älteren OBS-Versionen findest du Docks unter „Ansicht → Docks“.'
                    : 'Browser docks require OBS Studio v27+. In older OBS versions, find docks under “View → Docks”.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ObsDockStudio;
