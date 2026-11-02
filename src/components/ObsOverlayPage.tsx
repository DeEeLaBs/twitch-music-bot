import { useEffect, useRef, useState } from 'react';
import type { PlaybackState } from '../types.ts';
import { mergeOverlayOptions, type OverlayOptions } from '../overlayOptions.ts';
import { designForRender } from '../scene.ts';
import { OverlayWidget } from './OverlayWidget.tsx';
import { OverlayChat } from './OverlayChat.tsx';
import { SceneStage } from './SceneStage.tsx';
import { AlertFontFaces } from './alert-creator/AlertFontFaces.tsx';

interface ObsOverlayPageProps {
  playback?: PlaybackState;
  activeOverlay?: OverlayOptions;
  language?: 'de' | 'en';
}

export function ObsOverlayPage({ playback, language = 'en' }: ObsOverlayPageProps) {
  const token = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('token') || '';
  const overlayId = new URLSearchParams(window.location.search).get('id');
  const updates = useRef(0);
  const [resolvedId, setResolvedId] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [saved, setSaved] = useState<OverlayOptions | null>(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false, polling = false;
    const refresh = () => {if(polling)return;polling=true;const version=updates.current;return fetch(`/api/v1/overlay/access?token=${encodeURIComponent(token)}${overlayId === null ? '' : `&id=${encodeURIComponent(overlayId)}`}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('denied')))
      .then(data => {
        if (cancelled || version !== updates.current) return;
        setResolvedId(data.id);
        setSaved(mergeOverlayOptions(data.options));
        setAllowed(true);
      })
      .catch(() => {
        if (!cancelled && version === updates.current) setAllowed(false);
      }).finally(()=>{polling=false;});};
    void refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [token, overlayId]);

  useEffect(() => {
    if(!resolvedId || !token)return;
    let stopped=false,socket:WebSocket|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    const connect=()=>{
      socket=new WebSocket(`${window.location.protocol==='https:'?'wss:':'ws:'}//${window.location.host}/ws`);
      socket.onopen=()=>socket?.send(JSON.stringify({type:'subscribe_overlay',token,overlayId:resolvedId}));
      socket.onmessage=message=>{
        try {
          const body=JSON.parse(String(message.data));
          if(body.type!=='overlay_document'||body.data?.id!==resolvedId)return;
          updates.current++;
          if(body.data.options){setSaved(mergeOverlayOptions(body.data.options));setAllowed(true);}else setAllowed(false);
        }catch{/* Ignore unrelated messages. */}
      };
      socket.onerror=()=>socket?.close();
      socket.onclose=()=>{if(!stopped)timer=setTimeout(connect,1000);};
    };
    connect();return()=>{stopped=true;clearTimeout(timer);socket?.close();};
  },[resolvedId,token]);

  if (!allowed) return <div className="overlay-denied" role="status">Overlay nicht verfügbar.</div>;
  const options = mergeOverlayOptions(saved || undefined);
  if (options.scene) {
    const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('resolution');
    const design = designForRender(options.scene, query);
    return (
      <div className="overlay-route" data-resolution-ignored={design.queryIgnored ? 'true' : 'false'}>
        <SceneStage scene={{ ...options.scene, design: { width: design.width, height: design.height } }} options={options} playback={playback} language={language} token={token} outputOverlayId={resolvedId} />
      </div>
    );
  }
  return (
    <div className="overlay-route">
      <AlertFontFaces fonts={options.alertBox.fonts} />
      <OverlayWidget playback={playback} options={options} language={language} disableInternalWs />
      <OverlayChat options={options.chat} token={token} />
    </div>
  );
}
