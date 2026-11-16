import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {EventEmitter} from 'node:events';
import {writeFileSync,unlinkSync} from 'node:fs';
import {build} from 'esbuild';
const file=new URL('../restart-client-fixture.mjs',import.meta.url);
const bundle=await build({entryPoints:['src/components/LocalRestartButton.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
writeFileSync(file,bundle.outputFiles[0].text);const {LocalRestartButton}=await import(file.href);unlinkSync(file);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
function fixture(){
 const events=new EventTarget(),ipc=new EventEmitter();let restarts=0;
 (ipc as any).invoke=async(channel:string)=>channel==='desktop:can-restart-local'?true:++restarts;
 (globalThis as any).window={require:()=>({ipcRenderer:ipc}),dispatchEvent:events.dispatchEvent.bind(events)};
 return {events,ipc,restarts:()=>restarts};
}
test('keyboard restart waits for saves, coalesces repeated requests and unregisters its listener',async()=>{
 const f=fixture();let finish!:()=>void;const save=new Promise<void>(r=>finish=r);
 f.events.addEventListener('overlay:before-leave',(event:any)=>event.detail.waitUntil(save));
 let root:any;await act(async()=>{root=create(React.createElement(LocalRestartButton));});
 try{
  await act(async()=>{f.ipc.emit('desktop:request-restart-local');f.ipc.emit('desktop:request-restart-local');});
  assert.equal(f.restarts(),0);
  await act(async()=>{finish();await save;});assert.equal(f.restarts(),1);
 }finally{await act(()=>root.unmount());delete (globalThis as any).window;}
 assert.equal(f.ipc.listenerCount('desktop:request-restart-local'),0);
});
test('cancelled or failed saves keep the app open and permit a later restart',async()=>{
 const f=fixture();const cancel=(e:Event)=>e.preventDefault();f.events.addEventListener('overlay:before-leave',cancel);
 let root:any;await act(async()=>{root=create(React.createElement(LocalRestartButton));});
 try{
  await act(async()=>{f.ipc.emit('desktop:request-restart-local');});assert.equal(f.restarts(),0);
  f.events.removeEventListener('overlay:before-leave',cancel);
  const fail=(e:any)=>e.detail.waitUntil(Promise.reject(Error('Speichern fehlgeschlagen')));
  f.events.addEventListener('overlay:before-leave',fail);
  await act(async()=>{f.ipc.emit('desktop:request-restart-local');});assert.equal(f.restarts(),0);
  assert.equal(root.root.findByProps({role:'alert'}).children[0],'Speichern fehlgeschlagen');
  f.events.removeEventListener('overlay:before-leave',fail);
  await act(async()=>{f.ipc.emit('desktop:request-restart-local');});assert.equal(f.restarts(),1);
 }finally{await act(()=>root.unmount());delete (globalThis as any).window;}
});
