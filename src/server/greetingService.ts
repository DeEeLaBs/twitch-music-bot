import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJson } from './atomicStore.ts';
import { validateGreetingSettings, hasGreetingOutput, type GreetingSettings, type GreetingLive, type GreetingMessage, type GreetingEvent } from '../greetings.ts';
interface Store { version:1; settings:GreetingSettings; seen:Record<string,string[]> }
export class GreetingService {
 private state:Store={version:1,settings:{outputOverlayId:'',profiles:[]},seen:{}};
 private readonly file:string; private readonly now:()=>number;
 private live:GreetingLive|null=null; private checkedAt=0; private liveStatus='unknown'; private storageError='';private persistenceError='';
 private queue:GreetingEvent[]=[]; private current:GreetingEvent|null=null;
 private owner=''; private leaseUntil=0; private blockedUntil=0;
 constructor(file=path.join(process.cwd(),'data/greetings.json'),now=Date.now) {
  this.file=file;this.now=now;
  let loaded=false;
  for(const candidate of [file,file+'.backup']) {
   if(!fs.existsSync(candidate))continue;
   try {
    const raw=JSON.parse(fs.readFileSync(candidate,'utf8')) as Store;
    if(raw.version!==1 || !raw.seen || typeof raw.seen!=='object' || Array.isArray(raw.seen) || !Object.entries(raw.seen).every(([key,ids])=>/^[\d:]+$/.test(key)&&Array.isArray(ids)&&ids.length<=10000&&ids.every(id=>typeof id==='string'&&/^\d{1,32}$/.test(id))))throw new Error('Invalid store');
    raw.settings=validateGreetingSettings(raw.settings);
    if(candidate!==file)writeJson(file,raw,{strictAtomic:true,preserveBackup:true});
    this.state=raw;loaded=true;break;
   }catch{/* Try the backup without overwriting unreadable data. */}
  }
  if(!loaded&&(fs.existsSync(file)||fs.existsSync(file+'.backup')))this.storageError='Begrüßungsspeicher und Backup unlesbar. Originaldateien wiederherstellen.';
 }
 private commit(next:Store) {
  if(this.storageError)throw new Error(this.storageError);
  try{writeJson(this.file,next,{strictAtomic:true});this.state=next;this.persistenceError='';}
  catch{this.persistenceError='Begrüßungen konnten nicht gespeichert werden. Der bisherige Stand bleibt erhalten.';throw new Error(this.persistenceError);}
 }
 snapshot() {return {settings:structuredClone(this.state.settings),status:this.now()-this.checkedAt>20000?'unknown':this.liveStatus,streamId:this.live?.id||'',queued:this.queue.filter(e=>this.now()-e.queuedAt<60000).length,outputConnected:!!this.owner&&this.leaseUntil>this.now(),storageError:this.storageError||this.persistenceError};}
 configure(raw:unknown) {
  const settings=validateGreetingSettings(raw);const changed=settings.outputOverlayId!==this.state.settings.outputOverlayId;
  this.commit({...this.state,settings});
  this.queue=this.queue.filter(e=>settings.profiles.some(p=>p.userId===e.profile.userId&&p.enabled&&(p.soundEnabled||p.gifEnabled)));
  if(changed || (this.current&&!settings.profiles.some(p=>p.userId===this.current!.profile.userId&&p.enabled&&(p.soundEnabled||p.gifEnabled))))this.invalidate();
  return this.snapshot();
 }
 private invalidate() {this.blockedUntil=Math.max(this.blockedUntil,this.leaseUntil);this.current=null;this.owner='';this.leaseUntil=0;}
 setLive(live:GreetingLive|null,status=live?'live':'unknown') {
  if(live && (!/^\d+$/.test(live.id)||!/^\d+$/.test(live.channelId)||!Number.isFinite(live.startedAt)))throw new Error('Ungültige Twitch-Sitzung.');
  if(!live || this.live?.id!==live.id || this.live?.channelId!==live.channelId) {this.queue=[];this.invalidate();}
  this.live=live;this.checkedAt=this.now();this.liveStatus=status;
 }
 accept(message:GreetingMessage) {
  const now=this.now(),live=this.live;
  if(!live||this.liveStatus!=='live'||now-this.checkedAt>20000||message.replay||!message.id||!Number.isFinite(message.at)||message.at<now-15000||message.at>now+5000||message.at<live.startedAt||message.channelId!==live.channelId)return false;
  const profile=this.state.settings.profiles.find(p=>p.userId===message.userId&&p.enabled&&hasGreetingOutput(p));
  const key=`${live.channelId}:${live.id}`;
  if(!profile||this.state.seen[key]?.includes(message.userId)||(this.state.seen[key]?.length||0)>=10000)return false;
  const seen={...this.state.seen,[key]:[...(this.state.seen[key]||[]),message.userId]};
  const keep=Object.fromEntries(Object.entries(seen).slice(-8));
  this.commit({...this.state,seen:keep});
  this.queue=this.queue.filter(e=>now-e.queuedAt<60000);
  if((profile.soundEnabled||profile.gifEnabled)&&this.queue.length<20)this.queue.push({id:crypto.randomUUID(),profile:structuredClone(profile),queuedAt:now,endsAt:0});
  return true;
 }
 claim(overlayId:string,clientId:string,doneId?:string) {
  const now=this.now();
  const response=(event:GreetingEvent|null)=>({event:event?structuredClone(event):null,serverNow:now,leaseUntil:event?this.leaseUntil:0});
  if(overlayId!==this.state.settings.outputOverlayId||!clientId||clientId.length>80)return response(null);
  if(this.liveStatus!=='live'||now-this.checkedAt>20000) {this.queue=[];this.invalidate();return response(null);}
  if(now<this.blockedUntil)return response(null);
  if(this.owner && this.leaseUntil<=now) {this.current=null;this.owner='';}
  if(this.owner&&this.owner!==clientId)return response(null);
  this.owner=clientId;this.leaseUntil=now+4000;
  if(doneId&&this.current?.id===doneId)this.current=null;
  if(this.current&&this.current.endsAt<=now)this.current=null;
  this.queue=this.queue.filter(e=>now-e.queuedAt<60000);
  if(!this.current&&this.queue.length) {this.current=this.queue.shift()!;this.current.endsAt=now+this.current.profile.seconds*1000;}
  return response(this.current);
 }
}
let service:GreetingService|undefined;
export function getGreetingService(){return service??=new GreetingService();}
