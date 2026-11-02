import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GreetingService } from '../src/server/greetingService.ts';
import {validateGreetingSettings,formatGreetingChat} from '../src/greetings.ts';
const profile = { userId:'123', login:'viewer', name:'Viewer', enabled:true, soundEnabled:false, soundUrl:'', volume:50, gifEnabled:true, gifUrl:'/overlay-assets/greeting-abc.gif', seconds:3 };

test('chat settings migrate older profiles and reject unsafe or empty messages',()=>{
 const legacy=validateGreetingSettings({outputOverlayId:'',profiles:[profile]}).profiles[0];
 assert.equal(legacy.chatEnabled,false);assert.equal(legacy.chatMessage,'');
 for(const text of ['', 'hello\r\n/ban viewer','/ban viewer','x'.repeat(251)]){
  assert.throws(()=>validateGreetingSettings({outputOverlayId:'',profiles:[{...profile,chatEnabled:true,chatMessage:text}]}));
 }
 for(const invalid of [{chatEnabled:null},{chatMessage:23},{chatEnabled:'yes'}])assert.throws(()=>validateGreetingSettings({outputOverlayId:'',profiles:[{...profile,...invalid}]}));
 const chat={...profile,chatEnabled:true,chatMessage:'Willkommen {user}, schön dich zu sehen, {name}!'};
 assert.equal(formatGreetingChat(chat),'Willkommen @viewer, schön dich zu sehen, Viewer!');
 assert.equal(formatGreetingChat({...chat,chatMessage:'{name}',name:'/ban viewer'}),'Willkommen /ban viewer');
 assert.ok(new TextEncoder().encode(formatGreetingChat({...chat,chatMessage:'😀'.repeat(100)})).length<=350);
});

test('combined chat and media are independent and no chat is sent after failed persistence',async t=>{
 const w=setup(t);w.service.configure({outputOverlayId:'overlay-one',profiles:[{...profile,chatEnabled:true,chatMessage:'Hallo {name}!'}]});
 const sent:string[]=[];
 let online=false;
 const request:typeof fetch=async()=>Response.json({data:online?[{id:'1001',user_id:'99',user_login:'channel',started_at:new Date(90000).toISOString(),type:'live'}]:[]});
 const runtime=new GreetingRuntime(()=>({twitchChannel:'channel',twitchClientId:'client',twitchBotOauthToken:'synthetic-token'}),w.service,request,text=>{sent.push(text);});
 runtime.start();t.after(()=>runtime.stop());await runtime.poll();
 botEvents.emit('greeting:message',w.message);await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.length,0);
 online=true;await runtime.poll();
 fs.renameSync(w.file,w.file+'.saved');fs.mkdirSync(w.file);
 botEvents.emit('greeting:message',w.message);await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.length,0);
 fs.rmdirSync(w.file);fs.renameSync(w.file+'.saved',w.file);
 botEvents.emit('greeting:message',w.message);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(sent,['Hallo Viewer!']);assert.equal(w.service.snapshot().queued,1);
});

