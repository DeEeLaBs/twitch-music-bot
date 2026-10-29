import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PlaybackState } from '../types.ts';
import { apiFetch } from '../apiClient.ts';
import { EMOTE_SPAM_COOLDOWN_MS, emptyEmoteSpam, playingEmoteUrl, pushEmoteLine, type EmoteBurst } from '../emoteSpam.ts';
import type { OverlayChatLine } from '../overlayChat.ts';
import { alertForClip, alertFrame, alertFrameSize, containAlertResolution, creatorClipFor, planAlert, safeMediaUrl, type AlertBoxConfig, type CreatorClip } from '../alertBox.ts';
import { CreatorStage } from './alert-creator/CreatorStage.tsx';
import { ALERT_PRIORITY, pushAlert, type StreamAlert } from '../streamAlerts.ts';
import { applyChromaKey } from '../chromaKey.ts';
import { formatCountdown, remainingCountdown, type CountdownId, type CountdownState } from '../countdown.ts';
import { emptyStats, type StreamStats } from '../streamStats.ts';
import type { SceneWidget } from '../scene.ts';
import type { AlertFontAsset } from '../alertBox.ts';
import { AlertFontField } from './alert-creator/AlertFontField.tsx';
import {
  LABEL_ACCENT_COLORS,
  formatFxVariant,
  formatGoalVariant,
  formatLabelVariant,
  formatBoardVariant,
  fxParticleCount,
  fxParticleStyle,
  fxShouldShow,
  liveFxKind,
  formatMediaVariant,
  formatTextVariant,
  parseFxVariant,
  parseGoalVariant,
  parseLabelVariant,
  parseBoardVariant,
  parseMediaVariant,
  parseTextVariant,
  withLabelDesign,
  type FxDensity,
  type FxDesign,
  type FxEmotes,
  type FxLook,
  type FxTint,
  type MediaLook,
  type TextLook,
  type GoalDesign,
  type GoalKind,
  type GoalLook,
  type BoardDesign,
  type BoardLook,
  type LabelAccent,
  type LabelDesign,
  type LabelLook,
  type LabelMark,
  type LabelSource
} from '../widgetLooks.ts';

const SAMPLE_STATS: StreamStats = {
  ...emptyStats(),
  latest: {
    follower: { user: 'Nova', at: 0, amount: 0 },
    subscriber: { user: 'Mika', at: 0, amount: 3 },
    cheerer: { user: 'Ari', at: 0, amount: 500 }
  },
  session: { follows: 12, subs: 4, gifts: 2, cheers: 6, bits: 2400, raids: 1 },
  goals: { follower: { current: 64, target: 100 }, sub: { current: 7, target: 10 } },
  cheers: [{ user: 'Ari', value: 500 }, { user: 'Nova', value: 200 }],
  requesters: [{ user: 'Mika', value: 4 }, { user: 'Ari', value: 2 }],
  viewers: 86
};

function sampleAlert(): StreamAlert {
  return { id: 'sample', kind: 'subscription', user: 'Mika', amount: 1, createdAt: Date.now(), message: '', months: 1, tier: '1000', currency: '', viewers: 0 };
}

export function useStreamFeed(token: string, preview: boolean, durationFor?: (alert: StreamAlert) => number, onOverlay?: (options: unknown) => void) {
  const durationRef = useRef(durationFor);
  const overlayRef = useRef(onOverlay);
  durationRef.current = durationFor;
  overlayRef.current = onOverlay;
  const [stats, setStats] = useState<StreamStats>(preview ? SAMPLE_STATS : emptyStats());
  const [alert, setAlert] = useState<StreamAlert | null>(preview ? sampleAlert() : null);

  useEffect(() => {
    const onSample = (event: Event) => {
      const detail = (event as CustomEvent<Partial<StreamAlert>>).detail;
      if (!detail?.kind || !(detail.kind in ALERT_PRIORITY)) return;
      setAlert({
        id: detail.id || `sim-${Date.now()}`,
        kind: detail.kind,
        user: detail.user || 'Viewer',
        amount: detail.amount ?? 1,
        createdAt: Date.now(),
        message: detail.message || '',
        months: detail.months ?? 0,
        tier: detail.tier || '',
        currency: detail.currency || '',
        viewers: detail.viewers ?? 0
      });
    };
    window.addEventListener('overlay:alert-sample', onSample);
    return () => window.removeEventListener('overlay:alert-sample', onSample);
  }, []);

  useEffect(() => {
    if (preview || !token) {
      setStats(preview ? SAMPLE_STATS : emptyStats());
      setAlert(preview ? sampleAlert() : null);
      return undefined;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    let queue: StreamAlert[] = [];
    let showing: StreamAlert | null = null;
    let timer = 0;
    const pump = () => {
      if (showing) return;
      const step = () => {
        if (document.querySelector('.queue-pop-kicker')) {
          timer = window.setTimeout(step, 300);
          return;
        }
        const next = queue[0];
        queue = queue.slice(1);
        if (!next) {
          showing = null;
          setAlert(null);
          return;
        }
        showing = next;
        setAlert(next);
        timer = window.setTimeout(() => {
          showing = null;
          pump();
        }, durationRef.current?.(next) || 6000);
      };
      step();
    };
    socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe_widgets', token }));
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as { type?: string; data?: (StreamAlert | StreamStats) & { activeOverlay?: unknown } };
      if ((message.type === 'state' || message.type === 'patch') && message.data?.activeOverlay) overlayRef.current?.(message.data.activeOverlay);
      if (message.type === 'stats') setStats(message.data as StreamStats);
      if (message.type === 'alert') {
        const incoming = message.data as StreamAlert;
        queue = pushAlert(queue, incoming);
        if (showing && ALERT_PRIORITY[incoming.kind] > ALERT_PRIORITY[showing.kind]) {
          window.clearTimeout(timer);
          showing = null;
          setAlert(null);
        }
        pump();
      }
    };
    return () => {
      window.clearTimeout(timer);
      socket.close();
    };
  }, [token, preview]);

  return { stats, alert };
}

