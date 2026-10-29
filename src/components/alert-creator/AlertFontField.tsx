import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '../../apiClient.ts';
import { ALERT_FONTS } from '../../alertBox.ts';
import {
  ALERT_FONT_MAX_BYTES, cssFontFamily, fontExtensionFromName, mimeForFontExtension, normalizeAlertFonts,
  type AlertFontAsset
} from '../../alertFonts.ts';
import { AlertFontFaces } from './AlertFontFaces.tsx';

export function AlertFontField({
  language, family, fonts, onFamily, onLibrary
}: {
  language: 'de' | 'en';
  family: string;
  fonts: AlertFontAsset[];
  onFamily: (family: string) => void;
  onLibrary: (fonts: AlertFontAsset[], family: string) => void;
}) {
  const ui = (de: string, en: string) => language === 'de' ? de : en;
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const library = normalizeAlertFonts(fonts);
  const choices = [
    ...ALERT_FONTS.map(font => ({ value: font.family, label: ui(font.de, font.en) })),
    ...library.map(font => ({ value: cssFontFamily(font.family), label: font.family }))
  ];
  const known = new Set(choices.map(choice => choice.value));
  const listed = family && !known.has(family) ? [{ value: family, label: family }, ...choices] : choices;
  const selectedValue = family || 'Inter, sans-serif';
  const selected = listed.find(choice => choice.value === selectedValue) || listed[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const extension = fontExtensionFromName(file.name);
    if (!extension) {
      setNote(ui('Nur TTF, OTF, WOFF oder WOFF2.', 'Only TTF, OTF, WOFF or WOFF2.'));
      return;
    }
    if (file.size > ALERT_FONT_MAX_BYTES) {
      setNote(ui('Die Datei darf maximal 12 MB groß sein.', 'The file must be 12 MB or smaller.'));
      return;
    }
    setNote(ui('Wird hochgeladen…', 'Uploading…'));
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const comma = raw.indexOf(',');
      const mime = mimeForFontExtension(extension);
      const dataUrl = comma >= 0 ? `data:${mime};base64,${raw.slice(comma + 1)}` : raw;
      const response = await apiFetch('/api/v1/overlay/fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, dataUrl })
      });
      const json = await response.json() as { id?: string; family?: string; url?: string; format?: AlertFontAsset['format']; error?: string };
      const stored = normalizeAlertFonts([{ id: json.id, family: json.family, url: json.url, format: json.format }]);
      const asset = stored[0];
      if (!response.ok || !asset) {
        setNote(json.error || ui('Upload fehlgeschlagen.', 'Upload failed.'));
        return;
      }
      const next = library.some(item => item.url === asset.url) ? library : [...library, asset].slice(0, 24);
      onLibrary(next, cssFontFamily(asset.family));
      setOpen(false);
      setNote(ui('Schrift gespeichert. Sie steht überall zur Verfügung, wo Text bearbeitet wird.', 'Font saved. It is available everywhere text is edited.'));
    } catch {
      setNote(ui('Upload fehlgeschlagen.', 'Upload failed.'));
    }
  };

  return (
    <div className="suite-field suite-span suite-font" ref={rootRef}>
      <span>{ui('Schrift', 'Font')}</span>
      <button
        type="button"
        className="suite-font-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        style={{ fontFamily: selected?.value }}
        onClick={() => setOpen(current => !current)}
      >
        {selected?.label || ui('Schrift', 'Font')}
      </button>
      {open && (
        <div id={menuId} className="suite-font-menu" role="listbox" aria-label={ui('Schrift', 'Font')}>
          <AlertFontFaces fonts={library} />
          {listed.map(choice => (
            <button
              key={choice.value}
              type="button"
              role="option"
              aria-selected={choice.value === selectedValue}
              style={{ fontFamily: choice.value }}
              onClick={() => {
                onFamily(choice.value);
                setOpen(false);
              }}
            >
              {choice.label}
            </button>
          ))}
          <button type="button" className="suite-font-upload" onClick={() => fileRef.current?.click()}>
            {ui('Schrift hochladen', 'Upload font')}
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        className="suite-font-file"
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        aria-label={ui('Schriftdatei', 'Font file')}
        onChange={event => {
          const file = event.target.files?.[0];
          event.currentTarget.value = '';
          void upload(file);
        }}
      />
      {note && <p className="suite-hint">{note}</p>}
    </div>
  );
}
