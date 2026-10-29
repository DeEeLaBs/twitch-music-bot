import React, { useRef } from 'react';
import type { PlaybackState } from '../types.ts';
import type { OverlayOptions } from '../overlayOptions.ts';
import { OverlayWidget } from './OverlayWidget.tsx';
import { OverlayChat } from './OverlayChat.tsx';
import { AlertWidget, CountdownWidget, FxWidget, GoalWidget, ImageWidget, LabelWidget, LeaderboardWidget, TextWidget, VideoWidget, useStreamFeed } from './StreamWidgets.tsx';
import { planAlert } from '../alertBox.ts';
import { AlertFontFaces } from './alert-creator/AlertFontFaces.tsx';
import {
  alignmentGuides,
  displayFrame,
  moveFrame,
  pointerToDesign,
  resizeFrame,
  SCENE_WIDGET_TYPES,
  type AlignmentKind,
  type OverlayScene,
  type ResizeHandle,
  type SceneFrame,
  type SceneWidget,
  type SceneWidgetType
} from '../scene.ts';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface SceneStageProps {
  scene: OverlayScene;
  options: OverlayOptions;
  playback?: PlaybackState;
  language?: 'de' | 'en';
  token?: string;
  preview?: boolean;
  muted?: boolean;
  interactive?: boolean;
  snap?: boolean;
  zoom?: number;
  selectedId?: string | null;
  alertClipId?: string;
  onSelect?: (id: string | null) => void;
  onGestureStart?: () => void;
  onGesture?: (id: string, frame: SceneFrame, phase: 'move' | 'up') => void;
  onPlace?: (type: SceneWidgetType, at: { x: number; y: number }) => void;
}

