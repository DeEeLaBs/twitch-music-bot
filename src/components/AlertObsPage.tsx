import { useEffect, useState } from 'react';
import { mergeOverlayOptions, type OverlayOptions } from '../overlayOptions.ts';
import { AlertFontFaces } from './alert-creator/AlertFontFaces.tsx';
import { AlertWidget, useStreamFeed } from './StreamWidgets.tsx';

export function AlertObsPage() {
  const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const language = params.get('lang') === 'de' ? 'de' : 'en';
  const [allowed, setAllowed] = useState(false);
  const [options, setOptions] = useState<OverlayOptions | null>(null);
  const feed = useStreamFeed(allowed ? token : '', false, () => options?.alertBox.durationMs || 6000, incoming => {
    setOptions(mergeOverlayOptions(incoming));
  });

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    void fetch(`/api/v1/overlay/access?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('denied')))
      .then(data => {
        if (cancelled) return;
        setOptions(mergeOverlayOptions(data.options));
        setAllowed(true);
      })
      .catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (!allowed || !options) return <div className="alert-obs-route" />;
  return (
    <div className="alert-obs-route">
      <AlertFontFaces fonts={options.alertBox.fonts} />
      {options.alertBox.customCss && <style>{options.alertBox.customCss}</style>}
      <AlertWidget alert={feed.alert} config={options.alertBox} language={language} interactive={false} />
    </div>
  );
}
