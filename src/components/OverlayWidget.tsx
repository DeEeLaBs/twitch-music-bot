import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Disc3, Music, Radio, Sparkles } from 'lucide-react';
import type { PlaybackState } from '../types.ts';
import { playbackIdentity } from '../playbackIdentity.ts';
import { DEFAULT_OVERLAY_OPTIONS, OverlayElementId, OverlayOptions, OverlayPosition, OverlayTheme, recommendedOverlaySize } from '../overlayOptions.ts';
import { useTranslations } from '../translations.ts';
import { advancePop, EMPTY_POP, enqueuePop, popFromDelta, type QueuePopState } from '../overlayQueuePop.ts';
import type { QueueDelta } from '../types.ts';
import { QueuePopCard } from './QueuePopCard.tsx';

interface OverlayWidgetProps {
  playback?: PlaybackState; options?: Partial<OverlayOptions>; language?: 'de' | 'en'; editorMode?: boolean;
  inStudio?: boolean;
  onPositionChange?: (element: OverlayElementId, position: OverlayPosition) => void;
  disableInternalWs?: boolean;
  fitFrame?: boolean;
}
const themeClasses: Record<OverlayTheme, string> = { glass:'text-white backdrop-blur-xl', neon:'text-fuchsia-50', minimal:'text-white', light:'text-neutral-950', ocean:'text-cyan-50', sunset:'text-orange-50', twitch:'text-white', mono:'text-black' };
const themeSurface: Record<OverlayTheme, { rgb:string; border:string; text:string }> = {
  glass:{rgb:'10,10,14',border:'rgba(255,255,255,.14)',text:'#fff'}, neon:{rgb:'74,4,78',border:'rgba(217,70,239,.55)',text:'#fdf4ff'},
  minimal:{rgb:'0,0,0',border:'rgba(255,255,255,.18)',text:'#fff'}, light:{rgb:'255,255,255',border:'rgba(212,212,216,.8)',text:'#09090b'},
  ocean:{rgb:'8,47,73',border:'rgba(34,211,238,.45)',text:'#ecfeff'}, sunset:{rgb:'136,19,55',border:'rgba(251,146,60,.55)',text:'#ffedd5'},
  twitch:{rgb:'18,12,37',border:'rgba(169,112,255,.5)',text:'#fff'}, mono:{rgb:'255,255,255',border:'rgba(111,111,111,.8)',text:'#111'}
};
const fallbackArtwork = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="#18181b"/><circle cx="80" cy="80" r="46" fill="#a855f7"/><circle cx="80" cy="80" r="14" fill="#18181b"/></svg>')}`;

const ELEMENT_NAMES: Record<OverlayElementId, { de: string; en: string }> = {
  artwork: { de: 'Cover', en: 'Artwork' },
  text: { de: 'Titel & Interpret', en: 'Title & Artist' },
  meta: { de: 'Metadaten', en: 'Metadata' },
  progress: { de: 'Fortschritt', en: 'Progress' },
  logo: { de: 'Logo', en: 'Logo' }
};

const Draggable: React.FC<{ id:OverlayElementId; position:OverlayPosition; enabled:boolean; language?: 'de'|'en'; onChange?:OverlayWidgetProps['onPositionChange']; children:React.ReactNode; className?:string }> = ({id,position,enabled,language='de',onChange,children,className=''}) => {
  const drag = useRef<{pointerId:number; rect:DOMRect}|null>(null);
  const onPointerDown = (event:React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return; const parent=event.currentTarget.parentElement; if(!parent)return;
    event.currentTarget.setPointerCapture(event.pointerId); drag.current={pointerId:event.pointerId,rect:parent.getBoundingClientRect()}; event.preventDefault();
  };
  const onPointerMove=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!enabled||!drag.current||drag.current.pointerId!==event.pointerId)return; const rect=drag.current.rect;
    onChange?.(id,{x:Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))});
  };
  const stop=()=>{drag.current=null;};
  const label = ELEMENT_NAMES[id] ? (language === 'de' ? ELEMENT_NAMES[id].de : ELEMENT_NAMES[id].en) : id;
  return (
    <div
      className={`${className} ${enabled?'overlay-editor-draggable':''}`}
      style={{position:'absolute',left:`${position.x}%`,top:id==='progress'?`clamp(16px, ${position.y}%, calc(100% - 16px))`:`${position.y}%`,transform:'translate(-50%,-50%)'}}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      data-overlay-element={id}
      title={enabled ? `${label}` : undefined}
    >
      {enabled && <span className="overlay-drag-handle-tag" aria-hidden="true">{label}</span>}
      {children}
    </div>
  );
};

