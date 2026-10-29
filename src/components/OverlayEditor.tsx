import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Copy, Eye, EyeOff, Grid3x3, Image as ImageIcon, ListOrdered, Maximize2, MessageSquare, Music2, Plus, Redo2, Sparkles, Tag, Target, Timer, Trash2, Type, Undo2, Video, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { OverlayDesignMenu } from './OverlayDesignMenu.tsx';
import type { PlaybackState } from '../types.ts';
import { apiFetch } from '../apiClient.ts';
import { sampleChatLine } from '../overlayChat.ts';
import { DEFAULT_OVERLAY_OPTIONS, mergeOverlayOptions, type OverlayOptions } from '../overlayOptions.ts';
import type { AlertKind } from '../streamAlerts.ts';
import { SceneStage } from './SceneStage.tsx';
import { StreamWidgetMenu } from './StreamWidgets.tsx';
import type { CreatorEvent } from '../alertBox.ts';
import {
  bindScene,
  DESIGN_PRESETS,
  overlayBrowserUrl,
  pixelFactor,
  bringToFront,
  placeWidget,
  removeWidget,
  resizeScene,
  sceneFromLegacy,
  updateWidget,
  widgetId,
  type SceneWidgetType
} from '../scene.ts';

const CHAT_SAMPLES = [
  { id: 'message', de: 'Nachricht', en: 'Message' },
  { id: 'reply', de: 'Antwort', en: 'Reply' },
  { id: 'mention', de: 'Erwähnung', en: 'Mention' },
  { id: 'bits', de: 'Bits', en: 'Bits' },
  { id: 'first', de: 'Erste Nachricht', en: 'First message' }
] as const;

const ALERT_SAMPLES: Array<{ kind: AlertKind; de: string; en: string }> = [
  { kind: 'follow', de: 'Follow', en: 'Follow' },
  { kind: 'subscription', de: 'Abo', en: 'Subscription' },
  { kind: 'resub', de: 'Erneutes Abo', en: 'Resub' },
  { kind: 'gift', de: 'Geschenk-Abo', en: 'Gift' },
  { kind: 'cheer', de: 'Cheer', en: 'Cheer' },
  { kind: 'raid', de: 'Raid', en: 'Raid' }
];

function sendChatSample(kind: (typeof CHAT_SAMPLES)[number]['id']) {
  const now = Date.now();
  const id = `sim-${kind}-${now}`;
  const base = { id, login: 'overlayfan', displayName: 'OverlayFan', color: '#c084fc', ts: now };
  const line = kind === 'reply'
    ? sampleChatLine({ ...base, text: 'This reply uses the current chat look.', badge: 'moderator', replyTo: 'OverlayFan', replyText: 'Simulated message.' })
    : kind === 'mention'
      ? sampleChatLine({ ...base, text: '@streamer this mention uses the current chat look.', badge: 'vip' })
      : kind === 'bits'
        ? sampleChatLine({ ...base, text: 'Cheer test on the overlay.', badge: 'viewer', bits: 100, badges: [{ set: 'bits', version: '100' }] })
        : kind === 'first'
          ? sampleChatLine({ ...base, text: 'First message on the overlay.', displayName: 'NewViewer', login: 'newviewer', badge: 'viewer', first: true })
          : sampleChatLine({ ...base, text: 'Simulated message on the overlay.', badge: 'viewer' });
  window.dispatchEvent(new CustomEvent('overlay:chat-sample', { detail: line }));
}

function sendAlertSample(kind: AlertKind) {
  window.dispatchEvent(new CustomEvent('overlay:alert-sample', {
    detail: {
      id: `sim-${kind}-${Date.now()}`,
      kind,
      user: 'Viewer',
      amount: kind === 'cheer' ? 100 : kind === 'gift' || kind === 'communitygift' ? 5 : kind === 'tip' ? 5 : kind === 'raid' || kind === 'host' ? 24 : kind === 'resub' ? 6 : kind === 'subscription' ? 1 : 0,
      message: kind === 'cheer' || kind === 'tip' ? 'Hello' : '',
      months: kind === 'resub' ? 6 : kind === 'subscription' ? 1 : 0,
      tier: kind === 'subscription' || kind === 'resub' || kind === 'gift' ? '1000' : '',
      currency: kind === 'tip' ? 'EUR' : '',
      viewers: kind === 'raid' || kind === 'host' ? 24 : 0
    }
  }));
}

