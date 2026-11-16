import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {build} from 'esbuild';
import {writeFileSync,unlinkSync} from 'node:fs';
import {DEFAULT_CHAT_OPTIONS,sampleChatLine} from '../src/overlayChat.ts';
const fixture=new URL('../ember-client-fixture.mjs',import.meta.url);
const bundle=await build({entryPoints:['src/components/OverlayChat.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
writeFileSync(fixture,bundle.outputFiles[0].text);const {OverlayChat}=await import(fixture.href);unlinkSync(fixture);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
test('expired ember message remains for its full 900ms exit and decorations are finite',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:10000});
 const events=new EventTarget();
 (globalThis as any).window={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setInterval,clearInterval,setTimeout,clearTimeout,requestAnimationFrame:(cb:()=>void)=>setTimeout(cb,0),cancelAnimationFrame:clearTimeout};
 const options={...DEFAULT_CHAT_OPTIONS,enabled:true,style:'ashen',motion:'ember',exitMotion:'ember',lifetimeSeconds:1,fadeMs:180};
 let root:any;await act(()=>{root=create(React.createElement(OverlayChat,{options}));});
 const rows=()=>root.root.findAll((n:any)=>n.type==='p'&&String(n.props.className).includes('overlay-chat-line'));
 try{
  await act(()=>{events.dispatchEvent(new CustomEvent('overlay:chat-sample',{detail:sampleChatLine({id:'ember',text:'A finite ember effect',ts:10000})}));t.mock.timers.tick(1);});
  assert.equal(rows().length,1);assert.equal(root.root.findByProps({className:'chat-embers'}).props['aria-hidden'],'true');assert.equal(root.root.findAllByType('canvas').length,1);
  await act(()=>{events.dispatchEvent(new CustomEvent('overlay:chat-motion-preview',{detail:{direction:'out'}}));});assert.equal(rows().length,1,'OBS does not receive editor-only test messages');
  await act(()=>{t.mock.timers.tick(2000);});assert.ok(rows()[0].props.className.includes('is-out'));
  await act(()=>{t.mock.timers.tick(898);});assert.equal(rows().length,1);
  await act(()=>{t.mock.timers.tick(2);});assert.equal(rows().length,1);
  await act(()=>{t.mock.timers.tick(16);});assert.equal(rows().length,0);
 }finally{await act(()=>root.unmount());delete (globalThis as any).window;}
});
