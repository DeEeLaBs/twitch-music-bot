import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeOverlayOptions,parseOverlayOptions} from '../src/overlayOptions.ts';
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {build} from 'esbuild';
import {writeFileSync,unlinkSync} from 'node:fs';
const fixture=new URL('../ashen-test-fixture.mjs',import.meta.url);
const bundle=await build({entryPoints:['src/components/OverlayWidget.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
writeFileSync(fixture,bundle.outputFiles[0].text);
const {OverlayWidget}=await import(fixture.href);
unlinkSync(fixture);
test('Ashen survives storage normalization and keeps other overlay themes independent',()=>{
 assert.equal(parseOverlayOptions(new URLSearchParams('theme=ashen')).theme,'ashen');
 assert.equal(parseOverlayOptions(new URLSearchParams('layout=ashen')).layout,'ashen');
 const first=mergeOverlayOptions({theme:'ashen'});
 const second=mergeOverlayOptions({theme:'ocean'});
 assert.equal(mergeOverlayOptions(JSON.parse(JSON.stringify(first))).theme,'ashen');
 assert.equal(second.theme,'ocean');
});
test('Ashen transitions only on track identity changes and renders missing covers safely',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const events=new EventTarget();
 (globalThis as any).window={location:{search:''},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setInterval,clearInterval,setTimeout,clearTimeout};
 const song={id:'first',title:'A long title '.repeat(10),artist:'Artist',duration:100,albumArtUrl:'',requester:{username:'viewer',displayName:'Viewer',badge:'viewer'}};
 let root:ReactTestRenderer;
 const render=(id:string,progress:number,showPlaybackStatus=true,showArtwork=true)=>React.createElement(OverlayWidget,{disableInternalWs:true,options:{layout:'ashen',theme:'glass',showPlaybackStatus,showArtwork},playback:{currentSong:{...song,id},isPlaying:false,progressSeconds:progress,durationSeconds:100}});
 await act(()=>{root=create(render('first',10));});
 try{
  const article=root!.root.findByType('article');
  const row=root!.root.findByProps({className:'ashen-item-row'});
  assert.equal(row.findAll(node=>node.props.className==='overlay-meta').length,0);
  assert.equal(root!.root.findAll(node=>node.props.className==='ashen-inventory-heading').length,1);

  assert.ok(root!.root.findAllByType('img')[0].props.src.startsWith('data:image/svg+xml'));
  await act(()=>root!.update(render('first',20)));
  assert.equal(root!.root.findByType('article'),article);
  await act(()=>root!.update(render('second',0)));
  assert.notEqual(root!.root.findByType('article'),article);
  assert.equal(root!.root.findAll(node=>node.props.className==='overlay-kicker').length,1);
  await act(()=>root!.update(render('second',0,false)));
  assert.equal(root!.root.findAll(node=>node.props.className==='overlay-kicker').length,0);
  assert.equal(root!.root.findAll(node=>node.props.className==='ashen-inventory-heading').length,0);
  await act(()=>root!.update(render('second',0,false,false)));
  const withoutCover=root!.root.findByProps({className:'ashen-item-row'});
  assert.equal(withoutCover.findAll(node=>String(node.props.className||'').split(' ').includes('overlay-artwork')).length,0);
  assert.ok(root!.root.findByType('article').props.className.includes('overlay-without-artwork'));

 }finally{await act(()=>root!.unmount());delete (globalThis as any).window;}
});
