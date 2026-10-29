import { useEffect } from 'react';
import { alertFontFaceCss, type AlertFontAsset } from '../../alertFonts.ts';

export function AlertFontFaces({ fonts }: { fonts: AlertFontAsset[] }) {
  useEffect(() => {
    if (typeof FontFace === 'undefined') return undefined;
    let cancelled = false;
    for (const font of fonts) {
      let face: FontFace;
      try {
        face = new FontFace(font.family, `url("${font.url}") format("${font.format}")`);
      } catch {
        continue;
      }
      void face.load().then(loaded => {
        if (!cancelled) document.fonts.add(loaded);
      }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [fonts]);
  const css = alertFontFaceCss(fonts);
  return css ? <style>{css}</style> : null;
}