export const OverlayWidget: React.FC<OverlayWidgetProps> = ({ playback: propPlayback, options, language='de', editorMode=false, inStudio=false, disableInternalWs=false, fitFrame=false, onPositionChange }) => {
  const [liveOptions, setLiveOptions] = useState<OverlayOptions | null>(null);
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isSyncDisabled = urlParams?.get('sync') === '0';
  const effectiveOptions = editorMode ? options : (!isSyncDisabled && liveOptions ? liveOptions : options);
  const settings={...DEFAULT_OVERLAY_OPTIONS,...effectiveOptions,positions:{...DEFAULT_OVERLAY_OPTIONS.positions,...effectiveOptions?.positions}};
  const [playlistAlert, setPlaylistAlert] = useState<{title: string; artist: string; addedBy: string; timestamp: number} | null>(null);
  useEffect(() => { if (!playlistAlert) return; const timer = window.setTimeout(() => setPlaylistAlert(null), 5000); return () => window.clearTimeout(timer); }, [playlistAlert]);
  useEffect(() => {
    if (!disableInternalWs) return;
    const handler = (event: Event) => setPlaylistAlert({...(event as CustomEvent<{title: string; artist: string; addedBy: string}>).detail, timestamp: Date.now()});
    window.addEventListener('playlist:track_added', handler);
    return () => window.removeEventListener('playlist:track_added', handler);
  }, [disableInternalWs]);
  // Queue pop: one card at a time, bursts collapse into "+N more". Deltas arrive as window events (see useBotState).
  const [pop, setPop] = useState<QueuePopState>(EMPTY_POP);
  const recentPopKeys = useRef<string[]>([]);
  // In the Studio the popup follows the local edits right away; the server echo would replay the old design first.
  const popSettings = inStudio && options ? { ...DEFAULT_OVERLAY_OPTIONS, ...options } : settings;
  const queuePopEnabled = popSettings.queuePop !== false;
  const queuePopSeconds = popSettings.queuePopSeconds;
  const queuePopDesign = { animation: popSettings.queuePopAnimation, position: popSettings.queuePopPosition, style: popSettings.queuePopStyle, showArt: popSettings.queuePopShowArt };
  useEffect(() => {
    if (!queuePopEnabled) { setPop(EMPTY_POP); return undefined; }
    const handler = (event: Event) => {
      const item = popFromDelta((event as CustomEvent<QueueDelta>).detail);
      // The same add can reach this page twice (dashboard hook and the widget's own socket): show it once.
      if (!item || recentPopKeys.current.includes(item.key)) return;
      recentPopKeys.current = [...recentPopKeys.current, item.key].slice(-30);
      setPop(state => enqueuePop(state, item));
    };
    window.addEventListener('queue:delta', handler);
    return () => window.removeEventListener('queue:delta', handler);
  }, [queuePopEnabled]);
  const popKey = pop.current?.key;
  useEffect(() => {
    if (!popKey) return undefined;
    const timer = window.setTimeout(() => setPop(advancePop), queuePopSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [popKey, queuePopSeconds]);
  const t=useTranslations(language); const [localPlayback,setLocalPlayback]=useState<PlaybackState|null>(propPlayback||null);
  useEffect(()=>{
    if(propPlayback) setLocalPlayback(propPlayback);
  },[propPlayback]);

  useEffect(()=>{
    if(editorMode || disableInternalWs) return;
    let stopped=false;
    let ws: WebSocket|null=null;
    let timer: number|null=null;
    let delay=1000;

    const fetchActiveOverlay=async()=>{
      try{
        const res=await fetch('/api/overlay/active',{cache:'no-store'});
        if(!res.ok)return;
        const data=await res.json();
        if(!stopped&&data?.options)setLiveOptions(data.options);
      }catch{}
    };
    void fetchActiveOverlay();

    const fetchState=async()=>{
      try{
        const res=await fetch('/api/state',{cache:'no-store'});
        if(!res.ok)return;
        const data=await res.json();
        if(!stopped&&data?.playback&&!propPlayback)setLocalPlayback(data.playback);
        if(!stopped&&data?.activeOverlay)setLiveOptions(data.activeOverlay);
      }catch{}
    };
    if(!propPlayback) void fetchState();

    const connect=()=>{
      if(stopped)return;
      try{
        const protocol=window.location.protocol==='https:'?'wss:':'ws:';
        ws=new WebSocket(`${protocol}//${window.location.host}/ws`);
        ws.onopen=()=>{delay=1000;};
        ws.onmessage=(event)=>{
          try{
            const payload=JSON.parse(event.data);
            if(payload?.type==='playlist:track_added' && payload.data) setPlaylistAlert({...payload.data, timestamp: Date.now()});
            if(payload?.type==='queue_delta'&&payload.data)window.dispatchEvent(new CustomEvent('queue:delta',{detail:payload.data}));
            if(payload?.type==='overlay_update'&&payload.data)setLiveOptions(payload.data);
            if((payload?.type==='state'||payload?.type==='patch')&&payload.data?.activeOverlay)setLiveOptions(payload.data.activeOverlay);
            if(!propPlayback){
              if(payload?.type==='state'&&payload.data?.playback)setLocalPlayback(payload.data.playback);
              if(payload?.type==='patch'&&payload.data?.playback)setLocalPlayback(payload.data.playback);
            }
          }catch{}
        };
        ws.onclose=()=>{
          if(!stopped){
            timer=window.setTimeout(connect,delay);
            delay=Math.min(delay*2,10000);
          }
        };
        ws.onerror=()=>{
          try{ws?.close();}catch{}
        };
      }catch{
        if(!stopped){
          timer=window.setTimeout(connect,delay);
          delay=Math.min(delay*2,10000);
        }
      }
    };
    connect();

    const onVisible=()=>{
      if(document.visibilityState==='visible'){
        void fetchActiveOverlay();
        if(!propPlayback) void fetchState();
        if(!ws||ws.readyState===WebSocket.CLOSED||ws.readyState===WebSocket.CLOSING){
          if(timer)window.clearTimeout(timer);
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('online',onVisible);

    return ()=>{
      stopped=true;
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('online',onVisible);
      if(timer)window.clearTimeout(timer);
      try{ws?.close();}catch{}
    };
  },[editorMode,propPlayback,disableInternalWs]);
  const song=localPlayback?.currentSong; const isPlaying=localPlayback?.isPlaying??false; const rawProgress=localPlayback?.progressSeconds??0; const duration=Math.max(0, localPlayback?.durationSeconds||song?.duration||0); const songKey=playbackIdentity(song); const lastSongKeyRef=useRef(songKey); const songChangedAtRef=useRef(0); const [smoothProgress,setSmoothProgress]=useState(rawProgress);
  useEffect(()=>{
    if(songKey!==lastSongKeyRef.current){
      lastSongKeyRef.current=songKey;
      songChangedAtRef.current=Date.now();
      setSmoothProgress((rawProgress && rawProgress < 5) ? rawProgress : 0);
      return;
    }
    if(!isPlaying){
      setSmoothProgress(rawProgress);
      return;
    }
    if(Date.now()-songChangedAtRef.current<4000 && rawProgress>5){
      return;
    }
    setSmoothProgress(p=>Math.abs(rawProgress-p)>3||rawProgress===0||rawProgress>p?rawProgress:p);
  },[rawProgress,songKey,isPlaying]);
  useEffect(()=>{if(!isPlaying)return;const timer=window.setInterval(()=>setSmoothProgress(v=>duration>0?Math.min(duration,v+1):v),1000);return()=>clearInterval(timer);},[duration,isPlaying,songKey]);
  const clampedProgress=duration>0?Math.min(duration,smoothProgress):smoothProgress;
  const progress=duration>0?Math.min(100,Math.max(0,clampedProgress/duration*100)):0; const formatTime=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  const surface=themeSurface[settings.theme]; const fontFamily=settings.fontFamily||(settings.fontStyle==='mono'?'ui-monospace, SFMono-Regular, Menlo, monospace':settings.fontStyle==='rounded'?'ui-rounded, Inter, system-ui, sans-serif':settings.fontStyle==='condensed'?'"Arial Narrow", "Roboto Condensed", Inter, sans-serif':'Inter, ui-sans-serif, system-ui, sans-serif');
  const sourceLabel=useMemo(()=>localPlayback?.source==='autoplay_radio'?(language==='de'?'Autoplay-Radio':'Autoplay radio'):localPlayback?.source==='queue'?(language==='de'?'Warteschlange':'Queue'):(language==='de'?'Bereit':'Idle'),[language,localPlayback?.source]);
  if(!song){if(settings.hideWhenIdle)return null;return <div className={`overlay-empty overlay-anim-${settings.animation}`} style={{transform:`scale(${settings.scale/100})`,transformOrigin:'center'}} role="status"><Disc3 className="h-5 w-5 animate-spin" aria-hidden="true"/><span>{t('overlayWaiting')}</span></div>;}
  const isRadio=song.requester?.username==='YouTube Music Radio'||song.requester?.displayName==='Autoplay Radio'; const isCoverCard=settings.layout==='coverCard'; const artworkEnabled=settings.showArtwork&&settings.layout!=='textOnly'&&!isCoverCard; const isLargeArtwork=['stacked','vertical','spotlight'].includes(settings.layout); const titleMarquee=settings.useMarquee&&song.title.length>34; const artistMarquee=settings.useMarquee&&song.artist.length>34; const free=settings.freePositioning;
  const size=recommendedOverlaySize(settings.layout,100); const badgeLabel=song.requester?.badge&&song.requester.badge!=='viewer'?song.requester.badge.toUpperCase():'';
  const meta=<div className="overlay-meta">
    {settings.showRequester&&<span className="overlay-requester">{settings.showRequesterAvatar&&<span className="requester-avatar">{song.requester.avatarUrl?<img src={song.requester.avatarUrl} alt=""/>:<span>{(song.requester.displayName||'?').slice(0,1).toUpperCase()}</span>}</span>}{isRadio?<Radio aria-hidden="true"/>:<Music aria-hidden="true"/>}{isRadio?t('overlayRadio'):`${t('overlayRequestedBy')} @${song.requester.displayName}`}{settings.showRequesterBadge&&badgeLabel&&<b className="requester-badge"><Award aria-hidden="true"/>{badgeLabel}</b>}</span>}
    {settings.showSource&&<span className="overlay-source"><Sparkles aria-hidden="true"/>{sourceLabel}</span>}{settings.showTime&&settings.progressStyle!=='waveform'&&<span className="overlay-time">{formatTime(clampedProgress)} / {formatTime(duration)}</span>}
  </div>;
  const progressBar=settings.showProgress?(
    settings.progressStyle==='waveform'?(
      <div className="overlay-waveform-progress" role="progressbar" aria-label={t('ovProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        {settings.showTime&&<span className="waveform-time waveform-time-start">{formatTime(clampedProgress)}</span>}
        <div className="waveform-track">
          <div className="waveform-ticks" aria-hidden="true">
            {Array.from({length:32}).map((_,i)=>(
              <span key={i} className={`waveform-tick ${i<Math.round((progress/100)*32)?'is-active':''}`}/>
            ))}
          </div>
          <span className="waveform-playhead" style={{left:`${progress}%`}} aria-hidden="true"/>
        </div>
        {settings.showTime&&<span className="waveform-time waveform-time-end">{formatTime(duration)}</span>}
      </div>
    ):settings.progressStyle==='equalizer'?(
      <div className="overlay-equalizer-progress" role="progressbar" aria-label={t('ovProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        {settings.showTime&&<span className="equalizer-time">{formatTime(clampedProgress)}</span>}
        <div className="equalizer-bars" aria-hidden="true">
          {Array.from({length:16}).map((_,i)=>{
            const active = i < Math.round((progress/100)*16);
            return <span key={i} className={`eq-bar ${active?'is-active':''} ${isPlaying?'is-playing':''}`} style={{'--eq-index':i} as React.CSSProperties}/>;
          })}
        </div>
        {settings.showTime&&<span className="equalizer-time">{formatTime(duration)}</span>}
      </div>
    ):settings.progressStyle==='spark'?(
      <div className="overlay-progress overlay-progress-spark" role="progressbar" aria-label={t('ovProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{width:`${progress}%`}}>
          <span className="progress-spark-head" aria-hidden="true"/>
        </span>
      </div>
    ):settings.progressStyle==='ring'||settings.progressStyle==='border'?null:(
      <div className="overlay-progress" role="progressbar" aria-label={t('ovProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:`${progress}%`}}/></div>
    )
  ):null;
  const text=<div className="overlay-copy">{!isCoverCard&&<p className="overlay-kicker">{isPlaying?t('overlayNowPlaying'):t('overlayPaused')}</p>}<h2 className={titleMarquee?'overlay-marquee':''} title={song.title}><span>{song.title}</span></h2><p className={`overlay-artist ${artistMarquee?'overlay-marquee':''}`} title={song.artist}><span>{song.artist}</span></p>{!free&&(settings.showRequester||(settings.showTime&&settings.progressStyle!=='waveform')||settings.showSource)&&meta}{!free&&isCoverCard&&progressBar}</div>;
  const isSpinning = isPlaying && settings.artworkShape === 'vinyl';
  const showRing = settings.showProgress && settings.progressStyle === 'ring';
  const artwork=artworkEnabled?<div className={`overlay-artwork ${isLargeArtwork?'overlay-artwork-large':settings.layout==='compact'?'overlay-artwork-small':''} ${isSpinning?'is-spinning':''} ${showRing?'has-progress-ring':''}`}>
    {showRing&&<svg className="artwork-progress-ring" viewBox="0 0 100 100" aria-hidden="true"><circle className="ring-bg" cx="50" cy="50" r="46"/><circle className="ring-bar" cx="50" cy="50" r="46" style={{strokeDashoffset: 289.026 * (1 - progress / 100)}}/></svg>}
    <img src={song.albumArtUrl||fallbackArtwork} alt="" onError={e=>{e.currentTarget.src=fallbackArtwork;}}/><span className={`playback-indicator ${isPlaying?'is-playing':''}`} aria-hidden="true"/></div>:null;
  const logo=settings.showLogo&&settings.logoImageUrl?<img className="overlay-logo" src={settings.logoImageUrl} alt="" style={{width:settings.logoSize,height:settings.logoSize}}/>:null;
  const coverBgUrl=(song.albumArtUrl||fallbackArtwork).replace(/"/g,'');
  // coverCard: image fills the card, gradient overlay goes from semi-transparent top to darker bottom with soft radial vignette so text stays readable
  const coverCardAlphaTop = Math.min(0.65, Math.max(0.15, 1 - (settings.backgroundOpacity / 100) * 0.90));
  const coverCardAlphaBottom = Math.min(0.88, Math.max(0.45, 1 - (settings.backgroundOpacity / 100) * 0.50));
  const bgImageStyle=settings.backgroundImageUrl?`linear-gradient(rgba(${surface.rgb},.18),rgba(${surface.rgb},.18)),url("${settings.backgroundImageUrl.replace(/"/g,'')}")`:isCoverCard?`linear-gradient(to bottom,rgba(0,0,0,${coverCardAlphaTop.toFixed(2)}),rgba(0,0,0,${coverCardAlphaBottom.toFixed(2)})),radial-gradient(ellipse at center,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.65) 100%),url("${coverBgUrl}")`:undefined;
  const coverBorderColor = isCoverCard
    ? (settings.theme === 'glass' ? 'rgba(255,255,255,0.28)' : surface.border)
    : surface.border;
  return <>
    <style>{`@keyframes playlist-alert {0%{opacity:0;transform:translateY(-12px) scale(.97)} 10%,85%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-8px)}}`}</style>
    {playlistAlert && <div key={playlistAlert.timestamp} role="status" style={{position:'absolute', top:8, left:8, right:8, zIndex:100, padding:'16px 20px', borderRadius:16, background:'linear-gradient(120deg,#581c87,#312e81)', border:'1px solid #c084fc', color:'#fff', boxShadow:'0 8px 24px #0006', animation:'playlist-alert 5s ease both', fontSize:16, fontFamily, textAlign:settings.textAlign}}>
      {t('streamPlaylistAlert').replace('{title}', playlistAlert.title).replace('{artist}', playlistAlert.artist).replace('{user}', playlistAlert.addedBy)}
    </div>}
    {settings.customCss&&<style>{settings.customCss}</style>}
    <article
      key={editorMode ? 'editor' : (isCoverCard ? `coverCard-${songKey}` : undefined)}
      id="obs-now-playing-banner"
      className={`overlay-widget overlay-${settings.layout} ${themeClasses[settings.theme]} overlay-font-${settings.fontStyle} overlay-align-${settings.textAlign} overlay-art-${settings.artworkShape} overlay-progress-${settings.progressStyle} overlay-anim-${settings.animation} ${free?'overlay-free':''} ${fitFrame?'overlay-fit-frame':''}`}
      style={{
        borderRadius: `${settings.radius}px`,
        borderWidth: settings.showBorder ? '1px' : '0px',
        borderStyle: settings.showBorder ? 'solid' : 'none',
        borderColor: coverBorderColor,
        backgroundClip: 'padding-box',
        transform: `scale(${settings.scale/100})`,
        transformOrigin: (editorMode || inStudio) ? 'center' : 'top left',
        backgroundColor: isCoverCard ? '#09090b' : `rgba(${surface.rgb},${Math.max(.25,Math.min(1,settings.backgroundOpacity/100))})`,
        backgroundImage: bgImageStyle,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        color: isCoverCard ? '#ffffff' : surface.text,
        boxShadow: `0 14px 36px rgba(0,0,0,${Math.max(0,Math.min(1,settings.shadowStrength/100)).toFixed(2)}), inset 0 0 0 1px ${isCoverCard ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
        fontFamily,
        textAlign: settings.textAlign,
        ['--overlay-accent' as string]: settings.accent,
        ['--overlay-surface' as string]: isCoverCard ? '9,9,11' : surface.rgb,
        ['--overlay-text' as string]: isCoverCard ? '#ffffff' : surface.text,
        ['--overlay-progress' as string]: `${progress}%`,
        ...(free ? { width: `${size.width}px`, height: `${size.height}px`, minHeight: `${size.height}px` } : {}),
        ...(fitFrame ? { width: '100%', height: '100%', maxWidth: 'none', minHeight: 0, transform: 'none', position: 'relative' as const } : {})
      } as React.CSSProperties}
      aria-label={`${t('npTitle')}: ${song.title} – ${song.artist}`}
    >
      {free?<>
        {artwork&&<Draggable id="artwork" position={settings.positions.artwork} enabled={editorMode} language={language} onChange={onPositionChange}>{artwork}</Draggable>}
        <Draggable id="text" position={settings.positions.text} enabled={editorMode} language={language} onChange={onPositionChange} className="overlay-free-text">{text}</Draggable>
        {(settings.showRequester||(settings.showTime&&settings.progressStyle!=='waveform')||settings.showSource)&&<Draggable id="meta" position={settings.positions.meta} enabled={editorMode} language={language} onChange={onPositionChange} className="overlay-free-meta">{meta}</Draggable>}
        {progressBar&&<Draggable id="progress" position={settings.positions.progress} enabled={editorMode} language={language} onChange={onPositionChange} className="overlay-free-progress">{progressBar}</Draggable>}
        {logo&&<Draggable id="logo" position={settings.positions.logo} enabled={editorMode} language={language} onChange={onPositionChange}>{logo}</Draggable>}
      </>:<>{artwork}{text}{logo}{!isCoverCard?progressBar:null}</>}
      {queuePopEnabled&&pop.current&&<QueuePopCard key={pop.current.key} item={pop.current} language={language} seconds={queuePopSeconds} design={queuePopDesign}/>}
    </article>
  </>;
};
