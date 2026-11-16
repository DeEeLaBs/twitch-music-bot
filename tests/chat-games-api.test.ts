import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApiRouter} from '../src/server/apiRouter.ts';
import {GameService} from '../src/server/gameService.ts';
import {botService} from '../src/server/botService.ts';
import {errorPayload} from '../src/server/errors.ts';
test('game HTTP actions require session; OBS sources receive identical redacted state',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'games-api-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=100000;const games=new GameService(path.join(dir,'games.json'),()=>now);
 const token=botService.overlayTokenMatches,library=Object.getOwnPropertyDescriptor(botService,'overlayLibrary');botService.overlayTokenMatches=value=>value==='test-token';
 Object.defineProperty(botService,'overlayLibrary',{configurable:true,value:{get:(id:string)=>{if(!['one','two','hidden'].includes(id))throw Error();return {options:{scene:{widgets:[{type:'games',visible:id!=='hidden'}]}}};}}});
 t.after(()=>{botService.overlayTokenMatches=token;if(library)Object.defineProperty(botService,'overlayLibrary',library);else delete (botService as any).overlayLibrary;});
 const app=express();app.use(express.json());app.use('/api',createApiRouter({sessionToken:'test-session',appVersion:'test',overlayAssetsDir:dir,games}));app.use((error:any,_req:any,res:any,_next:any)=>{const p=errorPayload(error);res.status(p.status).json(p.body);});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/games`;
 const post=(action:string,body={},session='test-session')=>fetch(`${base}/${action}`,{method:'POST',headers:{'Content-Type':'application/json','X-Bot-Session':session},body:JSON.stringify(body)});
 assert.equal((await post('read',{},'wrong')).status,403);assert.equal((await post('start',{kind:'word',role:'broadcaster'},'')).status,403);
 for(const query of ['token=wrong&overlayId=one','token=test-token&overlayId=hidden','token=test-token&overlayId=missing'])assert.equal((await fetch(base+'/output?'+query)).status,404);
 const state=await (await post('read')).json();const starts=await Promise.all(Array.from({length:3},()=>post('start',{kind:'word',startToken:state.startToken}).then(r=>r.json())));assert.ok(starts.every(s=>s.round.id===starts[0].round.id));
 const [a,b]=await Promise.all(['one','two'].map(id=>fetch(base+`/output?token=test-token&overlayId=${id}`).then(r=>r.json())));assert.equal(a.round.id,b.round.id);assert.equal(a.round.deadline,b.round.deadline);
 for(const output of [a,b]){const serialized=JSON.stringify(output);assert.ok(!serialized.includes('Regenbogen'));assert.equal(output.settings,undefined);assert.equal(output.startToken,undefined);assert.equal(output.leaders,undefined);}
 assert.equal((await post('control',{action:'finish',roundId:'stale'})).status,400);
 games.answer({id:'1',name:'Viewer'},'Regenbogen');await post('control',{action:'finish',roundId:a.round.id});assert.equal(games.points('1'),10);
 now+=9000;games.tick();const settings=games.snapshot().settings;settings.adventures[0].scenes.push({id:'middle',text:'Noch eine Wahl',choices:[{text:'Weiter',next:'door'}]});settings.adventures[0].scenes[0].choices[0].next='middle';games.configure(settings);
 const adventure=await (await post('start',{kind:'adventure',startToken:games.snapshot().startToken})).json();games.answer({id:'1',name:'Viewer'},'1');
 const control={action:'finish',roundId:adventure.round.id,step:1};assert.equal((await post('control',control)).status,200);assert.equal(games.output().round?.steps,2);
 assert.equal((await post('control',control)).status,400);assert.equal(games.output().round?.phase,'running');

});