test('chat-only greetings send once per stream without OBS and retain deduplication after restart',async t=>{
 const w=setup(t);w.service.configure({outputOverlayId:'',profiles:[{...profile,gifEnabled:false,chatEnabled:true,chatMessage:'Hallo {user}!'}]});
 const sent:string[]=[];
 const config={twitchChannel:'channel',twitchClientId:'client',twitchBotOauthToken:'synthetic-token'};
 const request:typeof fetch=async()=>Response.json({data:[{id:'1001',user_id:'99',user_login:'channel',started_at:new Date(90000).toISOString(),type:'live'}]});
 const runtime=new GreetingRuntime(()=>config,w.service,request,text=>{sent.push(text);});
 runtime.start();t.after(()=>runtime.stop());await runtime.poll();
 botEvents.emit('greeting:message',w.message);botEvents.emit('greeting:message',{...w.message,id:'again'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(sent,['Hallo @viewer!']);assert.equal(w.service.snapshot().queued,0);
 runtime.stop();
 const restarted=new GreetingService(w.file,w.now);const second=new GreetingRuntime(()=>config,restarted,request,text=>{sent.push(text);});
 second.start();t.after(()=>second.stop());await second.poll();botEvents.emit('greeting:message',w.message);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sent.length,1);
});
function setup(t: {after:(fn:()=>void)=>void}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'greetings-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let now=100000; const file=path.join(dir,'greetings.json'); const service=new GreetingService(file,()=>now);
 service.configure({outputOverlayId:'overlay-one',profiles:[profile]});
 const live={id:'1001',channelId:'99',startedAt:90000}; service.setLive(live);
 const message={id:'message-1',userId:'123',channelId:'99',at:now};
 return {service,file,live,message,now:()=>now,advance:(ms:number)=>{now+=ms;}};
}
test('one greeting per stable user and real stream survives restart; offline/replayed messages do not consume it', t=>{
 const w=setup(t); w.service.setLive(null,'offline'); assert.equal(w.service.accept(w.message),false);
 w.service.setLive(w.live); assert.equal(w.service.accept({...w.message,replay:true}),false);
 assert.equal(w.service.accept({...w.message,at:1000}),false);
 assert.equal(w.service.accept(w.message),true); assert.equal(w.service.accept({...w.message,id:'second'}),false);
 const restarted=new GreetingService(w.file,w.now); restarted.setLive(w.live);
 assert.equal(restarted.accept({...w.message,id:'third'}),false);
 restarted.setLive({...w.live,id:'1002'}); assert.equal(restarted.accept(w.message),true);
});
test('only one browser owns output; queued events run sequentially and expire without replay on owner loss',t=>{
 const w=setup(t); w.service.accept(w.message);
 const first=w.service.claim('overlay-one','client-one'); assert.ok(first.event);
 assert.equal(w.service.claim('overlay-one','client-two').event,null);
 assert.equal(w.service.claim('other-overlay','client-other').event,null);
 w.advance(5000); assert.equal(w.service.claim('overlay-one','client-two').event,null);
 assert.equal(w.service.accept(w.message),false);
});
test('invalid settings and failed persistence preserve state and prevent unrecorded greetings',t=>{
 const w=setup(t); const before=w.service.snapshot().settings;
 assert.throws(()=>w.service.configure({outputOverlayId:'overlay-one',profiles:[{...profile,gifUrl:'https://evil.test/file.gif'}]}));
 assert.deepEqual(w.service.snapshot().settings,before);
 fs.renameSync(w.file,w.file+'.saved'); fs.mkdirSync(w.file);
 assert.throws(()=>w.service.accept(w.message));
 assert.equal(w.service.claim('overlay-one','client-one').event,null);
});

import { GreetingOutputGate } from '../src/greetingDelivery.ts';
import { parseGreetingMedia } from '../src/server/greetingMedia.ts';
test('interrupted output never restarts the same sound and delayed replies cannot extend a lease',()=>{
 const gate=new GreetingOutputGate();const event={id:'event',profile,queuedAt:1000,endsAt:10000};
 const body={event,serverNow:1000,leaseUntil:5000};
 assert.equal(gate.receive(body,1000,3500)?.until,5000);
 gate.interrupt();assert.equal(gate.receive({...body,serverNow:4000,leaseUntil:8000},4000,4100),null);
 assert.equal(gate.doneId,'event');
 const slow=new GreetingOutputGate();assert.equal(slow.receive(body,1000,6000),null);
});
test('queued sound-only and GIF-only greetings stay separate, finish in order and expire',t=>{
 const w=setup(t);
 w.service.configure({outputOverlayId:'overlay-one',profiles:[{...profile,gifEnabled:false,soundEnabled:true,soundUrl:'/overlay-assets/greeting-abc.wav'},{...profile,userId:'124'}]});
 w.service.accept(w.message);w.service.accept({...w.message,userId:'124',id:'second'});
 const first=w.service.claim('overlay-one','one').event!;
 assert.equal(first.profile.gifEnabled,false);assert.equal(first.profile.soundEnabled,true);
 const second=w.service.claim('overlay-one','one',first.id).event!;
 assert.equal(second.profile.userId,'124');assert.equal(second.profile.soundEnabled,false);
 w.advance(61000);assert.equal(w.service.claim('overlay-one','two').event,null);
});
test('media signatures, formats and dimensions are validated',()=>{
 const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
 assert.equal(parseGreetingMedia(gif,'gif').extension,'gif');
 assert.throws(()=>parseGreetingMedia('data:image/gif;base64,PGh0bWw+','gif'));
 assert.throws(()=>parseGreetingMedia(gif,'sound'));
 assert.throws(()=>parseGreetingMedia('data:audio/wav;base64,PGh0bWw+','sound'));
 const huge=Buffer.from(gif.split(',')[1],'base64');huge.writeUInt16LE(5000,6);
 assert.throws(()=>parseGreetingMedia(`data:image/gif;base64,${huge.toString('base64')}`,'gif'));
});

import { playGreetingSound, type GreetingAudio } from '../src/greetingAudio.ts';
import { GreetingRuntime } from '../src/server/greetingRuntime.ts';
import { botEvents } from '../src/server/eventBus.ts';
test('a late audio rejection after cleanup cannot finish a later greeting',async()=>{
 let rejectPlay:(error:Error)=>void=()=>{};let errors=0,pauses=0;
 const audio:GreetingAudio={src:'sound',volume:0,play:()=>new Promise<void>((_,reject)=>{rejectPlay=reject;}),pause:()=>{pauses++;},addEventListener:()=>{},removeEventListener:()=>{}};
 const stop=playGreetingSound('sound',50,()=>{errors++;},()=>audio);
 stop();rejectPlay(new Error('old audio aborted'));await Promise.resolve();
 assert.equal(errors,0);assert.equal(pauses,1);assert.equal(audio.src,'');
});
test('runtime confirms Twitch stream identity and accepts only fresh live messages for configured IDs',async t=>{
 const w=setup(t);let online=true;
 const runtime=new GreetingRuntime(()=>({twitchChannel:'channel',twitchClientId:'client',twitchBotOauthToken:'synthetic-token'}),w.service,async()=>Response.json({data:online?[{id:'1001',user_id:'99',user_login:'channel',started_at:new Date(90000).toISOString(),type:'live'}]:[]}));
 runtime.start();t.after(()=>runtime.stop());await runtime.poll();
 botEvents.emit('greeting:message',w.message);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(w.service.snapshot().queued,1);
 botEvents.emit('greeting:message',{...w.message,id:'duplicate'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(w.service.snapshot().queued,1);
 online=false;await runtime.poll();assert.equal(w.service.snapshot().status,'offline');
});

test('an unused greeting feature performs no extra Twitch calls',async t=>{
 const w=setup(t);w.service.configure({outputOverlayId:'',profiles:[]});let calls=0;
 const runtime=new GreetingRuntime(()=>({twitchChannel:'channel',twitchClientId:'client',twitchBotOauthToken:'synthetic-token'}),w.service,async()=>{calls++;return Response.json({data:[]});});
 runtime.start();t.after(()=>runtime.stop());await runtime.poll();assert.equal(calls,0);
});
test('disabling both media stops pending and active greetings; source changes respect the old lease',t=>{
 const w=setup(t);w.service.accept(w.message);assert.ok(w.service.claim('overlay-one','client').event);
 w.service.configure({outputOverlayId:'overlay-two',profiles:[profile]});
 assert.equal(w.service.claim('overlay-two','another').event,null);
 w.advance(5000);assert.equal(w.service.claim('overlay-two','another').event,null);
 w.service.setLive({...w.live,id:'1002'});w.service.accept(w.message);
 w.service.configure({outputOverlayId:'overlay-two',profiles:[{...profile,gifEnabled:false,soundEnabled:false}]});
 assert.equal(w.service.claim('overlay-two','another').event,null);
});