function CreatorAlertStage({ clip, alert, config, language, elapsedMs, muted = false }: { clip: CreatorClip; alert: StreamAlert; config: AlertBoxConfig; language: 'de' | 'en'; elapsedMs: number; muted?: boolean }) {
  const frame = alertFrame(clip.frame);
  const resolution = alertFrameSize(frame, clip);
  const ref = useRef<HTMLDivElement>(null);
  const [pixels, setPixels] = useState(resolution);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return undefined;
    const fit = () => {
      const next = containAlertResolution(resolution, { width: host.clientWidth, height: host.clientHeight });
      setPixels(current => current.width === next.width && current.height === next.height ? current : next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [resolution.width, resolution.height]);
  return (
    <div
      ref={ref}
      className={`alertbox is-creator is-frame-${frame}`}
      data-alert-frame={frame}
      data-alert-resolution={`${resolution.width}x${resolution.height}`}
      role="status"
      style={{ width: pixels.width, height: pixels.height, ['--alert-width' as string]: resolution.width, ['--alert-height' as string]: resolution.height }}
    >
      <CreatorStage clip={clip} alert={alert} config={config} language={language} elapsedMs={elapsedMs} playing muted={muted} />
    </div>
  );
}

function AlertSound({ src, volume, muted }: { src: string; volume: number; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.muted = muted;
    node.volume = muted ? 0 : volume;
    if (muted) {
      node.pause();
      return;
    }
    if (node.paused) void node.play().catch(() => {});
  }, [muted, volume, src]);
  return <audio ref={ref} src={src} autoPlay muted={muted} />;
}

export function AlertWidget({ alert, config, language, interactive, muted = false, clipId = '' }: { alert: StreamAlert | null; config: AlertBoxConfig; language: 'de' | 'en'; interactive: boolean; muted?: boolean; clipId?: string }) {
  const imported = clipId ? config.creator.clips.find(item => item.id === clipId && item.layers.length) || null : null;
  const showcase = imported ? alertForClip(imported) : null;
  const active = showcase || alert;
  const plan = active ? planAlert(config, active, language) : null;
  const creator = imported || (active ? creatorClipFor(config, active) : null);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const [textOn, setTextOn] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = frameRef.current?.contentWindow;
    frame?.postMessage({ type: 'onWidgetLoad', config }, '*');
  }, [config.customHtml]);
  useEffect(() => {
    if (!active || !plan) return undefined;
    setPhase('in');
    setTextOn(false);
    setElapsed(0);
    const started = Date.now();
    const clock = window.setInterval(() => setElapsed(Date.now() - started), 50);
    const textTimer = window.setTimeout(() => setTextOn(true), plan.textDelayMs);
    const holdTimer = window.setTimeout(() => setPhase('hold'), plan.introMs);
    const outTimer = window.setTimeout(() => setPhase('out'), Math.max(plan.introMs, plan.durationMs - plan.outroMs));
    const loopTimer = interactive ? window.setTimeout(() => setCycle(value => value + 1), plan.durationMs) : 0;
    frameRef.current?.contentWindow?.postMessage({ type: 'onEventReceived', event: active }, '*');
    return () => {
      window.clearTimeout(textTimer);
      window.clearTimeout(holdTimer);
      window.clearTimeout(outTimer);
      window.clearTimeout(loopTimer);
      window.clearInterval(clock);
    };
  }, [active?.id, cycle, interactive]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    if (muted || !plan?.speech || showcase) {
      window.speechSynthesis.cancel();
      return undefined;
    }
    const utterance = new SpeechSynthesisUtterance(plan.speech);
    utterance.pitch = config.speech.pitch;
    utterance.volume = config.speech.volume / 100;
    const voice = window.speechSynthesis.getVoices().find(item => item.name === config.speech.voice);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [active?.id, cycle, muted, plan?.speech, showcase, config.speech.pitch, config.speech.volume, config.speech.voice]);
  if (!active || !plan) return interactive ? <div className="stream-placeholder">Alert</div> : null;
  if (creator) {
    return <CreatorAlertStage clip={creator} alert={active} config={config} language={language} elapsedMs={elapsed} muted={muted} />;
  }
  const media = safeMediaUrl(plan.mediaUrl);
  const sound = safeMediaUrl(plan.soundUrl);
  const video = /\.(webm|mp4)(\?|$)/i.test(media);
  const plate = hexRgb(config.plateColor);
  return (
    <div className={`alertbox is-${plan.layout} is-${phase} is-align-${config.align} is-fit-${config.mediaFit} intro-${plan.intro} outro-${plan.outro}`} role="status" style={{ color: config.color, fontFamily: config.fontFamily, fontSize: config.fontSize, fontWeight: config.fontWeight, background: `rgba(${plate}, ${config.plateOpacity / 100})`, borderRadius: config.radius, ['--alert-accent' as string]: config.accent, ['--alert-in' as string]: `${plan.introMs}ms`, ['--alert-out' as string]: `${plan.outroMs}ms`, ['--alert-shadow' as string]: `${Math.round(config.shadowStrength / 100 * 16)}px`, ['--alert-stroke-width' as string]: `${config.strokeWidth}px`, ['--alert-stroke-color' as string]: config.strokeColor, ['--alert-media-radius' as string]: `${config.mediaRadius}px` }}>
      {config.customCss && <style>{config.customCss}</style>}
      {media && (video
        ? <video className="alertbox-media" src={media} autoPlay muted playsInline />
        : <img className="alertbox-media" src={media} alt="" />)}
      {sound && <AlertSound src={sound} volume={plan.volume} muted={muted} />}
      {textOn && (
        <p className={`alertbox-text is-${plan.textAnim} ${config.shadow ? 'has-shadow' : ''} ${config.stroke ? 'has-stroke' : ''}`}>
          {plan.pieces.map((piece, index) => <span key={`${piece.text}-${index}`} className={piece.accent ? 'is-accent' : ''}>{piece.text}</span>)}
        </p>
      )}
      {config.customHtml && (
        <iframe ref={frameRef} className="alertbox-hook" title="Alert hooks" sandbox="allow-scripts" srcDoc={`<script>window.addEventListener('message',event=>{if(event.data?.type==='onWidgetLoad'&&window.onWidgetLoad)window.onWidgetLoad(event.data.config);if(event.data?.type==='onEventReceived'&&window.onEventReceived)window.onEventReceived(event.data.event);});</script>${config.customHtml}`} />
      )}
    </div>
  );
}