export function SceneStage({
  scene, options, playback, language = 'de', token = '', preview = false, muted = false, interactive = false, snap = true, zoom = 1,
  selectedId = null, alertClipId = '', onSelect, onGestureStart, onGesture, onPlace
}: SceneStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const feed = useStreamFeed(token, preview, alert => planAlert(options.alertBox, alert, language).totalMs);
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const fit = useFit(hostRef, scene.design.width, scene.design.height, Math.min(2, Math.max(0.25, zoom)));

  const pointFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return pointerToDesign(event.clientX, event.clientY, rect, sceneRef.current.design);
  };

  const begin = (event: React.PointerEvent<HTMLElement>, widget: SceneWidget) => {
    if (!interactive || !onGesture) return;
    if ((event.target as HTMLElement).closest('a, input, textarea, button') && !(event.target as HTMLElement).dataset.handle) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(widget.id);
    const handle = (event.target as HTMLElement).dataset.handle as ResizeHandle | undefined;
    const origin = pointFromEvent(event);
    const start = displayFrame(widget);
    const square = widget.type === 'goal' && widget.variant.split('|')[1] === 'ring';
    onGestureStart?.();
    const move = (ev: PointerEvent) => {
      const current = sceneRef.current;
      const point = pointFromEvent(ev);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const frame = handle
        ? resizeFrame(start, handle, dx, dy, widget.type, current.design, current.grid, snap, square)
        : moveFrame(start, dx, dy, widget.type, current.design, current.grid, snap);
      onGesture(widget.id, frame, 'move');
    };
    const stop = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      const current = sceneRef.current;
      const point = pointFromEvent(ev);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const frame = handle
        ? resizeFrame(start, handle, dx, dy, widget.type, current.design, current.grid, snap, square)
        : moveFrame(start, dx, dy, widget.type, current.design, current.grid, snap);
      onGesture(widget.id, frame, 'up');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!interactive || !onPlace) return;
    const type = event.dataTransfer.getData('application/x-overlay-widget');
    if (!SCENE_WIDGET_TYPES.includes(type as typeof SCENE_WIDGET_TYPES[number])) return;
    event.preventDefault();
    onPlace(type as SceneWidgetType, pointFromEvent(event));
  };

  const widgets = [...scene.widgets].sort((a, b) => a.frame.z - b.frame.z).map(widget => ({ ...widget, frame: displayFrame(widget) }));
  const guides = interactive ? alignmentGuides(widgets, selectedId ?? null, scene.design) : [];
  const guideText = (kind: AlignmentKind) => {
    if (kind === 'symmetric') return language === 'de' ? 'Symmetrisch' : 'Symmetric';
    if (kind === 'canvas') return language === 'de' ? 'Mittig zur Fläche' : 'Centered on the canvas';
    return language === 'de' ? 'Mittig' : 'Centered';
  };
  return (
    <div ref={hostRef} className={`scene-host ${interactive ? 'is-editor' : 'is-obs'}${interactive && zoom > 1 ? ' is-zoomed' : ''}`} data-scene-scale={fit || undefined}>
      <div className="scene-sizer" style={{ width: scene.design.width * (fit || 1), height: scene.design.height * (fit || 1) }}>
        <div
          ref={rootRef}
          className="scene-root"
          data-scene-root="true"
          style={{ width: scene.design.width, height: scene.design.height, transform: `scale(${fit || 1})`, ['--scene-scale' as string]: fit || 1 }}
          onPointerDown={event => { if (event.target === event.currentTarget) onSelect?.(null); }}
          onDragOver={event => { if (interactive) event.preventDefault(); }}
          onDrop={onDrop}
        >
          <AlertFontFaces fonts={options.alertBox.fonts} />
          {interactive && (
            <svg className="scene-frames" width={scene.design.width} height={scene.design.height} aria-hidden="true">
              <rect className="scene-canvas-frame" x="0.5" y="0.5" width={scene.design.width - 1} height={scene.design.height - 1} />
              {widgets.filter(widget => widget.visible !== false || widget.id === selectedId).map(widget => (
                <rect key={widget.id} className={selectedId === widget.id ? 'is-selected' : ''} x={widget.frame.x} y={widget.frame.y} width={widget.frame.width} height={widget.frame.height} />
              ))}
              {guides.map(guide => (
                <line key={`${guide.kind}-${guide.otherId ?? 'canvas'}`} className={`is-${guide.kind}`} x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2} />
              ))}
            </svg>
          )}
          {interactive && guides.map(guide => (
            <div
              key={`label-${guide.kind}-${guide.otherId ?? 'canvas'}`}
              className={`scene-guide-label is-${guide.kind}`}
              style={{ left: (guide.x1 + guide.x2) / 2, top: (guide.y1 + guide.y2) / 2, transform: `translate(-50%, -130%) scale(${1 / (fit || 1)})` }}
            >
              {guideText(guide.kind)}
            </div>
          ))}
          {widgets.map(widget => widget.visible === false && !interactive ? null : (
            <div
              key={widget.id}
              className={`scene-widget ${selectedId === widget.id ? 'is-selected' : ''} ${widget.visible === false ? 'is-concealed' : ''} ${widget.fadeMs === 0 ? 'is-still' : ''}`}
              data-scene-widget={widget.id}
              style={{
                left: widget.frame.x,
                top: widget.frame.y,
                width: widget.frame.width,
                height: widget.frame.height,
                zIndex: widget.frame.z,
                ['--np-title' as string]: `${widget.fontSize}px`,
                ['--np-artist' as string]: `${Math.max(11, Math.round(widget.fontSize * 0.72))}px`,
                ['--scene-fade' as string]: `${widget.fadeMs}ms`,
                fontFamily: widget.fontFamily || undefined
              }}
              onPointerDown={event => begin(event, widget)}
            >
              {widget.css && <style>{widget.css}</style>}
              {widget.type === 'music-player' && (
                <OverlayWidget playback={playback} options={{ ...options, freePositioning: false }} language={language} disableInternalWs fitFrame />
              )}
              {widget.type === 'twitch-chat' && (
                <OverlayChat options={{ ...options.chat, enabled: true }} token={token} preview={preview} fill />
              )}
              {widget.type === 'alert' && <AlertWidget alert={feed.alert} config={options.alertBox} language={language} interactive={interactive} muted={muted} clipId={interactive && selectedId === widget.id ? alertClipId : ''} />}
              {widget.type === 'label' && <LabelWidget stats={feed.stats} variant={widget.variant} language={language} />}
              {widget.type === 'goal' && <GoalWidget stats={feed.stats} variant={widget.variant} alert={feed.alert} preview={preview || interactive} />}
              {widget.type === 'leaderboard' && <LeaderboardWidget stats={feed.stats} variant={widget.variant} />}
              {widget.type === 'countdown' && <CountdownWidget stats={feed.stats} playback={playback} variant={widget.variant} />}
              {widget.type === 'text' && <TextWidget variant={widget.variant} />}
              {widget.type === 'image' && <ImageWidget variant={widget.variant} interactive={interactive} />}
              {widget.type === 'video' && <VideoWidget variant={widget.variant} interactive={interactive} muted={muted} />}
              {widget.type === 'fx' && <FxWidget alert={feed.alert} variant={widget.variant} preview={preview} selected={interactive && selectedId === widget.id} token={token} />}
              {interactive && selectedId === widget.id && HANDLES.map(handle => (
                <span key={handle} className={`scene-handle is-${handle}`} data-handle={handle} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function useFit(hostRef: React.RefObject<HTMLDivElement | null>, designWidth: number, designHeight: number, zoom: number) {
  const [fit, setFit] = React.useState(1);
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const base = rect.width > 0 && rect.height > 0 ? Math.min(rect.width / designWidth, rect.height / designHeight) : 1;
      setFit(base * zoom);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef, designWidth, designHeight, zoom]);
  return fit;
}