function sendSongSample(language: 'de' | 'en') {
  window.dispatchEvent(new CustomEvent('queue:delta', {
    detail: {
      op: 'add',
      index: 2,
      track: {
        id: `preview-${Date.now()}`,
        title: language === 'de' ? 'Beispiel-Song' : 'Example song',
        artist: 'Demo Artist',
        albumArtUrl: '',
        duration: 200,
        url: '',
        requestedAt: Date.now(),
        requester: { username: 'demo', displayName: 'Viewer', badge: 'viewer' }
      }
    }
  }));
}

const SAMPLE_PLAYBACK: PlaybackState = {
  currentSong: {
    id: 'preview-track', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours',
    albumArtUrl: 'https://i.ytimg.com/vi/fHI8X4OXluQ/hqdefault.jpg', duration: 226,
    url: 'https://music.youtube.com/watch?v=fHI8X4OXluQ', videoId: 'fHI8X4OXluQ',
    requester: { username: 'overlayfan', displayName: 'OverlayFan', badge: 'vip', color: '#a855f7' },
    requestedAt: Date.now() - 45000
  },
  isPlaying: true, progressSeconds: 94, durationSeconds: 226, volume: 65, source: 'queue', status: 'playing'
};

const WIDGET_CHOICES: Array<{ type: SceneWidgetType; de: string; en: string; icon: typeof Music2 }> = [
  { type: 'music-player', de: 'Musikplayer', en: 'Music player', icon: Music2 },
  { type: 'twitch-chat', de: 'Chat', en: 'Chat', icon: MessageSquare },
  { type: 'alert', de: 'Alert', en: 'Alert', icon: Bell },
  { type: 'label', de: 'Label', en: 'Label', icon: Tag },
  { type: 'goal', de: 'Ziel', en: 'Goal', icon: Target },
  { type: 'leaderboard', de: 'Rangliste', en: 'Leaderboard', icon: ListOrdered },
  { type: 'countdown', de: 'Countdown', en: 'Countdown', icon: Timer },
  { type: 'text', de: 'Text', en: 'Text', icon: Type },
  { type: 'image', de: 'Bilder', en: 'Images', icon: ImageIcon },
  { type: 'video', de: 'Video', en: 'Video', icon: Video },
  { type: 'fx', de: 'Effekt', en: 'Effect', icon: Sparkles }
];

const WIDGET_GROUPS: Array<{ de: string; en: string; types: SceneWidgetType[] }> = [
  { de: 'Stream', en: 'Stream', types: ['music-player', 'twitch-chat'] },
  { de: 'Alerts', en: 'Alerts', types: ['alert', 'fx'] },
  { de: 'Ziele', en: 'Goals', types: ['label', 'goal', 'leaderboard', 'countdown'] },
  { de: 'Medien', en: 'Media', types: ['text', 'image', 'video'] }
];

interface OverlayEditorProps {
  playback?: PlaybackState;
  language?: 'de' | 'en';
  embedded?: boolean;
}