function hexRgb(hex: string): string {
  const full = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(full)) return '9, 9, 11';
  return `${Number.parseInt(full.slice(0, 2), 16)}, ${Number.parseInt(full.slice(2, 4), 16)}, ${Number.parseInt(full.slice(4, 6), 16)}`;
}

export function LabelWidget({ stats, variant, language }: { stats: StreamStats; variant: string; language: 'de' | 'en' }) {
  const look = parseLabelVariant(variant);
  const latest = stats.latest;
  const text: Record<LabelSource, string> = {
    follower: latest.follower?.user || (language === 'de' ? 'Noch kein Follower' : 'No follower yet'),
    subscriber: latest.subscriber?.user || (language === 'de' ? 'Noch kein Abo' : 'No sub yet'),
    cheerer: latest.cheerer?.user || (language === 'de' ? 'Noch keine Bits' : 'No cheers yet'),
    follows: String(stats.session.follows),
    viewers: String(stats.viewers)
  };
  const caption: Record<LabelSource, string> = {
    follower: 'Follower',
    subscriber: 'Sub',
    cheerer: 'Bits',
    follows: language === 'de' ? 'Follows heute' : 'Follows today',
    viewers: 'Viewers'
  };
  return (
    <div
      className={`stream-label is-${look.design} is-mark-${look.mark} is-accent-${look.accent}`}
      style={{ ['--label-accent' as string]: LABEL_ACCENT_COLORS[look.accent] }}
      data-label-design={look.design}
    >
      <small>{caption[look.source]}</small>
      <strong>{text[look.source]}</strong>
    </div>
  );
}

export function GoalWidget({ stats, variant, alert = null, preview = false }: { stats: StreamStats; variant: string; alert?: StreamAlert | null; preview?: boolean }) {
  const look = parseGoalVariant(variant);
  const goal = look.kind === 'sub' ? stats.goals.sub : stats.goals.follower;
  const pct = Math.min(100, Math.round((goal.current / Math.max(1, goal.target)) * 100));
  const title = look.kind === 'sub' ? 'Subs' : 'Followers';
  const steps = 12;
  const filled = Math.round((pct / 100) * steps);
  const [held, setHeld] = useState(look.reveal === 'event' && !preview);
  const hideTimer = useRef(0);
  useEffect(() => {
    if (look.reveal !== 'event' || preview) {
      window.clearTimeout(hideTimer.current);
      setHeld(false);
      return undefined;
    }
    setHeld(true);
    return () => window.clearTimeout(hideTimer.current);
  }, [look.reveal, preview]);
  useEffect(() => {
    if (look.reveal !== 'event' || preview || !alert?.id) return undefined;
    setHeld(false);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHeld(true), look.holdSeconds * 1000);
    return undefined;
  }, [alert?.id, look.reveal, look.holdSeconds, preview]);
  return (
    <div
      className={`stream-goal is-${look.design}${held ? ' is-held' : ''}`}
      style={{ ['--goal-accent' as string]: LABEL_ACCENT_COLORS[look.accent], ['--goal-pct' as string]: `${pct}%` }}
      data-goal-design={look.design}
    >
      {look.design === 'ring' && (
        <>
          <i />
          <b><strong>{pct}%</strong><small>{title}</small></b>
        </>
      )}
      {look.design === 'steps' && (
        <>
          <span>{title} <strong>{goal.current}</strong>/{goal.target}</span>
          <em>{Array.from({ length: steps }, (_, index) => <i key={index} className={index < filled ? 'is-on' : ''} />)}</em>
        </>
      )}
      {look.design === 'meter' && (
        <>
          <strong>{pct}<small>%</small></strong>
          <span>{title} {goal.current}/{goal.target}</span>
          <i />
        </>
      )}
      {look.design === 'banner' && (
        <>
          <i style={{ width: `${pct}%` }} />
          <span>{title}</span>
          <strong>{goal.current}<small>/{goal.target}</small></strong>
        </>
      )}
      {look.design === 'bar' && (
        <>
          <span>{title} {goal.current}/{goal.target}</span>
          <i style={{ width: `${pct}%` }} />
        </>
      )}
    </div>
  );
}

export function LeaderboardWidget({ stats, variant }: { stats: StreamStats; variant: string }) {
  const look = parseBoardVariant(variant);
  const rows = (look.source === 'requests' ? stats.requesters : stats.cheers).slice(0, look.rows);
  const ranked = rows.map((row, index) => ({ row, place: index + 1 }));
  const ordered = look.design === 'podium' ? [ranked[1], ranked[0], ranked[2]].filter((item): item is NonNullable<typeof item> => Boolean(item)) : ranked;
  const top = Math.max(1, rows[0]?.value || 1);
  return (
    <ol className={`stream-board is-${look.design}`} style={{ ['--board-accent' as string]: LABEL_ACCENT_COLORS[look.accent] }}>
      {ordered.map(({ row, place }) => (
        <li key={row.user} className={`is-place-${place}`}>
          {look.design === 'bars' ? <i style={{ width: `${Math.max(8, Math.round((row.value / top) * 100))}%` }} /> : <em>{place}</em>}
          <span>{row.user}</span>
          <b>{row.value}</b>
        </li>
      ))}
    </ol>
  );
}

