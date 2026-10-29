import { useEffect, useState } from 'react';
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

export function ObsOverlayPage({ playback, activeOverlay, language = 'en' }: ObsOverlayPageProps) {
  const token = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('token') || '';
  const [allowed, setAllowed] = useState(false);
  const [saved, setSaved] = useState<OverlayOptions | null>(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetch(`/api/v1/overlay/access?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('denied')))
      .then(data => {
        if (cancelled) return;
        setSaved(mergeOverlayOptions(data.options));
        setAllowed(true);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  if (!allowed) return <div className="overlay-denied" />;
  const options = mergeOverlayOptions(activeOverlay || saved || undefined);
  if (options.scene) {
    const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('resolution');
    const design = designForRender(options.scene, query);
    return (
      <div className="overlay-route" data-resolution-ignored={design.queryIgnored ? 'true' : 'false'}>
        <SceneStage scene={{ ...options.scene, design: { width: design.width, height: design.height } }} options={options} playback={playback} language={language} token={token} />
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