export function OverlayEditor({ playback, language = 'de', embedded = false }: OverlayEditorProps) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const [options, setOptions] = useState<OverlayOptions>(DEFAULT_OVERLAY_OPTIONS);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertClipId, setAlertClipId] = useState('');
  const selectedRef = useRef<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const emulate = true;
  const [muted, setMuted] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [customSize, setCustomSize] = useState({ width: '1920', height: '1080' });
  const [notice, setNotice] = useState('');
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const past = useRef<OverlayOptions[]>([]);
  const future = useRef<OverlayOptions[]>([]);
  const dragging = useRef(false);
  const armed = useRef(false);
  const gestureScene = useRef('');
  const resolutionRef = useRef<HTMLDivElement>(null);
  const simulateRef = useRef<HTMLDivElement>(null);
  const creatorRef = useRef<HTMLDivElement>(null);

  const scene = options.scene ?? sceneFromLegacy(options.chat);
  const selected = scene.widgets.find(widget => widget.id === selectedId) || null;
  const importedClipId = alertClipId || options.alertBox.creator.clips.find(clip => clip.layers.length)?.id || '';

  useEffect(() => {
    if (!ready) return;
    setSelectedId(current => current ?? optionsRef.current.scene?.widgets.find(widget => widget.type === 'music-player')?.id ?? null);
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch('/api/v1/overlay/active').then(response => response.json()).catch(() => null),
      apiFetch('/api/v1/overlay/token').then(response => response.json()).catch(() => null)
    ]).then(([active, tokenBody]) => {
      if (cancelled) return;
      const merged = mergeOverlayOptions(active?.options);
      const nextScene = merged.scene ?? sceneFromLegacy(merged.chat);
      setOptions(bindScene(merged, nextScene));
      setCustomSize({ width: String(nextScene.design.width), height: String(nextScene.design.height) });
      if (typeof tokenBody?.token === 'string') setToken(tokenBody.token);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || dragging.current) return undefined;
    const handle = window.setTimeout(() => {
      void apiFetch('/api/v1/overlay/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: optionsRef.current })
      }).catch(() => {});
    }, 400);
    return () => window.clearTimeout(handle);
  }, [options, ready]);

  const snapshot = () => {
    if (armed.current) return;
    armed.current = true;
    past.current = [...past.current, structuredClone(optionsRef.current)].slice(-50);
    future.current = [];
  };
  const replace = (next: OverlayOptions, keepHistory = false) => {
    if (!keepHistory) {
      if (!armed.current) past.current = [...past.current, structuredClone(optionsRef.current)].slice(-50);
      future.current = [];
      armed.current = false;
    }
    setOptions(next);
  };
  const undo = () => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(structuredClone(optionsRef.current));
    setOptions(previous);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(optionsRef.current));
    setOptions(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); redo(); return; }
      if (event.altKey && (key === 'x' || key === 'f')) { event.preventDefault(); setZoom(1); return; }
      if (event.key === 'Escape') { selectWidget(null); setCreatorOpen(false); setSimulateOpen(false); return; }
      const current = optionsRef.current;
      const currentScene = current.scene;
      const id = selectedId;
      if (!currentScene || !id) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        replace(bindScene(current, removeWidget(currentScene, id)));
        selectWidget(null);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null;
      if (!delta) return;
      event.preventDefault();
      const widget = currentScene.widgets.find(item => item.id === id);
      if (!widget) return;
      const frame = { ...widget.frame, x: widget.frame.x + delta[0], y: widget.frame.y + delta[1] };
      replace(bindScene(current, updateWidget(currentScene, id, { frame })));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  useEffect(() => {
    if (!resolutionOpen) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!resolutionRef.current?.contains(event.target as Node)) setResolutionOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResolutionOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [resolutionOpen]);

  useEffect(() => {
    if (!simulateOpen) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!simulateRef.current?.contains(event.target as Node)) setSimulateOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSimulateOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [simulateOpen]);

  useEffect(() => {
    if (!creatorOpen) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!creatorRef.current?.contains(event.target as Node)) setCreatorOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [creatorOpen]);

  const applyDesign = (width: number, height: number) => {
    const current = optionsRef.current;
    const currentScene = current.scene ?? sceneFromLegacy(current.chat);
    const factor = pixelFactor(currentScene.design, { width, height });
    replace(bindScene(current, resizeScene(currentScene, width, height), factor));
    setResolutionOpen(false);
  };

  const rememberClip = (box: OverlayOptions['alertBox']) => {
    const clips = box.creator.clips.filter(item => item.layers.length);
    setAlertClipId(currentId => currentId && clips.some(item => item.id === currentId) ? currentId : clips[0]?.id || '');
  };
  const importCreatorAlerts = async () => {
    rememberClip(optionsRef.current.alertBox);
    const active = await apiFetch('/api/v1/overlay/active').then(response => response.json()).catch(() => null);
    const incoming = mergeOverlayOptions(active?.options).alertBox;
    const current = optionsRef.current;
    if (JSON.stringify(current.alertBox.creator) !== JSON.stringify(incoming.creator)) {
      setOptions({ ...current, alertBox: { ...current.alertBox, creator: incoming.creator } });
      rememberClip(incoming);
    }
  };
  const selectWidget = (id: string | null) => {
    const type = optionsRef.current.scene?.widgets.find(widget => widget.id === id)?.type;
    if (type === 'alert' && selectedRef.current !== id) void importCreatorAlerts();
    selectedRef.current = id;
    setSelectedId(id);
  };
  const addWidget = (type: SceneWidgetType, at?: { x: number; y: number }) => {
    const current = optionsRef.current;
    const currentScene = current.scene ?? sceneFromLegacy(current.chat);
    const existing = currentScene.widgets.find(widget => widget.type === type);
    setCreatorOpen(false);
    if (existing) { selectWidget(existing.id); return; }
    const next = placeWidget(currentScene, type, at);
    replace(bindScene(current, next));
    selectWidget(widgetId(type));
  };

  const edit = (recipe: (current: OverlayOptions) => OverlayOptions, history: boolean) => {
    if (history) {
      if (!armed.current) past.current = [...past.current, structuredClone(optionsRef.current)].slice(-50);
      future.current = [];
      armed.current = false;
    }
    setOptions(recipe(optionsRef.current));
  };
  const editWidgetCss = (css: string, history: boolean) => {
    const current = optionsRef.current;
    if (!current.scene || !selected) return;
    edit(() => bindScene(current, updateWidget(current.scene!, selected.id, { css })), history);
  };

  const browserUrl = useMemo(() => overlayBrowserUrl(window.location.origin, token, scene), [token, scene]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(browserUrl);
      setNotice(ui('OBS-URL kopiert.', 'OBS URL copied.'));
    } catch {
      setNotice(ui('Kopieren fehlgeschlagen.', 'Copy failed.'));
    }
    window.setTimeout(() => setNotice(''), 2000);
  };

  const previewPlayback = emulate || !playback?.currentSong ? SAMPLE_PLAYBACK : playback;
  const widgetLabel = (type: SceneWidgetType) => {
    const choice = WIDGET_CHOICES.find(item => item.type === type);
    return choice ? ui(choice.de, choice.en) : type;
  };
  const inspector = selected?.type === 'music-player' || selected?.type === 'twitch-chat' ? (
    <OverlayDesignMenu
      options={options}
      language={language}
      target={selected.type}
      widgetCss={selected.css}
      fontSize={selected.fontSize}
      onFontSize={(fontSize, history) => {
        const current = optionsRef.current;
        if (!current.scene) return;
        edit(() => bindScene(current, updateWidget(current.scene!, selected.id, { fontSize })), history);
      }}
      onEdit={edit}
      onArm={snapshot}
      onRelease={() => { armed.current = false; }}
      onWidgetCss={editWidgetCss}
    />
  ) : selected?.type === 'alert' ? (
    <AlertImportList
      clips={options.alertBox.creator.clips.filter(item => item.layers.length).map(item => ({ id: item.id, event: item.event, name: item.name }))}
      activeId={importedClipId}
      language={language}
      onPick={setAlertClipId}
    />
  ) : selected ? (
    <StreamWidgetMenu
      widget={selected}
      language={language}
      fonts={options.alertBox.fonts}
      onVariant={(variant, history) => {
        const current = optionsRef.current;
        if (!current.scene) return;
        edit(() => bindScene(current, updateWidget(current.scene!, selected.id, { variant })), history);
      }}
      onFont={(fonts, family, history) => {
        const current = optionsRef.current;
        if (!current.scene) return;
        edit(() => bindScene({ ...current, alertBox: { ...current.alertBox, fonts } }, updateWidget(current.scene!, selected.id, { fontFamily: family })), history);
      }}
    />
  ) : (
    <p className="canvas-empty">{ui('Wähle eine Ebene, um sie zu bearbeiten.', 'Select a layer to edit it.')}</p>
  );
  return (
    <div className={`canvas-editor ${embedded ? 'is-embedded' : ''}`}>
      <header className="canvas-topbar">
        <strong>Overlay</strong>
        <div className="canvas-resolution" ref={resolutionRef}>
          <button type="button" aria-expanded={resolutionOpen} onClick={() => setResolutionOpen(open => !open)}>
            {scene.design.width}×{scene.design.height}
          </button>
          {resolutionOpen && (
            <div className="canvas-resolution-menu" role="listbox">
              {DESIGN_PRESETS.map(preset => (
                <button key={preset.id} type="button" role="option" aria-selected={scene.design.width === preset.width && scene.design.height === preset.height} onClick={() => applyDesign(preset.width, preset.height)}>{preset.label}</button>
              ))}
              <form onSubmit={event => { event.preventDefault(); applyDesign(Number(customSize.width), Number(customSize.height)); }}>
                <span>Custom</span>
                <input aria-label={ui('Breite', 'Width')} inputMode="numeric" value={customSize.width} onChange={event => setCustomSize(current => ({ ...current, width: event.target.value }))} />
                <span>×</span>
                <input aria-label={ui('Höhe', 'Height')} inputMode="numeric" value={customSize.height} onChange={event => setCustomSize(current => ({ ...current, height: event.target.value }))} />
                <button type="submit">{ui('Übernehmen', 'Apply')}</button>
              </form>
            </div>
          )}
        </div>
        <button type="button" className="canvas-copy" onClick={() => void copyUrl()}><Copy aria-hidden="true" />{ui('Starten', 'Launch')}</button>
        <p className="sr-only" aria-live="polite">{notice}</p>
      </header>
      <aside className="canvas-library">
        <h2>{ui('Ebenen', 'Layers')}</h2>
        {scene.widgets.length === 0 && <p className="canvas-note canvas-layer-empty">{ui('Füge ein Widget hinzu, um das Overlay aufzubauen.', 'Add a widget to build the overlay.')}</p>}
        <div className="canvas-layers" role="list">
          {[...scene.widgets].sort((a, b) => b.frame.z - a.frame.z).map(widget => (
            <div key={widget.id} className={`${selectedId === widget.id ? 'is-active' : ''} ${widget.visible === false ? 'is-concealed' : ''}`} role="listitem">
              <button type="button" onClick={() => selectWidget(widget.id)} onDoubleClick={() => {
                const current = optionsRef.current;
                if (!current.scene) return;
                replace(bindScene(current, bringToFront(current.scene, widget.id)));
              }}>{widgetLabel(widget.type)}</button>
              <button type="button" aria-pressed={widget.visible !== false} aria-label={widget.visible === false ? ui('Ebene zeigen', 'Show layer') : ui('Ebene verbergen', 'Hide layer')} onClick={() => {
                const current = optionsRef.current;
                if (!current.scene) return;
                replace(bindScene(current, updateWidget(current.scene, widget.id, { visible: widget.visible === false })));
              }}>{widget.visible === false ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
              <button type="button" aria-label={ui('Entfernen', 'Remove')} onClick={() => {
                const current = optionsRef.current;
                if (!current.scene) return;
                replace(bindScene(current, removeWidget(current.scene, widget.id)));
                if (selectedId === widget.id) selectWidget(null);
              }}><Trash2 aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <div className="canvas-add" ref={creatorRef}>
          {creatorOpen && (
            <div className="canvas-add-menu" role="menu">
              {WIDGET_GROUPS.map(group => (
                <div key={group.en}>
                  <p>{ui(group.de, group.en)}</p>
                  {group.types.map(type => {
                    const choice = WIDGET_CHOICES.find(item => item.type === type);
                    if (!choice) return null;
                    const Icon = choice.icon;
                    const placed = scene.widgets.some(widget => widget.type === type);
                    return (
                      <button key={type} type="button" role="menuitem" draggable onDragStart={event => event.dataTransfer.setData('application/x-overlay-widget', type)} onClick={() => addWidget(type)}>
                        <Icon aria-hidden="true" />
                        <span>{ui(choice.de, choice.en)}</span>
                        {placed && <small>{ui('aktiv', 'placed')}</small>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <button type="button" aria-expanded={creatorOpen} onClick={() => setCreatorOpen(open => !open)}><Plus aria-hidden="true" />{ui('Widget hinzufügen', 'Add Widget')}</button>
        </div>
      </aside>
      <div className="canvas-workspace">
        <div className="canvas-board">
          <SceneStage
            scene={scene}
            options={options}
            playback={muted ? { ...previewPlayback, volume: 0 } : previewPlayback}
            language={language}
            token={token}
            preview={emulate}
            muted={muted}
            interactive
            snap={snap}
            zoom={zoom}
            selectedId={selectedId}
            alertClipId={importedClipId}
            onSelect={selectWidget}
            onGestureStart={() => { dragging.current = true; gestureScene.current = JSON.stringify(optionsRef.current.scene); snapshot(); }}
            onGesture={(id, frame, phase) => {
              const current = optionsRef.current;
              if (!current.scene) return;
              if (phase === 'up') dragging.current = false;
              const next = bindScene(current, updateWidget(current.scene, id, { frame }));
              if (phase === 'up') {
                armed.current = false;
                if (JSON.stringify(next.scene) === gestureScene.current) past.current.pop();
              }
              setOptions(next);
            }}
            onPlace={(type, at) => addWidget(type, at)}
          />
        </div>
        <div className="canvas-float canvas-toolbar" role="toolbar" aria-label={ui('Editorwerkzeuge', 'Editor tools')}>
          <div className="canvas-simulate" ref={simulateRef}>
            <button type="button" className="canvas-emulate" aria-expanded={simulateOpen} aria-haspopup="menu" onClick={() => { setResolutionOpen(false); setCreatorOpen(false); setSimulateOpen(open => !open); }}><Bell aria-hidden="true" />{ui('Emulieren', 'Emulate')}</button>
            {simulateOpen && (
              <div className="canvas-simulate-menu" role="menu">
                <p>{ui('Chat', 'Chat')}</p>
                {CHAT_SAMPLES.map(item => (
                  <button key={item.id} type="button" role="menuitem" onClick={() => sendChatSample(item.id)}>{ui(item.de, item.en)}</button>
                ))}
                <p>{ui('Ereignisse', 'Events')}</p>
                {ALERT_SAMPLES.map(item => (
                  <button key={item.kind} type="button" role="menuitem" onClick={() => sendAlertSample(item.kind)}>{ui(item.de, item.en)}</button>
                ))}
                <button type="button" role="menuitem" onClick={() => sendSongSample(language)}>{ui('Songwunsch', 'Song request')}</button>
              </div>
            )}
          </div>
          <button type="button" onClick={undo} aria-label={ui('Rückgängig', 'Undo')} title={ui('Rückgängig (Strg+Z)', 'Undo (Ctrl+Z)')}><Undo2 aria-hidden="true" /></button>
          <button type="button" onClick={redo} aria-label={ui('Wiederholen', 'Redo')} title={ui('Wiederholen (Strg+Y)', 'Redo (Ctrl+Y)')}><Redo2 aria-hidden="true" /></button>
          <span className="canvas-float-gap" />
          <button type="button" onClick={() => setZoom(value => Math.max(0.25, Math.round((value - 0.25) * 100) / 100))} aria-label={ui('Verkleinern', 'Zoom out')}><ZoomOut aria-hidden="true" /></button>
          <button type="button" className="canvas-zoom" onClick={() => setZoom(1)} aria-label={ui('Zoom zurücksetzen', 'Reset zoom')} title={ui('Zoom zurücksetzen (Alt+X)', 'Reset zoom (Alt+X)')}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(value => Math.min(2, Math.round((value + 0.25) * 100) / 100))} aria-label={ui('Vergrößern', 'Zoom in')}><ZoomIn aria-hidden="true" /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label={ui('An Bildschirm anpassen', 'Fit to screen')} title={ui('An Bildschirm anpassen (Alt+F)', 'Fit to screen (Alt+F)')}><Maximize2 aria-hidden="true" /></button>
          <span className="canvas-float-gap" />
          <button type="button" aria-pressed={snap} onClick={() => setSnap(value => !value)} aria-label={ui('Einrasten', 'Snapping')} title={snap ? ui('Einrasten: an', 'Snapping: on') : ui('Einrasten: aus', 'Snapping: off')}><Grid3x3 aria-hidden="true" /></button>
          <button type="button" aria-pressed={muted} onClick={() => setMuted(value => !value)} aria-label={muted ? ui('Ton an', 'Unmute') : ui('Stumm', 'Mute')}>{muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>
        </div>
      </div>
      <aside className="canvas-inspector-dock">
        <header>{selected ? widgetLabel(selected.type) : ui('Eigenschaften', 'Properties')}</header>
        <div className="canvas-inspector-body">{inspector}</div>
      </aside>
    </div>
  );
}

const EVENT_LABELS: Record<CreatorEvent, [string, string]> = {
  follow: ['Follow', 'Follow'],
  subscription: ['Abo', 'Subscription'],
  resub: ['Resub', 'Resub'],
  gift: ['Geschenk', 'Gift'],
  cheer: ['Bits', 'Cheer'],
  raid: ['Raid', 'Raid'],
  tip: ['Spende', 'Donation'],
  host: ['Host', 'Host']
};

function AlertImportList({
  clips, activeId, language, onPick
}: {
  clips: Array<{ id: string; event: CreatorEvent; name: string }>;
  activeId: string;
  language: 'de' | 'en';
  onPick: (id: string) => void;
}) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  if (!clips.length) {
    return <p className="canvas-note">{ui('Lege im Alert-Creator eine Animation an und klicke dieses Widget erneut an.', 'Design an animation in the Alert Creator, then click this widget again.')}</p>;
  }
  return (
    <div>
      <p className="canvas-note">{ui('Diese Alerts kommen aus dem Alert-Creator.', 'These alerts come from the Alert Creator.')}</p>
      <div className="canvas-alert-list">
        {clips.map((clip, index) => (
          <button key={clip.id} type="button" className={clip.id === activeId ? 'is-active' : ''} onClick={() => onPick(clip.id)}>
            <span>{clip.name || `${ui('Variation', 'Variation')} ${index + 1}`}</span>
            <small>{ui(...EVENT_LABELS[clip.event])}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