export function CountdownWidget({ stats, playback, variant }: { stats: StreamStats; playback?: PlaybackState; variant: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = variant === 'clock'
    ? Math.max(0, Math.ceil((stats.timerEndsAt - now) / 1000))
    : Math.max(0, Math.ceil((playback?.durationSeconds || 0) - (playback?.progressSeconds || 0)));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  if (variant === 'streamstart' || variant === 'subathon') return <ManagedCountdown id={variant} />;
  return <div className="stream-timer">{minutes}:{String(seconds).padStart(2, '0')}</div>;
}

function ManagedCountdown({ id }: { id: CountdownId }) {
  const [state, setState] = useState<(CountdownState & { serverNow: number }) | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let active = true, pollTimer: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const poll = async () => {
      try {
        const response = await apiFetch('/api/countdowns', { signal: AbortSignal.timeout(5000) });
        if (response.ok && active) { const data = await response.json(); setState(data); setOffset(data.serverNow - Date.now()); }
      } catch { /* continue counting locally until reconnected */ }
      if (active) pollTimer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { active = false; clearInterval(tick); clearTimeout(pollTimer); };
  }, []);
  if (!state) return <div className="stream-timer">—</div>;
  const p = state.profiles[id], run = state.runs[id];
  const hidden = run.status === 'finished' && p.finish.hideEnabled && now + offset >= run.completedAt + p.finish.hideAfterSeconds * 1000;
  return <div className="stream-timer" style={{ visibility: hidden ? 'hidden' : 'visible' }}>{formatCountdown(remainingCountdown(p, run, now + offset))}</div>;
}

function safeImage(value: string): string {
  if (value.startsWith('/overlay-assets/')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch { /* the field stays empty until a real URL is entered */ }
  return '';
}

export function TextWidget({ variant }: { variant: string }) {
  const look = parseTextVariant(variant);
  return (
    <div className={`stream-text is-${look.align}${look.shadow ? ' is-shadow' : ''}`} style={{ color: look.color, fontWeight: look.weight === 'bold' ? 800 : 500 }}>
      {look.text}
    </div>
  );
}

export function ImageWidget({ variant, interactive }: { variant: string; interactive: boolean }) {
  const look = parseMediaVariant(variant);
  return <MediaSurface look={look} kind="image" interactive={interactive} silent />;
}

export function VideoWidget({ variant, interactive, muted }: { variant: string; interactive: boolean; muted: boolean }) {
  const look = parseMediaVariant(variant);
  const src = safeImage(look.src);
  if (interactive) return <VideoStill src={src} look={look} />;
  return <MediaSurface look={{ ...look, src }} kind="video" interactive={false} silent={muted || !look.sound} play />;
}

function VideoStill({ src, look }: { src: string; look: MediaLook }) {
  const [poster, setPoster] = useState('');
  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    const finish = () => {
      if (cancelled) return;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (width && height) {
        const canvas = document.createElement('canvas');
        const factor = Math.min(1, 640 / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * factor));
        canvas.height = Math.max(1, Math.round(height * factor));
        const context = canvas.getContext('2d', { willReadFrequently: Boolean(look.key) });
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (look.key) {
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            applyChromaKey(pixels.data, look.key, look.amount);
            context.putImageData(pixels, 0, 0);
          }
          try { setPoster(canvas.toDataURL(look.key ? 'image/png' : 'image/jpeg', 0.72)); } catch { /* the frame stays blank */ }
        }
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
    video.addEventListener('loadeddata', finish, { once: true });
    video.src = src;
    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [src, look.key, look.amount]);
  if (!src || !poster) return <div className="stream-placeholder">Video</div>;
  return <img className="stream-image" src={poster} alt="" draggable={false} />;
}

function MediaSurface({ look, kind, interactive, silent, play = false }: { look: MediaLook; kind: 'image' | 'video'; interactive: boolean; silent: boolean; play?: boolean }) {
  const src = safeImage(look.src);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keyed = Boolean(src && look.key);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.loop = true;
    video.muted = silent || !play;
    video.playsInline = true;
    const showStill = () => {
      video.pause();
      if (video.currentTime < 0.05) video.currentTime = Math.min(0.1, Number.isFinite(video.duration) ? video.duration : 0.1);
    };
    const start = () => { void video.play().catch(() => {}); };
    const onReady = play ? start : showStill;
    onReady();
    video.addEventListener('loadeddata', onReady);
    return () => {
      video.removeEventListener('loadeddata', onReady);
      video.pause();
    };
  }, [src, silent, play]);
  useEffect(() => {
    if (!keyed) return undefined;
    let frame = 0;
    let last = 0;
    let running = true;
    const paint = (now = 0, schedule = false) => {
      if (!running) return;
      const canvas = canvasRef.current;
      const source = kind === 'video' ? videoRef.current : imageRef.current;
      const due = kind !== 'video' || !play || now - last >= 120;
      if (canvas && source && due) {
        last = now;
        paintKeyedFrame(canvas, source, look.key, look.amount);
      }
      if (schedule) frame = window.requestAnimationFrame(time => paint(time, true));
    };
    paint(0, kind === 'video' && play);
    const host = canvasRef.current?.parentElement;
    const observer = host ? new ResizeObserver(() => paint(performance.now(), false)) : null;
    if (host) observer?.observe(host);
    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [keyed, kind, src, look.key, look.amount, play]);
  if (!src) return interactive ? <div className="stream-placeholder">{kind === 'video' ? 'Video' : 'Image'}</div> : null;
  return (
    <div className="stream-media">
      {kind === 'video' ? (
        <video ref={videoRef} src={src} autoPlay={play} loop muted={silent || !play} playsInline preload={play ? 'auto' : 'metadata'} draggable={false} className={keyed ? 'is-source' : ''} />
      ) : (
        <img ref={imageRef} src={src} alt="" draggable={false} className={keyed ? 'is-source' : ''} onLoad={() => { if (canvasRef.current && imageRef.current) paintKeyedFrame(canvasRef.current, imageRef.current, look.key, look.amount); }} />
      )}
      {keyed && <canvas ref={canvasRef} />}
    </div>
  );
}

