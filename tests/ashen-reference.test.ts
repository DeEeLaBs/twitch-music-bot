import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';

test('Ashen preserves the complete inventory composition when resized, including below 220px', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ashen-reference-'));
  const fixture = new URL('../ashen-reference-fixture.mjs', import.meta.url);
  const bundle = await build({entryPoints:['src/components/OverlayWidget.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
  fs.writeFileSync(fixture,bundle.outputFiles[0].text);
  const {OverlayWidget} = await import(fixture.href);
  fs.unlinkSync(fixture);
  const playback = {currentSong:{id:'reference',title:'Embers Beneath the Crown',artist:'The Hollow Orchestra',duration:242,requester:{username:'wanderer',displayName:'Wanderer',badge:'viewer'}},isPlaying:false,progressSeconds:83,durationSeconds:242};
  const cases = [[1120,493,100],[640,282,100],[320,141,100],[1120,493,50],[1120,493,150],[1120,493,200]];
  const markup = (artworkScale:number) => renderToStaticMarkup(React.createElement(OverlayWidget,{playback,fitFrame:true,disableInternalWs:true,options:{layout:'ashen',animation:'none',useMarquee:false,artworkScale}}));
  const css = fs.readFileSync('src/index.css','utf8').replace('@import "./components/AshenPlayer.css";',fs.readFileSync('src/components/AshenPlayer.css','utf8'));
  fs.writeFileSync(path.join(dir,'index.html'),`<style>${css}*{box-sizing:border-box}.scene-widget{position:relative;--player-font-scale:1;margin:10px}</style>${cases.map(([w,h,scale])=>`<div class="scene-widget" style="width:${w}px;height:${h}px">${markup(scale)}</div>`).join('')}`);
  fs.writeFileSync(path.join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron');const fs=require('node:fs');app.disableHardwareAcceleration();app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1280,height:1200});await w.loadFile(${JSON.stringify(path.join(dir,'index.html'))});const result=await w.webContents.executeJavaScript(\`[...document.querySelectorAll('article')].map(a=>{const r=s=>a.querySelector(s).getBoundingClientRect();const c=a.getBoundingClientRect(),h=r('.ashen-inventory-heading'),i=r('.ashen-category-icon'),s=r('.ashen-item-row'),t=r('.overlay-copy'),f=r('.ashen-inventory-footer'),p=r('.ashen-inventory-progress'),art=r('.overlay-artwork');return {width:c.width,height:c.height,artworkFits:art.bottom<=s.bottom+.1&&art.top>=s.top-.1&&art.right<=t.left+.1,headerVisible:i.width>0&&i.height>0,rowRatio:s.height/c.height,coverRatio:art.width/c.width,coverSquare:Math.abs(art.width-art.height)<1,headerBeforeRow:h.bottom<s.top,textBeforeFooter:t.bottom<=f.top,footerBeforeProgress:f.bottom<=p.top+.1,progressFits:p.bottom<c.bottom,progress:a.querySelector('[role=progressbar]').getAttribute('aria-valuenow')};})\`);fs.writeFileSync(${JSON.stringify(path.join(dir,'result.json'))},JSON.stringify(result));app.quit()}).catch(()=>app.exit(1));`);
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  try {
    await promisify(execFile)(path.resolve('desktop/node_modules/electron/dist/electron.exe'),[path.join(dir,'main.cjs')],{env,windowsHide:true,timeout:20000});
    const results = JSON.parse(fs.readFileSync(path.join(dir,'result.json'),'utf8'));
    for (const [index,result] of results.entries()) {
      assert.equal(result.height,cases[index][1]);
      assert.ok(result.artworkFits,JSON.stringify(result));
      assert.ok(result.headerVisible && result.coverSquare && result.headerBeforeRow && result.textBeforeFooter && result.footerBeforeProgress && result.progressFits,JSON.stringify(result));
      assert.ok(result.rowRatio >= .31 && result.rowRatio <= .34,JSON.stringify(result));
      if (index<3) assert.ok(Math.abs(result.coverRatio-.125)<.002,JSON.stringify(result));
      assert.equal(result.progress,'34');
    }
    assert.ok(results[3].coverRatio < results[0].coverRatio);
    assert.ok(results[4].coverRatio > results[0].coverRatio);
    assert.equal(results[4].coverRatio,results[5].coverRatio,'oversized covers stop at the available row height');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
