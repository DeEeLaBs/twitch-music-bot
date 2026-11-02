import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Copy, Eye, EyeOff, Grid3x3, Image as ImageIcon, ListOrdered, Maximize2, MessageSquare, Music2, Plus, Redo2, Sparkles, Tag, Target, Timer, Trash2, Type, Undo2, Video, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { OverlayAutosave, type AutosaveStatus } from '../overlayAutosave.ts';
import { OverlayCollection, overlayRequest, type OverlayDocument } from './OverlayCollection.tsx';
import { OverlayDesignMenu } from './OverlayDesignMenu.tsx';
import type { PlaybackState } from '../types.ts';
import { apiFetch } from '../apiClient.ts';
import { sampleChatLine } from '../overlayChat.ts';
import { mergeOverlayOptions, type OverlayOptions } from '../overlayOptions.ts';
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
  { type: 'greeting', de: 'Begrüßungen', en: 'Greetings', icon: Bell },
  { type: 'countdown', de: 'Countdown', en: 'Countdown', icon: Timer },
  { type: 'text', de: 'Text', en: 'Text', icon: Type },
  { type: 'image', de: 'Bilder', en: 'Images', icon: ImageIcon },
  { type: 'video', de: 'Video', en: 'Video', icon: Video },
  { type: 'fx', de: 'Effekt', en: 'Effect', icon: Sparkles }
];

const WIDGET_GROUPS: Array<{ de: string; en: string; types: SceneWidgetType[] }> = [
  { de: 'Stream', en: 'Stream', types: ['music-player', 'twitch-chat'] },
  { de: 'Alerts', en: 'Alerts', types: ['alert', 'fx', 'greeting'] },
  { de: 'Ziele', en: 'Goals', types: ['label', 'goal', 'leaderboard', 'countdown'] },
  { de: 'Medien', en: 'Media', types: ['text', 'image', 'video'] }
];

interface OverlayEditorProps {
  playback?: PlaybackState;
  language?: 'de' | 'en';
  embedded?: boolean;
}

export function OverlayEditor(props: OverlayEditorProps) {
  return <OverlayCollection embedded={props.embedded} language={props.language || 'de'}>{(document, onDirty, registerFlush, onSaved, actionHost) => <OverlayCanvasEditor {...props} document={document} onDirty={onDirty} registerFlush={registerFlush} onSaved={onSaved} actionHost={actionHost} />}</OverlayCollection>;
}

