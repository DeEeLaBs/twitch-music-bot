export interface GreetingProfile {
 userId:string; login:string; name:string; enabled:boolean;
 soundEnabled:boolean; soundUrl:string; volume:number; gifEnabled:boolean; gifUrl:string; seconds:number;
 chatEnabled?:boolean; chatMessage?:string;
}
export interface GreetingSettings { outputOverlayId:string; profiles:GreetingProfile[] }
export interface GreetingEvent { id:string; profile:GreetingProfile; queuedAt:number; endsAt:number }
export interface GreetingMessage { id:string; userId:string; channelId:string; at:number; replay?:boolean }
export interface GreetingLive { id:string; channelId:string; startedAt:number }
export const hasGreetingOutput=(profile:GreetingProfile)=>profile.soundEnabled||profile.gifEnabled||profile.chatEnabled===true;
export function formatGreetingChat(profile:GreetingProfile):string {
 let text=(profile.chatMessage||'').replace(/\{(name|user)\}/g,(_,key:string)=>key==='name'?profile.name:`@${profile.login}`).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').trim();
 if(/^[/.]/.test(text))text=`Willkommen ${text}`;
 const encoder=new TextEncoder();let result='',bytes=0;
 for(const character of text){const size=encoder.encode(character).length;if(bytes+size>350)break;result+=character;bytes+=size;}
 return result;
}
const asset = (url:unknown,kind:'sound'|'gif') => typeof url==='string' && (url==='' || (kind==='gif' ? /^\/overlay-assets\/greeting-[a-zA-Z0-9-]+\.gif$/ : /^\/overlay-assets\/greeting-[a-zA-Z0-9-]+\.(mp3|wav|ogg)$/).test(url));
export function validateGreetingSettings(value:unknown):GreetingSettings {
 const raw=value as GreetingSettings;
 if (!raw || typeof raw.outputOverlayId!=='string' || !/^[a-zA-Z0-9-]{0,80}$/.test(raw.outputOverlayId) || !Array.isArray(raw.profiles) || raw.profiles.length>200) throw new Error('Ungültige Begrüßungs-Einstellungen (maximal 200 Personen).');
 const ids=new Set<string>();
 const profiles=raw.profiles.map(p=>{
  const chatEnabled=p?.chatEnabled===undefined?false:p.chatEnabled,chatMessage=p?.chatMessage===undefined?'':p.chatMessage;
  if(typeof chatEnabled!=='boolean'||typeof chatMessage!=='string'||chatMessage.length>250||/[\x00-\x1f\x7f-\x9f]/.test(chatMessage)||/^[/.]/.test(chatMessage.trim())||(chatEnabled&&!chatMessage.trim()))throw new Error('Chat-Begrüßung: einen einzeiligen Text mit maximal 250 Zeichen eingeben (keine Chat-Befehle).');
  if (!p || typeof p.userId!=='string' || !/^\d{1,32}$/.test(p.userId) || ids.has(p.userId) || typeof p.login!=='string' || !/^\w{1,25}$/.test(p.login) || typeof p.name!=='string' || !p.name.trim() || p.name.length>80 || /[\x00-\x1f]/.test(p.name) ||
   !['enabled','soundEnabled','gifEnabled'].every(k=>typeof p[k as keyof GreetingProfile]==='boolean') || !asset(p.soundUrl,'sound') || !asset(p.gifUrl,'gif') ||
   (p.soundEnabled&&!p.soundUrl) || (p.gifEnabled&&!p.gifUrl) || !Number.isFinite(p.volume) || p.volume<0 || p.volume>100 || !Number.isFinite(p.seconds) || p.seconds<1 || p.seconds>30) throw new Error('Ungültige Person, Medien oder Dauer (1–30 Sekunden).');
  ids.add(p.userId);
  return {userId:p.userId,login:p.login.toLowerCase(),name:p.name.trim(),enabled:p.enabled,soundEnabled:p.soundEnabled,soundUrl:p.soundUrl,volume:p.volume,gifEnabled:p.gifEnabled,gifUrl:p.gifUrl,seconds:p.seconds,chatEnabled,chatMessage:chatMessage.trim()};
 });
 return {outputOverlayId:raw.outputOverlayId,profiles};
}