function paintKeyedFrame(canvas: HTMLCanvasElement, source: HTMLImageElement | HTMLVideoElement, key: string, amount: number) {
  const viewWidth = Math.max(1, Math.round(canvas.clientWidth));
  const viewHeight = Math.max(1, Math.round(canvas.clientHeight));
  const longest = Math.max(viewWidth, viewHeight);
  const factor = longest > 480 ? 480 / longest : 1;
  const width = Math.max(1, Math.round(viewWidth * factor));
  const height = Math.max(1, Math.round(viewHeight * factor));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  context.clearRect(0, 0, width, height);
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  try {
    const pixels = context.getImageData(0, 0, width, height);
    applyChromaKey(pixels.data, key, amount);
    context.putImageData(pixels, 0, 0);
  } catch { /* a cross-origin picture stays as drawn */ }
}

const SAMPLE_EMOTE_URL = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#18181b"/><circle cx="22" cy="26" r="5" fill="#fbbf24"/><circle cx="42" cy="26" r="5" fill="#fbbf24"/><path d="M18 40c6 8 22 8 28 0" fill="none" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/></svg>')}`;

function emoteCopies(mode: FxEmotes): number {
  if (mode === 'parade') return 6;
  if (mode === 'burst') return 8;
  return 10;
}

function emoteSlotStyle(mode: FxEmotes, index: number) {
  if (mode === 'parade') return { top: '38%', animationDelay: `${(index * 0.28).toFixed(2)}s` };
  if (mode === 'burst') {
    const angle = (index * 52) % 360;
    const distance = 28 + (index % 4) * 14;
    const radians = angle * Math.PI / 180;
    return {
      left: '50%',
      top: '50%',
      animationDelay: `${(index * 0.08).toFixed(2)}s`,
      ['--fx-dx' as string]: `${Math.cos(radians) * distance}px`,
      ['--fx-dy' as string]: `${Math.sin(radians) * distance}px`
    };
  }
  return { left: `${(index * 13 + 6) % 86}%`, animationDelay: `${(index * 0.22).toFixed(2)}s` };
}

function SpamEmotes({ burst, mode }: { burst: EmoteBurst; mode: FxEmotes }) {
  const moving = playingEmoteUrl(burst.url);
  const [src, setSrc] = useState(moving || burst.url);
  useEffect(() => { setSrc(moving || burst.url); }, [burst.url, moving]);
  return (
    <div className={`stream-fx-emotes is-${mode}`}>
      {Array.from({ length: emoteCopies(mode) }, (_, index) => (
        <img
          key={`${burst.url}-${index}`}
          src={src}
          alt=""
          style={emoteSlotStyle(mode, index)}
          onError={() => setSrc(current => current === burst.url ? current : burst.url)}
        />
      ))}
    </div>
  );
}

function useLiveEmoteBurst(token: string, enabled: boolean): EmoteBurst | null {
  const [burst, setBurst] = useState<EmoteBurst | null>(null);
  useEffect(() => {
    if (!enabled || !token) return undefined;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    let names: Record<string, string> = {};
    let clock = emptyEmoteSpam();
    let timer = 0;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe_chat', token }));
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as { type?: string; data?: unknown };
      if (message.type === 'chat_emotes' && message.data && typeof message.data === 'object') {
        names = message.data as Record<string, string>;
        return;
      }
      if (message.type !== 'chat' || !message.data || typeof message.data !== 'object') return;
      const next = pushEmoteLine(clock, message.data as OverlayChatLine, names, Date.now());
      clock = next.clock;
      if (!next.burst) return;
      setBurst(next.burst);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBurst(null), EMOTE_SPAM_COOLDOWN_MS + 400);
    };
    return () => {
      window.clearTimeout(timer);
      socket.close();
    };
  }, [token, enabled]);
  return enabled ? burst : null;
}

export function FxWidget({ alert, variant = '', preview = false, selected = false, token = '' }: { alert: StreamAlert | null; variant?: string; preview?: boolean; selected?: boolean; token?: string }) {
  const look = parseFxVariant(variant);
  const showFx = fxShouldShow({ alertKind: alert?.kind, preview, selected });
  const liveBurst = useLiveEmoteBurst(token, look.emotes !== 'off' && !preview);
  const burst = liveBurst ?? ((preview || selected) && look.emotes !== 'off' ? { name: 'Emote', url: SAMPLE_EMOTE_URL } : null);
  if (!showFx && !burst) return null;
  const live = liveFxKind(alert?.kind);
  const tint = look.tint === 'auto' ? (live ?? 'cheer') : look.tint;
  const count = showFx ? fxParticleCount(look) : 0;
  return (
    <div className={`stream-fx is-${look.design} is-tint-${tint} is-density-${look.density}`} data-fx-design={look.design} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={`${look.design}-${look.density}-${index}`} style={fxParticleStyle(look.design, index)} />
      ))}
      {burst && look.emotes !== 'off' && <SpamEmotes burst={burst} mode={look.emotes} />}
    </div>
  );
}

