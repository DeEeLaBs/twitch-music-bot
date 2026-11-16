import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WheelService} from '../src/server/wheelService.ts';
import {validateWheelFields, wheelAngle,wheelProgress} from '../src/wheel.ts';
import {placeWidget,sceneFromLegacy,normalizeScene} from '../src/scene.ts';
const fields=[{id:'a',text:'Eins',color:'#ff0000'},{id:'b',text:'Zwei',color:'#00ff00'}];
function setup(pick=0){let now=1000;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wheel-'));const file=path.join(dir,'wheel.json');const service=new WheelService(file,()=>now,()=>pick);return {service,file,time:(n:number)=>{now=n;},clean:()=>fs.rmSync(dir,{recursive:true,force:true})};}
test('validates fields and rejects unsafe or ambiguous inputs',()=>{
 assert.deepEqual(validateWheelFields(fields),fields);
 for(const raw of [[],[fields[0]],fields.map(f=>({...f,id:'same'})),[{...fields[0],text:''},fields[1]],[{...fields[0],color:'url(x)'},fields[1]]])assert.throws(()=>validateWheelFields(raw));
});
test('every winner has a matching pointer angle',()=>{for(let n=2;n<=30;n++)for(let i=0;i<n;i++)assert.ok(Math.abs(((wheelAngle(i,n)+((i+.5)*360/n))%360))<.00001);});
test('one ready operation draws once, snapshots are independent and timed',()=>{
 const s=setup(1);try{s.service.configure(fields);const ready=s.service.show();const spin=s.service.spin(ready.operationId);assert.equal(spin.winner,1);assert.equal(s.service.spin(ready.operationId).operationId,spin.operationId);assert.throws(()=>s.service.configure(fields));
 const other=s.service.snapshot();other.fields[0].text='changed';assert.equal(s.service.snapshot().fields[0].text,'Eins');
 s.time(7000);assert.equal(s.service.snapshot().phase,'result');s.time(12000);assert.equal(s.service.snapshot().phase,'hidden');assert.throws(()=>s.service.spin(ready.operationId));
 const restarted=new WheelService(s.file);assert.equal(restarted.snapshot().phase,'hidden');assert.deepEqual(restarted.snapshot().fields,fields);
 }finally{s.clean();}
});
test('all controlled outcomes reachable, stale requests cannot spin a new operation',()=>{for(let i=0;i<2;i++){const s=setup(i);try{s.service.configure(fields);const a=s.service.show();assert.equal(s.service.spin(a.operationId).winner,i);s.time(12000);const b=s.service.show();assert.notEqual(a.operationId,b.operationId);assert.throws(()=>s.service.spin(a.operationId));}finally{s.clean();}}});
test('failed writes preserve saved settings; damaged stores are not overwritten',()=>{const s=setup();try{s.service.configure(fields);fs.unlinkSync(s.file);fs.mkdirSync(s.file);assert.throws(()=>s.service.configure([...fields].reverse()));assert.deepEqual(s.service.snapshot().fields,fields);fs.rmSync(s.file,{recursive:true});fs.writeFileSync(s.file,'broken');fs.rmSync(s.file+'.backup',{force:true});const broken=new WheelService(s.file);assert.throws(()=>broken.configure(fields));assert.equal(fs.readFileSync(s.file,'utf8'),'broken');}finally{s.clean();}});
test('late subscribers resume at shared progress; hiding and backup recovery are safe',()=>{const s=setup();try{
 s.service.configure(fields);s.service.configure([...fields].reverse());const ready=s.service.show();assert.equal(s.service.show().operationId,ready.operationId);assert.equal(s.service.hide().phase,'hidden');assert.throws(()=>s.service.spin(ready.operationId));
 const fresh=s.service.show();s.service.spin(fresh.operationId);assert.throws(()=>s.service.hide());s.time(4000);const late=s.service.snapshot();assert.equal(wheelProgress(late,late.serverNow),.5);assert.equal(late.operationId,fresh.operationId);s.time(7000);assert.equal(s.service.hide().phase,'hidden');
 fs.writeFileSync(s.file,'damaged');const restored=new WheelService(s.file);assert.deepEqual(restored.snapshot().fields,fields);assert.equal(restored.snapshot().storageError,'');
 }finally{s.clean();}});
test('wheel survives scene storage without removing existing widgets',()=>{const original=sceneFromLegacy({enabled:true,x:0,y:0,width:30,height:50});const scene=placeWidget(original,'wheel');const restored=normalizeScene(JSON.parse(JSON.stringify(scene)));assert.ok(restored?.widgets.some(w=>w.type==='wheel'));for(const w of original.widgets)assert.ok(restored?.widgets.some(item=>item.id===w.id));});
