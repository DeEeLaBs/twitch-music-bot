import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFileSync, unlinkSync } from 'node:fs';
import { DEFAULT_OVERLAY_OPTIONS, createOverlaySearch, parseOverlayOptions } from '../src/overlayOptions.ts';
const bundle = new URL('../overlay-center-fixture.mjs', import.meta.url);
const output = await build({ entryPoints: ['src/components/OverlayStudio.tsx'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
writeFileSync(bundle, output.outputFiles[0].text);
const { OverlayStudio } = await import(bundle.href);
unlinkSync(bundle);
test('designer exposes the all-text centering switch and restores the saved alignment', () => {
  for (const textAlign of ['left', 'center'] as const) {
    const options = parseOverlayOptions(new URLSearchParams(createOverlaySearch({ ...DEFAULT_OVERLAY_OPTIONS, textAlign })));
    (globalThis as any).window = { localStorage: { getItem: (key: string) => key === 'overlay-options-v4' ? JSON.stringify(options) : null }, location: { origin: 'http://localhost:3000', search: '' } };
    const html = renderToStaticMarkup(React.createElement(OverlayStudio, { language: 'de', playback: { isPlaying: false } }));
    assert.match(html, /Alle Texte zentrieren/);
    const input = html.match(/<input[^>]*aria-label="Alle Texte zentrieren"[^>]*>/)?.[0];
    assert.ok(input);
    assert.equal(input.includes('checked=""'), textAlign === 'center');
    assert.match(html, new RegExp(`overlay-align-${textAlign}`));
  }
});