function DesignPicker({ label, value, options, onPick }: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onPick: (id: string) => void;
}) {
  return (
    <div className="stream-field">
      <span>{label}</span>
      <div className="stream-designs" role="group" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onPick(id)}>
            <i className={`stream-design-swatch is-${id}`} aria-hidden="true" />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function LabelFields({ variant, language, onVariant }: { variant: string; language: 'de' | 'en'; onVariant: (variant: string, history: boolean) => void }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const look = parseLabelVariant(variant);
  const commit = (next: LabelLook) => onVariant(formatLabelVariant(next), true);
  const sources: Array<[LabelSource, string]> = [
    ['follower', ui('Letzter Follower', 'Latest follower')],
    ['subscriber', ui('Letztes Abo', 'Latest sub')],
    ['cheerer', ui('Letzte Bits', 'Latest cheer')],
    ['follows', ui('Follows in dieser Session', 'Follows this session')],
    ['viewers', ui('Zuschauer', 'Viewers')]
  ];
  const designs: Array<[LabelDesign, string]> = [
    ['card', ui('Klassische Karte', 'Classic card')],
    ['line', ui('Ruhige Zeile', 'Quiet line')],
    ['badge', ui('Plakette', 'Badge')],
    ['glass', ui('Glaskarte', 'Glass card')],
    ['lower', ui('Bauchbinde', 'Lower third')]
  ];
  const accents: Array<[LabelAccent, string]> = [
    ['violet', ui('Violett', 'Violet')],
    ['amber', ui('Bernstein', 'Amber')],
    ['cyan', 'Cyan'],
    ['rose', ui('Rosa', 'Rose')]
  ];
  const marks: Array<[LabelMark, string]> = [
    ['plain', ui('Schlicht', 'Plain')],
    ['bar', ui('Balken', 'Bar')],
    ['underline', ui('Unterstrich', 'Underline')],
    ['glow', ui('Leuchten', 'Glow')]
  ];
  return (
    <>
      <label className="stream-field">
        <span>{ui('Anzeige', 'Display')}</span>
        <select value={look.source} onChange={event => commit({ ...look, source: event.target.value as LabelSource })}>
          {sources.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
      <DesignPicker label={ui('Motiv', 'Design')} value={look.design} options={designs} onPick={id => commit(withLabelDesign(look, id as LabelDesign))} />
      <label className="stream-field">
        <span>{ui('Akzent', 'Accent')}</span>
        <select value={look.accent} onChange={event => commit({ ...look, accent: event.target.value as LabelAccent })}>
          {accents.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
      <label className="stream-field">
        <span>{ui('Akzentform', 'Accent treatment')}</span>
        <select value={look.mark} onChange={event => commit({ ...look, mark: event.target.value as LabelMark })}>
          {marks.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
    </>
  );
}

function FxFields({ variant, language, onVariant }: { variant: string; language: 'de' | 'en'; onVariant: (variant: string, history: boolean) => void }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const look = parseFxVariant(variant);
  const commit = (next: FxLook) => onVariant(formatFxVariant(next), true);
  const designs: Array<[FxDesign, string]> = [
    ['confetti', ui('Konfetti', 'Confetti')],
    ['embers', ui('Glut', 'Embers')],
    ['rings', ui('Ringe', 'Rings')],
    ['burst', ui('Weicher Ausbruch', 'Soft burst')],
    ['streaks', ui('Streifen', 'Streaks')],
    ['aurora', 'Aurora'],
    ['fireworks', ui('Feuerwerk', 'Fireworks')],
    ['snow', ui('Schnee', 'Snow')],
    ['sparks', ui('Funken', 'Sparks')]
  ];
  const emoteModes: Array<[FxEmotes, string]> = [
    ['off', ui('Aus', 'Off')],
    ['rain', ui('Regen', 'Rain')],
    ['burst', ui('Aufpoppen', 'Pop')],
    ['parade', ui('Parade', 'Parade')]
  ];
  const densities: Array<[FxDensity, string]> = [
    ['sparse', ui('Luftig', 'Sparse')],
    ['medium', ui('Mittel', 'Medium')],
    ['rich', ui('Dicht', 'Rich')]
  ];
  const tints: Array<[FxTint, string]> = [
    ['auto', ui('Wie das Ereignis', 'Match the alert')],
    ['gold', 'Gold'],
    ['ice', ui('Eis', 'Ice')],
    ['ember', ui('Glut', 'Ember')],
    ['violet', ui('Violett', 'Violet')]
  ];
  return (
    <>
      <DesignPicker label={ui('Motiv', 'Design')} value={look.design} options={designs} onPick={id => commit({ ...look, design: id as FxDesign })} />
      <label className="stream-field">
        <span>{ui('Dichte', 'Density')}</span>
        <select value={look.density} onChange={event => commit({ ...look, density: event.target.value as FxDensity })}>
          {densities.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
      <label className="stream-field">
        <span>{ui('Farbe', 'Tint')}</span>
        <select value={look.tint} onChange={event => commit({ ...look, tint: event.target.value as FxTint })}>
          {tints.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
      <label className="stream-field">
        <span>{ui('Emote-Spam', 'Emote spam')}</span>
        <select value={look.emotes} onChange={event => commit({ ...look, emotes: event.target.value as FxEmotes })}>
          {emoteModes.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
      <p className="stream-hint">{ui('Das Motiv läuft bei Raid, Bits und verschenkten Abos. Emote-Spam zeigt dasselbe Emote auf dieser Fläche, sobald es innerhalb weniger Sekunden mindestens viermal im Chat steht.', 'The look plays for raids, bits, and gifted subs. Emote spam shows that same emote across this box once it appears at least four times in chat within a few seconds.')}</p>
    </>
  );
}

const TEXT_WIDGETS = new Set<SceneWidget['type']>(['label', 'goal', 'leaderboard', 'countdown', 'text']);

export function StreamWidgetMenu({
  widget, language, fonts, onVariant, onFont
}: {
  widget: SceneWidget;
  language: 'de' | 'en';
  fonts: AlertFontAsset[];
  onVariant: (variant: string, history: boolean) => void;
  onFont: (fonts: AlertFontAsset[], family: string, history: boolean) => void;
}) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const select = (label: string, value: string, options: Array<[string, string]>) => (
    <label className="stream-field">
      <span>{label}</span>
      <select value={value} onChange={event => onVariant(event.target.value, true)}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>
  );
  return (
    <div className="stream-menu">
      {TEXT_WIDGETS.has(widget.type) && (
        <AlertFontField
          language={language}
          family={widget.fontFamily || 'Inter, sans-serif'}
          fonts={fonts}
          onFamily={family => onFont(fonts, family, true)}
          onLibrary={(next, family) => onFont(next, family, true)}
        />
      )}
      {widget.type === 'label' && <LabelFields variant={widget.variant} language={language} onVariant={onVariant} />}
      {widget.type === 'goal' && <GoalFields variant={widget.variant} language={language} onVariant={onVariant} />}
      {widget.type === 'leaderboard' && <BoardFields variant={widget.variant} language={language} onVariant={onVariant} />}
      {widget.type === 'countdown' && (
        <>
          {select(ui('Quelle', 'Source'), widget.variant || 'track', [
            ['track', ui('Restlaufzeit des Songs', 'Time left in the song')],
            ['clock', ui('Eigener Timer', 'Custom timer')],
            ['streamstart', 'Streamstart'],
            ['subathon', 'Subathon']
          ])}
          {widget.variant === 'clock' && <TimerStart language={language} />}
          {(widget.variant === 'streamstart' || widget.variant === 'subathon') && <p>{ui('Zeit und Regeln im Countdown-Menü einstellen. Für Abschluss-Sound und Alert die eigene Countdown-OBS-URL verwenden.', 'Configure time and rules in the Countdown menu. Use its dedicated OBS URL for finish audio and alerts.')}</p>}
        </>
      )}
      {widget.type === 'text' && <TextFields variant={widget.variant} language={language} onVariant={onVariant} />}
      {(widget.type === 'image' || widget.type === 'video') && (
        <MediaFields kind={widget.type} variant={widget.variant} language={language} onVariant={onVariant} />
      )}
      {widget.type === 'alert' && <p>{ui('Folgt, Abos, Bits und Raids. Der Song-Hinweis wird zuerst gezeigt.', 'Follows, subs, bits, and raids. The song notice finishes first.')}</p>}
      {widget.type === 'fx' && <FxFields variant={widget.variant} language={language} onVariant={onVariant} />}
    </div>
  );
}

function TextFields({ variant, language, onVariant }: { variant: string; language: 'de' | 'en'; onVariant: (variant: string, history: boolean) => void }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const look = parseTextVariant(variant);
  const commit = (next: TextLook, history = true) => onVariant(formatTextVariant(next), history);
  return (
    <>
      <label className="stream-field">
        <span>{ui('Text', 'Text')}</span>
        <textarea value={look.text} maxLength={240} onChange={event => commit({ ...look, text: event.target.value }, false)} />
      </label>
      <label className="stream-field">
        <span>{ui('Farbe', 'Color')}</span>
        <input type="color" value={look.color} onChange={event => commit({ ...look, color: event.target.value })} />
      </label>
      <label className="stream-field">
        <span>{ui('Ausrichtung', 'Align')}</span>
        <select value={look.align} onChange={event => commit({ ...look, align: event.target.value as TextLook['align'] })}>
          <option value="left">{ui('Links', 'Left')}</option>
          <option value="center">{ui('Mitte', 'Center')}</option>
          <option value="right">{ui('Rechts', 'Right')}</option>
        </select>
      </label>
      <label className="stream-field">
        <span>{ui('Stärke', 'Weight')}</span>
        <select value={look.weight} onChange={event => commit({ ...look, weight: event.target.value as TextLook['weight'] })}>
          <option value="regular">{ui('Normal', 'Regular')}</option>
          <option value="bold">{ui('Fett', 'Bold')}</option>
        </select>
      </label>
      <label className="stream-check">
        <input type="checkbox" checked={look.shadow} onChange={event => commit({ ...look, shadow: event.target.checked })} />
        <span>{ui('Schatten', 'Shadow')}</span>
      </label>
    </>
  );
}

function MediaFields({ kind, variant, language, onVariant }: { kind: 'image' | 'video'; variant: string; language: 'de' | 'en'; onVariant: (variant: string, history: boolean) => void }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const look = parseMediaVariant(variant);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const commit = (next: MediaLook, history = true) => onVariant(formatMediaVariant({ ...next, sound: kind === 'video' ? next.sound : false }), history);
  const upload = async (file: File) => {
    const video = kind === 'video';
    const max = video ? 8 * 1024 * 1024 : 12 * 1024 * 1024;
    const types = video ? ['video/mp4', 'video/webm'] : ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (file.size > max) {
      setNote(video ? ui('Das Video darf maximal 8 MB groß sein.', 'The video can be at most 8 MB.') : ui('Das Bild darf maximal 12 MB groß sein.', 'The image can be at most 12 MB.'));
      return;
    }
    if (file.type && !types.includes(file.type)) {
      setNote(video ? ui('Nur MP4 oder WebM.', 'Only MP4 or WebM.') : ui('Nur PNG, JPG, WebP oder GIF.', 'Only PNG, JPG, WebP, or GIF.'));
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const response = await apiFetch('/api/v1/overlay/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: video ? 'alert-video' : 'logo', dataUrl })
    });
    const json = await response.json() as { url?: string; error?: string };
    if (!response.ok || !json.url) {
      setNote(json.error || ui('Die Datei konnte nicht gespeichert werden.', 'The file could not be saved.'));
      return;
    }
    setNote('');
    commit({ ...look, src: json.url });
  };
  return (
    <>
      <label className="stream-field">
        <span>{ui('Datei', 'File')}</span>
        <button type="button" onClick={() => fileRef.current?.click()}>{ui('Hochladen', 'Upload')}</button>
        <input ref={fileRef} type="file" accept={kind === 'video' ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/webp,image/gif'} hidden onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }} />
      </label>
      <label className="stream-field">
        <span>URL</span>
        <input value={look.src} placeholder="https://…" onChange={event => commit({ ...look, src: event.target.value }, false)} />
      </label>
      <label className="stream-check">
        <input type="checkbox" checked={Boolean(look.key)} onChange={event => commit({ ...look, key: event.target.checked ? (look.key || '#00ff00') : '' })} />
        <span>{ui('Chroma Key', 'Chroma key')}</span>
      </label>
      {look.key && (
        <>
          <label className="stream-field">
            <span>{ui('Keyfarbe', 'Key color')}</span>
            <input type="color" value={look.key} onChange={event => commit({ ...look, key: event.target.value })} />
          </label>
          <label className="stream-field">
            <span>{ui('Toleranz', 'Range')}</span>
            <input type="range" min={8} max={80} value={look.amount} onChange={event => commit({ ...look, amount: Number(event.target.value) }, false)} />
          </label>
        </>
      )}
      {kind === 'video' && (
        <label className="stream-check">
          <input type="checkbox" checked={look.sound} onChange={event => commit({ ...look, sound: event.target.checked })} />
          <span>{ui('Ton', 'Sound')}</span>
        </label>
      )}
      {note && <p className="stream-hint">{note}</p>}
    </>
  );
}

function BoardFields({ variant, language, onVariant }: { variant: string; language: 'de' | 'en'; onVariant: (variant: string, history: boolean) => void }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const look = parseBoardVariant(variant);
  const commit = (next: BoardLook) => onVariant(formatBoardVariant(next), true);
  const designs: Array<[BoardDesign, string]> = [
    ['list', ui('Liste', 'List')],
    ['bars', ui('Balken', 'Bars')],
    ['podium', ui('Podium', 'Podium')],
    ['cards', ui('Karten', 'Cards')],
    ['ladder', ui('Leiter', 'Ladder')]
  ];
  const accents: Array<[BoardLook['accent'], string]> = [
    ['violet', ui('Violett', 'Violet')],
    ['amber', ui('Bernstein', 'Amber')],
    ['cyan', 'Cyan'],
    ['rose', ui('Rosa', 'Rose')]
  ];
  return (
    <>
      <label className="stream-field">
        <span>{ui('Rangliste', 'Leaderboard')}</span>
        <select value={look.source} onChange={event => commit({ ...look, source: event.target.value === 'requests' ? 'requests' : 'bits' })}>
          <option value="bits">Bits</option>
          <option value="requests">{ui('Songwünsche', 'Song requests')}</option>
        </select>
      </label>
      <DesignPicker label={ui('Motiv', 'Design')} value={look.design} options={designs} onPick={id => commit({ ...look, design: id as BoardDesign })} />
      <label className="stream-field">
        <span>{ui('Farbe', 'Accent')}</span>
        <select value={look.accent} onChange={event => commit({ ...look, accent: event.target.value as BoardLook['accent'] })}>
          {accents.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
      <label className="stream-field">
        <span>{ui('Plätze', 'Places')}</span>
        <select value={String(look.rows)} onChange={event => commit({ ...look, rows: event.target.value === '3' ? 3 : 5 })}>
          <option value="3">3</option>
          <option value="5">5</option>
        </select>
      </label>
    </>
  );
}

function GoalFields({ variant, language, onVariant }: { variant: string; language: 'de' | 'en'; onVariant: (variant: string, history: boolean) => void }) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const look = parseGoalVariant(variant);
  const commit = (next: GoalLook) => onVariant(formatGoalVariant(next), true);
  const designs: Array<[GoalDesign, string]> = [
    ['bar', ui('Balken', 'Bar')],
    ['ring', ui('Ring', 'Ring')],
    ['steps', ui('Stufen', 'Steps')],
    ['meter', ui('Zähler', 'Meter')],
    ['banner', ui('Fläche', 'Banner')]
  ];
  const accents: Array<[LabelAccent, string]> = [
    ['violet', ui('Violett', 'Violet')],
    ['amber', ui('Bernstein', 'Amber')],
    ['cyan', 'Cyan'],
    ['rose', ui('Rosa', 'Rose')]
  ];
  return (
    <>
      <label className="stream-field">
        <span>{ui('Ziel', 'Goal')}</span>
        <select value={look.kind} onChange={event => commit({ ...look, kind: event.target.value as GoalKind })}>
          <option value="follower">Followers</option>
          <option value="sub">Subs</option>
        </select>
      </label>
      <DesignPicker label={ui('Motiv', 'Design')} value={look.design} options={designs} onPick={id => commit({ ...look, design: id as GoalDesign })} />
      <label className="stream-field">
        <span>{ui('Farbe', 'Accent')}</span>
        <select value={look.accent} onChange={event => commit({ ...look, accent: event.target.value as LabelAccent })}>
          {accents.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>
      <GoalTarget kind={look.kind} language={language} />
      <label className="stream-field">
        <span>{ui('Anzeige', 'Show')}</span>
        <select value={look.reveal} onChange={event => commit({ ...look, reveal: event.target.value === 'event' ? 'event' : 'always' })}>
          <option value="always">{ui('Immer', 'Always')}</option>
          <option value="event">{ui('Bei einem Alert', 'When an alert happens')}</option>
        </select>
      </label>
      {look.reveal === 'event' && (
        <>
          <label className="stream-field">
            <span>{ui('Sekunden', 'Seconds')}</span>
            <input inputMode="numeric" min={1} max={120} value={look.holdSeconds} onChange={event => commit({ ...look, holdSeconds: Number(event.target.value) || 1 })} />
          </label>
          <p className="stream-hint">{ui('Im Editor bleibt das Ziel sichtbar. Auf dem Stream erscheint es bei einem Alert und blendet danach aus.', 'The editor keeps the goal visible. On stream it appears when an alert happens, then fades out.')}</p>
        </>
      )}
    </>
  );
}

function GoalTarget({ kind, language }: { kind: 'follower' | 'sub'; language: 'de' | 'en' }) {
  const [target, setTarget] = useState('');
  return (
    <label className="stream-field">
      <span>{language === 'de' ? 'Zielwert' : 'Target'}</span>
      <input inputMode="numeric" value={target} placeholder="100" onChange={event => setTarget(event.target.value)} onBlur={() => {
        const value = Number(target);
        if (value > 0) void apiFetch('/api/v1/overlay/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, target: value }) });
      }} />
    </label>
  );
}

function TimerStart({ language }: { language: 'de' | 'en' }) {
  const [seconds, setSeconds] = useState('60');
  return (
    <label className="stream-field">
      <span>{language === 'de' ? 'Sekunden' : 'Seconds'}</span>
      <input inputMode="numeric" value={seconds} onChange={event => setSeconds(event.target.value)} />
      <button type="button" onClick={() => void apiFetch('/api/v1/overlay/timer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: Number(seconds) || 0 }) })}>
        {language === 'de' ? 'Start' : 'Start'}
      </button>
    </label>
  );
}