function OverlayCanvasEditor({ playback, language = 'de', embedded = false, document: overlayDocument, onDirty, registerFlush, onSaved, actionHost }: OverlayEditorProps & { document: OverlayDocument; onDirty: (dirty: boolean) => void; registerFlush: (flush: (() => Promise<void>) | null) => void; onSaved: (document: OverlayDocument) => void; actionHost: HTMLDivElement | null }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const [options, setOptions] = useState<OverlayOptions>(() => bindScene(overlayDocument.options, overlayDocument.options.scene ?? sceneFromLegacy(overlayDocument.options.chat)));
  const [saveState, setSaveState] = useState<AutosaveStatus>({state:'saved',dirty:false});
  const [autosave] = useState(() => new OverlayAutosave(options, async submitted => {
    const saved = await overlayRequest(`/api/v1/overlays/${overlayDocument.id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({options:submitted})});
    onSaved(saved);
  }, setSaveState));
  const [token, setToken] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertClipId, setAlertClipId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const emulate = true;
  const [muted, setMuted] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [customSize, setCustomSize] = useState(() => ({ width: String(overlayDocument.options.scene?.design.width ?? 1920), height: String(overlayDocument.options.scene?.design.height ?? 1080) }));
  const [notice, setNotice] = useState('');
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const past = useRef<OverlayOptions[]>([]);
  const future = useRef<OverlayOptions[]>([]);
  const dragging = useRef(false);
  const armed = useRef(false);
  const gestureScene = useRef('');
  const editorRoot = useRef<HTMLDivElement>(null);
  const resolutionRef = useRef<HTMLDivElement>(null);
  const simulateRef = useRef<HTMLDivElement>(null);
  const creatorRef = useRef<HTMLDivElement>(null);

  const scene = options.scene ?? sceneFromLegacy(options.chat);
  const selected = scene.widgets.find(widget => widget.id === selectedId) || null;
  const importedClipId = alertClipId || options.alertBox.creator.clips.find(clip => clip.layers.length)?.id || '';

  useEffect(() => {
    setSelectedId(current => current ?? optionsRef.current.scene?.widgets.find(widget => widget.type === 'music-player')?.id ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void overlayRequest('/api/v1/overlay/token').then(body => { if (!cancelled) setToken(body.token); })
      .catch(reason => { if (!cancelled) setNotice(reason.message); });
    return () => { cancelled = true; };
  }, []);
  const dirty = saveState.dirty;
  useEffect(() => { autosave.start();registerFlush(() => {autosave.update(optionsRef.current);return autosave.flush();});return () => {registerFlush(null);autosave.stop();}; }, [autosave, registerFlush]);
  useEffect(() => { autosave.update(options); }, [options, autosave]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {if(autosave.dirty){event.preventDefault();event.returnValue='';}};
    const beforeLeave = (event: Event) => {
      const detail=(event as CustomEvent<{waitUntil?: (task:Promise<void>)=>void}>).detail;
      if(detail?.waitUntil){autosave.update(optionsRef.current);detail.waitUntil(autosave.flush());}
      else if(autosave.dirty)event.preventDefault();
    };
    window.addEventListener('beforeunload',warn);window.addEventListener('overlay:before-leave',beforeLeave);
    return () => {window.removeEventListener('beforeunload',warn);window.removeEventListener('overlay:before-leave',beforeLeave);};
  }, [autosave]);

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
      if (editorRoot.current?.closest('[inert]')) return;
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
    const active = await apiFetch('/api/v1/overlay/active').then(response => response.ok ? response.json() : null).catch(() => null);
    if (!active) return;
    const incoming = mergeOverlayOptions(active?.options).alertBox;
    const current = optionsRef.current;
    if (JSON.stringify(current.alertBox.creator) !== JSON.stringify(incoming.creator)) {
      setOptions({ ...current, alertBox: { ...current.alertBox, creator: incoming.creator } });
      rememberClip(incoming);
    }
  };
  const selectWidget = (id: string | null) => {
    const type = optionsRef.current.scene?.widgets.find(widget => widget.id === id)?.type;
    if (type === 'alert') rememberClip(optionsRef.current.alertBox);
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

  const browserUrl = useMemo(() => overlayBrowserUrl(window.location.origin, token, scene, overlayDocument.id), [token, scene, overlayDocument.id]);

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
    <div><button type="button" onClick={() => void importCreatorAlerts()}>{ui('Aus Alert-Designer importieren', 'Import from alert designer')}</button>
    <AlertImportList
      clips={options.alertBox.creator.clips.filter(item => item.layers.length).map(item => ({ id: item.id, event: item.event, name: item.name }))}
      activeId={importedClipId}
      language={language}
      onPick={setAlertClipId}
    /></div>
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
    <div ref={editorRoot} className={`canvas-editor ${embedded ? 'is-embedded' : ''}`}>
      <header className="canvas-topbar">
        <strong>{overlayDocument.name}</strong>
        <span className={`overlay-autosave is-${saveState.state}`} role="status"><i aria-hidden="true" />{saveState.state === 'saved' ? ui('Live · gespeichert', 'Live · saved') : saveState.state === 'error' ? ui('Speichern fehlgeschlagen', 'Save failed') : ui('Wird live gespeichert…', 'Saving live…')}</span>
        {saveState.state === 'error' && <button type="button" onClick={() => void autosave.flush().catch(() => {})}>{ui('Erneut versuchen', 'Retry')}</button>}
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
        {actionHost && createPortal(<button type="button" className="canvas-copy" disabled={!token} onClick={() => void copyUrl()}><Copy size={16} aria-hidden="true" />{ui('OBS-URL kopieren', 'Copy OBS URL')}</button>, actionHost)}
        <p className="overlay-save-notice" role="status">{notice}</p>
      {saveState.state === 'error' && <div className="overlay-autosave-error" role="alert">{/Failed to fetch|NetworkError|Load failed/i.test(saveState.error || '') ? ui('Verbindung zum Bot unterbrochen. Bitte erneut versuchen.', 'Connection to the bot interrupted. Please retry.') : saveState.error} {ui('Deine Änderungen bleiben im Editor erhalten.', 'Your changes remain in the editor.')}</div>}
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
