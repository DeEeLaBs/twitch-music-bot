import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALERT_FONT_MAX_BYTES, alertFontFaceCss, cssFontFamily, decodedFontByteLength, fontBytesMatch,
  fontExtensionFromName, fontFamilyFromFileName, mimeForFontExtension, normalizeAlertFonts, parseFontDataUrl
} from '../src/alertFonts.ts';

const dataUrl = (bytes: number[], mime = 'application/octet-stream') => {
  const payload = Buffer.from(bytes).toString('base64');
  return `data:${mime};base64,${payload}`;
};

const padded = (signature: number[]) => [...signature, ...new Array(8).fill(0)];

test('font files keep a 12 MB ceiling and the four font formats', () => {
  assert.equal(ALERT_FONT_MAX_BYTES, 12 * 1024 * 1024);
  assert.equal(decodedFontByteLength(Math.ceil((11 * 1024 * 1024) * 4 / 3)) < ALERT_FONT_MAX_BYTES, true);
  assert.equal(fontExtensionFromName('Face.TTF'), 'ttf');
  assert.equal(fontExtensionFromName('Face.otf'), 'otf');
  assert.equal(fontExtensionFromName('Face.woff'), 'woff');
  assert.equal(fontExtensionFromName('Face.woff2'), 'woff2');
  assert.equal(fontExtensionFromName('Face.png'), '');
  assert.equal(mimeForFontExtension('ttf'), 'font/ttf');
  assert.equal(mimeForFontExtension('otf'), 'font/otf');
  assert.equal(mimeForFontExtension('woff'), 'font/woff');
  assert.equal(mimeForFontExtension('woff2'), 'font/woff2');
});

test('a real font signature is accepted and a renamed binary is rejected', () => {
  const ttf = parseFontDataUrl(dataUrl(padded([0x00, 0x01, 0x00, 0x00]), 'font/ttf'), 'Cool_Font-Bold!!.ttf');
  assert.equal(ttf.ok, true);
  if (ttf.ok) {
    assert.equal(ttf.font.family, 'Cool Font Bold');
    assert.equal(ttf.font.format, 'truetype');
    assert.equal(ttf.font.mime, 'font/ttf');
  }
  assert.equal(parseFontDataUrl(dataUrl(padded([0x4f, 0x54, 0x54, 0x4f])), 'Serif.otf').ok, true);
  assert.equal(parseFontDataUrl(dataUrl(padded([0x77, 0x4f, 0x46, 0x46])), 'Round.woff').ok, true);
  assert.equal(parseFontDataUrl(dataUrl(padded([0x77, 0x4f, 0x46, 0x32])), 'Round.woff2').ok, true);
  assert.equal(fontBytesMatch('ttf', Uint8Array.from([0x74, 0x72, 0x75, 0x65, 0, 0, 0, 0, 0, 0, 0, 0])), true);
  const png = parseFontDataUrl(dataUrl([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'not-a-font.ttf');
  assert.equal(png.ok, false);
  if (!png.ok) assert.equal(png.error, 'Das ist keine Schriftdatei.');
  assert.equal(parseFontDataUrl(dataUrl(padded([0x00, 0x01, 0x00, 0x00]), 'image/png'), 'Face.ttf').ok, false);
  assert.equal(parseFontDataUrl(dataUrl(padded([0x00, 0x01, 0x00, 0x00])), 'Face.exe').ok, false);
});

test('an oversized payload is rejected before the bytes are trusted', () => {
  const tooBig = 'A'.repeat(Math.ceil((ALERT_FONT_MAX_BYTES + 8) * 4 / 3));
  const parsed = parseFontDataUrl(`data:font/ttf;base64,${tooBig}`, 'Big.ttf');
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error, 'Die Datei darf maximal 12 MB groß sein.');
});

test('a saved font stays on the shared library and becomes a font-face rule', () => {
  assert.equal(fontFamilyFromFileName('C:\\fonts\\Stream Deck.otf'), 'Stream Deck');
  assert.equal(cssFontFamily('Stream Deck'), '"Stream Deck", sans-serif');
  const fonts = normalizeAlertFonts([
    { id: 'font_1', family: 'Stream Deck', url: '/overlay-assets/alert-font-1.otf', format: 'opentype' },
    { id: 'font_1', family: 'Stream Deck', url: '/overlay-assets/alert-font-1.otf', format: 'opentype' },
    { family: 'Bad', url: 'https://evil.example/font.ttf', format: 'truetype' },
    { family: 'Nope', url: '/overlay-assets/font.ttf', format: 'exe' }
  ]);
  assert.equal(fonts.length, 1);
  assert.equal(fonts[0].family, 'Stream Deck');
  assert.match(alertFontFaceCss(fonts), /@font-face\{font-family:"Stream Deck";src:url\("\/overlay-assets\/alert-font-1\.otf"\) format\("opentype"\);font-display:swap;\}/);
  assert.equal(alertFontFaceCss([{ family: 'x', url: 'javascript:alert(1)', format: 'woff' }]), '');
});
