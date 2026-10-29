export const ALERT_FONT_MAX_BYTES = 12 * 1024 * 1024;

export type AlertFontExtension = 'ttf' | 'otf' | 'woff' | 'woff2';
export type AlertFontCssFormat = 'truetype' | 'opentype' | 'woff' | 'woff2';

export interface AlertFontAsset {
  id: string;
  family: string;
  url: string;
  format: AlertFontCssFormat;
}

const MIME_BY_EXTENSION: Record<AlertFontExtension, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2'
};

const FORMAT_BY_EXTENSION: Record<AlertFontExtension, AlertFontCssFormat> = {
  ttf: 'truetype',
  otf: 'opentype',
  woff: 'woff',
  woff2: 'woff2'
};

const EXTENSION_BY_MIME: Record<string, AlertFontExtension> = {
  'font/ttf': 'ttf',
  'application/x-font-ttf': 'ttf',
  'application/x-font-truetype': 'ttf',
  'font/otf': 'otf',
  'application/x-font-otf': 'otf',
  'font/opentype': 'otf',
  'application/vnd.ms-opentype': 'otf',
  'font/woff': 'woff',
  'application/font-woff': 'woff',
  'application/x-font-woff': 'woff',
  'font/woff2': 'woff2',
  'application/font-woff2': 'woff2'
};

const LOOSE_MIME = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/font-sfnt', 'font/sfnt']);
const FORMATS = new Set<AlertFontCssFormat>(['truetype', 'opentype', 'woff', 'woff2']);
const ASSET_URL = /^\/overlay-assets\/[A-Za-z0-9._-]+$/;

export function mimeForFontExtension(extension: AlertFontExtension) {
  return MIME_BY_EXTENSION[extension];
}

export function fontExtensionFromName(name: string): AlertFontExtension | '' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.woff2')) return 'woff2';
  if (lower.endsWith('.woff')) return 'woff';
  if (lower.endsWith('.otf')) return 'otf';
  if (lower.endsWith('.ttf')) return 'ttf';
  return '';
}

export function sanitizeFontFamily(name: string) {
  return name.replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function fontFamilyFromFileName(name: string) {
  const base = name.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return sanitizeFontFamily(base) || 'Uploaded font';
}

export function cssFontFamily(family: string) {
  const clean = sanitizeFontFamily(family);
  return clean ? `"${clean}", sans-serif` : 'Inter, sans-serif';
}

export function fontBytesMatch(extension: AlertFontExtension, bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const at = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (extension === 'woff') return at([0x77, 0x4f, 0x46, 0x46]);
  if (extension === 'woff2') return at([0x77, 0x4f, 0x46, 0x32]);
  if (extension === 'otf') return at([0x4f, 0x54, 0x54, 0x4f]);
  return at([0x00, 0x01, 0x00, 0x00]) || at([0x74, 0x72, 0x75, 0x65]) || at([0x74, 0x79, 0x70, 0x31]);
}

export function decodedFontByteLength(base64Length: number) {
  if (!Number.isFinite(base64Length) || base64Length < 0) return 0;
  return Math.floor(base64Length * 3 / 4);
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const clean = value.replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export interface ParsedFontFile {
  extension: AlertFontExtension;
  mime: string;
  format: AlertFontCssFormat;
  family: string;
  bytes: Uint8Array;
}

export function parseFontDataUrl(dataUrl: string, fileName: string): { ok: true; font: ParsedFontFile } | { ok: false; error: string } {
  const match = /^data:([^;,]+)?;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) return { ok: false, error: 'Ungültiges Schriftformat.' };
  const extension = fontExtensionFromName(fileName);
  if (!extension) return { ok: false, error: 'Nur TTF, OTF, WOFF oder WOFF2.' };
  const claimed = (match[1] || '').trim().toLowerCase();
  if (!LOOSE_MIME.has(claimed) && EXTENSION_BY_MIME[claimed] !== extension) {
    return { ok: false, error: 'Nur TTF, OTF, WOFF oder WOFF2.' };
  }
  const payload = match[2].replace(/\s/g, '');
  if (decodedFontByteLength(payload.length) > ALERT_FONT_MAX_BYTES) {
    return { ok: false, error: 'Die Datei darf maximal 12 MB groß sein.' };
  }
  const bytes = decodeBase64(payload);
  if (!bytes?.length || bytes.length > ALERT_FONT_MAX_BYTES) {
    return { ok: false, error: bytes && bytes.length > ALERT_FONT_MAX_BYTES ? 'Die Datei darf maximal 12 MB groß sein.' : 'Ungültiges Schriftformat.' };
  }
  if (!fontBytesMatch(extension, bytes)) return { ok: false, error: 'Das ist keine Schriftdatei.' };
  return {
    ok: true,
    font: {
      extension,
      mime: MIME_BY_EXTENSION[extension],
      format: FORMAT_BY_EXTENSION[extension],
      family: fontFamilyFromFileName(fileName),
      bytes
    }
  };
}

export function normalizeAlertFonts(value: unknown): AlertFontAsset[] {
  if (!Array.isArray(value)) return [];
  const next: AlertFontAsset[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (next.length >= 24 || !item || typeof item !== 'object') continue;
    const raw = item as Partial<AlertFontAsset>;
    const url = String(raw.url || '');
    const family = sanitizeFontFamily(String(raw.family || ''));
    const format = raw.format;
    if (!family || !ASSET_URL.test(url) || !format || !FORMATS.has(format) || seen.has(url)) continue;
    seen.add(url);
    const id = String(raw.id || '').replace(/[^\w.-]+/g, '').slice(0, 40) || `font_${next.length + 1}`;
    next.push({ id, family, url, format });
  }
  return next;
}

export function alertFontFaceCss(fonts: Array<Pick<AlertFontAsset, 'family' | 'url' | 'format'>>) {
  return normalizeAlertFonts(fonts).map(font => (
    `@font-face{font-family:"${font.family}";src:url("${font.url}") format("${font.format}");font-display:swap;}`
  )).join('');
}
