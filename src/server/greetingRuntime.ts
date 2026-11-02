import type { BotConfig } from '../types.ts';
import {hasGreetingOutput,formatGreetingChat,type GreetingLive,type GreetingMessage} from '../greetings.ts';
import { getGreetingService, type GreetingService } from './greetingService.ts';
import { botEvents } from './eventBus.ts';

type Auth = Pick<BotConfig,'twitchChannel'|'twitchClientId'|'twitchBotOauthToken'>;
function headers(config:Auth) {
 if(!config.twitchBotOauthToken||!config.twitchClientId||!config.twitchChannel)throw new Error('Twitch verbinden, um Live-Status und Personen aufzulösen.');
 return {Authorization:`Bearer ${config.twitchBotOauthToken.replace(/^oauth:/,'')}`,'Client-Id':config.twitchClientId};
}
export async function resolveGreetingUser(config:Auth,login:string) {
 if(!/^\w{1,25}$/.test(login))throw new Error('Gültigen Twitch-Login eingeben.');
 const response=await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login.toLowerCase())}`,{headers:headers(config),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Twitch-Person konnte nicht geladen werden. Anmeldung prüfen.');
 const body=await response.json() as {data?:Array<{id:string;login:string;display_name:string}>};
 const person=body.data?.[0];
 if(!person||!/^\d{1,32}$/.test(person.id))throw new Error('Twitch-Person nicht gefunden.');
 return {userId:person.id,login:person.login,name:person.display_name};
}
export class GreetingRuntime {
 private getConfig:()=>Auth; private service:GreetingService; private request:typeof fetch;
 private timer:ReturnType<typeof setInterval>|undefined; private off:(()=>void)|undefined;
 private configOff:(()=>void)|undefined;
 private sendChat:(text:string)=>void;
 private pending:Promise<GreetingLive|null>|null=null; private stopped=true;
 constructor(getConfig:()=>Auth,service=getGreetingService(),request:typeof fetch=fetch,sendChat:(text:string)=>void=()=>{}){this.getConfig=getConfig;this.service=service;this.request=request;this.sendChat=sendChat;}
 start(){if(!this.stopped)return;this.stopped=false;this.configOff=botEvents.on('config:changed',({changedKeys})=>{if(changedKeys.some(key=>['twitchChannel','twitchClientId','twitchBotOauthToken'].includes(key))) {this.service.setLive(null);void this.poll();}});this.off=botEvents.on('greeting:message',message=>{void this.onMessage(message).catch(()=>{});});void this.poll();this.timer=setInterval(()=>void this.poll(),15000);this.timer.unref();}
 stop(){this.stopped=true;clearInterval(this.timer);this.off?.();this.configOff?.();this.service.setLive(null);}
 private fingerprint(config:Auth){return `${config.twitchChannel}:${config.twitchClientId}:${config.twitchBotOauthToken}`;}
 async poll():Promise<GreetingLive|null> {
  if(!this.service.snapshot().settings.profiles.some(p=>p.enabled&&hasGreetingOutput(p))){this.service.setLive(null);return null;}
  if(this.pending)return this.pending;
  const config=this.getConfig(),key=this.fingerprint(config);
  const work=async()=>{
   try {
    const response=await this.request(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(config.twitchChannel)}`,{headers:headers(config),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('Unknown live status');
    const body=await response.json() as {data?:Array<{id:string;user_id:string;user_login:string;started_at:string;type:string}>};
    if(!Array.isArray(body.data))throw new Error('Invalid live status');
    const stream=body.data[0];
    if(stream&&(stream.type!=='live'||stream.user_login?.toLowerCase()!==config.twitchChannel.toLowerCase()))throw new Error('Invalid stream identity');
    const live=stream&&stream.type==='live'&&stream.user_login.toLowerCase()===config.twitchChannel.toLowerCase()?{id:stream.id,channelId:stream.user_id,startedAt:Date.parse(stream.started_at)}:null;
    if(!this.stopped&&key===this.fingerprint(this.getConfig()))this.service.setLive(live,live?'live':'offline');
    return !this.stopped&&key===this.fingerprint(this.getConfig())?live:null;
   }catch{if(!this.stopped&&key===this.fingerprint(this.getConfig()))this.service.setLive(null);return null;}
  };
  this.pending=work();
  try{return await this.pending;}finally{this.pending=null;}
 }
 private async onMessage(message:GreetingMessage) {
  if(this.stopped||!this.service.snapshot().settings.profiles.some(p=>p.userId===message.userId&&p.enabled&&hasGreetingOutput(p)))return;
  if(await this.poll()) {
   let accepted=false;
   try{accepted=this.service.accept(message);}catch{console.warn('[Begrüßungen] Ereignis konnte nicht gespeichert werden.');}
   if(!accepted)return;
   const profile=this.service.snapshot().settings.profiles.find(p=>p.userId===message.userId);
   if(profile?.chatEnabled){try{this.sendChat(formatGreetingChat(profile));}catch{console.warn('[Begrüßungen] Chat-Nachricht konnte nicht gesendet werden.');}}
  }
 }
}
