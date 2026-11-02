import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type WebSocket from 'ws';
import { BotService } from '../src/server/botService.ts';
import { OverlayLibrary } from '../src/server/overlayLibrary.ts';

test('live overlay updates authenticate, stay scoped, survive failed delivery and clear deleted sources',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'overlay-live-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const library=new OverlayLibrary(path.join(dir,'overlays.json'),path.join(dir,'legacy.json'));
 const first=library.get(library.legacyId),second=library.create('Second');
 const service=Object.create(BotService.prototype) as BotService;
 Object.assign(service,{overlayClients:new Map(),overlayTokenMatches:(token:string)=>token==='test-token'});
 Object.defineProperty(service,'overlayLibrary',{get:()=>library});
 const messages=(output:unknown[])=>({readyState:1,send:(payload:string)=>output.push(JSON.parse(payload))}) as unknown as WebSocket;
 const one:any[]=[],two:any[]=[],denied:any[]=[];const a=messages(one),b=messages(two),bad=messages(denied);
 service.subscribeOverlay(a,'test-token',first.id);service.subscribeOverlay(b,'test-token',second.id);
 service.subscribeOverlay(bad,'wrong',first.id);assert.equal(denied.length,0);
 assert.throws(()=>service.subscribeOverlay(bad,'test-token','missing'));assert.equal(denied.length,0);
 library.update(first.id,{...first.options,accent:'#123456'});service.publishOverlay(first.id);
 assert.equal(one.at(-1).data.options.accent,'#123456');assert.equal(two.length,1);
 const broken=messages([]);service.subscribeOverlay(broken,'test-token',first.id);broken.send=()=>{throw new Error('closed');};
 assert.doesNotThrow(()=>service.publishOverlay(first.id));
 library.remove(first.id);service.publishOverlay(first.id);assert.equal(one.at(-1).data.options,null);assert.equal(two.length,1);
 service.subscribeOverlay(b,'wrong',second.id);service.publishOverlay(second.id);assert.equal(two.length,1);
});

