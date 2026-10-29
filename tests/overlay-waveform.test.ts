import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('stacked waveform keeps total time within the card at narrow widths', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-waveform-test-'));
  const css = fs.readFileSync('src/index.css', 'utf8');
  const cards = [320, 280].map(width => `<article class="overlay-widget overlay-stacked" style="width:${width}px;box-sizing:border-box"><div class="overlay-waveform-progress"><span class="waveform-time">1:34</span><div class="waveform-track"><div class="waveform-ticks">${'<span class="waveform-tick"></span>'.repeat(32)}</div></div><span class="waveform-time waveform-time-end">120:00</span></div></article>`).join('');
  fs.writeFileSync(path.join(dir, 'index.html'), `<style>${css}</style>${cards}`);
  fs.writeFileSync(path.join(dir, 'main.cjs'), `const {app,BrowserWindow}=require('electron'); const fs=require('node:fs'); app.whenReady().then(async()=>{const win=new BrowserWindow({show:false}); await win.loadFile(${JSON.stringify(path.join(dir,'index.html'))}); const result=await win.webContents.executeJavaScript(\`Array.from(document.querySelectorAll('article')).map(card=>{const c=card.getBoundingClientRect(),t=card.querySelector('.waveform-time-end').getBoundingClientRect();return {cardRight:c.right,timeRight:t.right,timeLeft:t.left,cardLeft:c.left};})\`); fs.writeFileSync(${JSON.stringify(path.join(dir,'result.json'))},JSON.stringify(result)); app.quit();}).catch(()=>app.exit(1));`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    await promisify(execFile)(path.resolve('desktop/node_modules/electron/dist/electron.exe'), [path.join(dir, 'main.cjs')], { env, windowsHide: true, timeout: 20000 });
    const results = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
    for (const result of results) assert.ok(result.timeRight <= result.cardRight - 15, JSON.stringify(result));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { OVERLAY_LAYOUTS, OVERLAY_THEMES, DEFAULT_OVERLAY_OPTIONS } from '../src/overlayOptions.ts';

test('waveform fits every layout without overlapping metadata', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-all-layouts-'));
  const bundle = new URL('../overlay-layout-fixture.mjs', import.meta.url);
  const result = await build({ entryPoints: ['src/components/OverlayWidget.tsx'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
  fs.writeFileSync(bundle, result.outputFiles[0].text);
  const { OverlayWidget } = await import(bundle.href);
  fs.unlinkSync(bundle);
  const playback = { currentSong: { id: 'test', title: 'Waveform Design Check', artist: 'Artist', duration: 7200, requester: { displayName: 'Viewer', badge: 'vip' } }, isPlaying: false, progressSeconds: 95, durationSeconds: 7200, source: 'queue' };
  const cards = OVERLAY_LAYOUTS.flatMap((layout, index) => [false, true].map(freePositioning => `<section><h3>${layout}${freePositioning ? ' / free' : ''}</h3>${renderToStaticMarkup(React.createElement(OverlayWidget, { playback, options: { ...DEFAULT_OVERLAY_OPTIONS, layout, theme: OVERLAY_THEMES[index], freePositioning, progressStyle: 'waveform', showSource: true, animation: 'none', useMarquee: false }, disableInternalWs: true }))}</section>`)).join('');
  fs.writeFileSync(path.join(dir, 'index.html'), `<style>*{box-sizing:border-box}body{background:#222;color:white;font-family:Arial;margin:20px}section{margin:20px;display:inline-block;vertical-align:top}${fs.readFileSync('src/index.css','utf8')}</style>${cards}`);
  fs.writeFileSync(path.join(dir, 'main.cjs'), `const {app,BrowserWindow}=require('electron');const fs=require('node:fs');app.disableHardwareAcceleration();app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1600,height:1800,webPreferences:{offscreen:true}});await win.loadFile(${JSON.stringify(path.join(dir,'index.html'))});const result=await win.webContents.executeJavaScript(\`Array.from(document.querySelectorAll('article')).map(card=>{const c=card.getBoundingClientRect(),w=card.querySelector('.overlay-waveform-progress').getBoundingClientRect(),m=card.querySelector('.overlay-meta').getBoundingClientRect(),t=card.querySelector('.waveform-time-end').getBoundingClientRect();return {layout:card.className,cardRight:c.right,timeRight:t.right,metaBottom:m.bottom,waveTop:w.top,waveBottom:w.bottom,cardBottom:c.bottom};})\`);fs.writeFileSync(${JSON.stringify(path.join(dir,'result.json'))},JSON.stringify(result));await win.webContents.executeJavaScript("document.body.style.zoom='0.4'");try{fs.writeFileSync(${JSON.stringify(path.resolve('docs/reports/waveform-layouts.png'))},(await win.webContents.capturePage()).toPNG());}catch{}app.quit();}).catch(()=>app.exit(1));`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    await promisify(execFile)(path.resolve('desktop/node_modules/electron/dist/electron.exe'), [path.join(dir,'main.cjs')], {env,windowsHide:true,timeout:20000});
    const results = JSON.parse(fs.readFileSync(path.join(dir,'result.json'),'utf8'));
    const failures = results.filter((r:any)=>r.timeRight>r.cardRight-8 || r.metaBottom>r.waveTop-2 || r.waveBottom>r.cardBottom-5);
    assert.deepEqual(failures, []);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
