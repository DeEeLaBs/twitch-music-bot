import {parseCommand} from './commandRegistry.ts';
import {GameService} from './gameService.ts';
export interface GameChatMessage {id:string;userId:string;name:string;channel:string;expectedChannel:string;role:string;at:number;own:boolean;shared:boolean}
export class GameChat {
 private seen=new Map<string,number>();private queries=new Map<string,number>();private service:GameService;private now:()=>number;
 constructor(service:GameService,now=Date.now){this.service=service;this.now=now;}
 receive(text:string,message:GameChatMessage){
  const parsed=parseCommand(text);if(!parsed||!['game','play','points'].includes(parsed.definition.name))return false;
  const now=this.now();if(!message.id||message.id.length>100||!/^\d{1,32}$/.test(message.userId)||message.own||message.shared||message.channel.toLowerCase()!==message.expectedChannel.toLowerCase().replace(/^#/,'')||!Number.isFinite(message.at)||message.at<now-15000||message.at>now+5000)return true;
  for(const [id,at] of this.seen)if(now-at>20000)this.seen.delete(id);
  if(this.seen.has(message.id)||this.seen.size>=5000)return true;this.seen.set(message.id,now);
  try{
   if(parsed.definition.name==='points'){
    for(const [id,at] of this.queries)if(now-at>30000)this.queries.delete(id);
    if(this.queries.has(message.userId)||this.queries.size>=1000)return true;this.queries.set(message.userId,now);
    if(parsed.args.toLowerCase()==='top')this.service.say('🏆 '+(this.service.snapshot().leaders.slice(0,5).map((p,i)=>`${i+1}. ${p.name}: ${p.points}`).join(' | ')||'Noch keine Punkte.'));
    else this.service.say(`🏆 ${message.name}: ${this.service.points(message.userId)} Punkte.`);return true;
   }
   if(parsed.definition.name==='play'){const round=this.service.output().round;if(round&&message.at<round.startedAt)return true;this.service.answer({id:message.userId,name:message.name},parsed.args);return true;}
   // These roles come exclusively from the authenticated IRC parser, never from a dashboard body.
   if(message.role!=='moderator'&&message.role!=='broadcaster')return true;
   const shortcuts:Record<string,string>={quiz:'quiz',zahlenraten:'number',wortraten:'word',abenteuer:'adventure'};
   const args=shortcuts[parsed.rawName]?`start ${shortcuts[parsed.rawName]} ${parsed.args}`:parsed.args;
   const [action,arg,contentId]=args.split(/\s+/);const current=this.service.snapshot();
   if(action==='start'){
    const kinds:Record<string,string>={quiz:'quiz',number:'number',zahlen:'number',word:'word',wort:'word',adventure:'adventure',abenteuer:'adventure'};
    this.service.start(kinds[arg]||arg,current.startToken,contentId);
   }else if(['finish','cancel','pause','resume','choose'].includes(action))this.service.control(action,current.round?.id,Number(arg));
   else this.service.say('🎮 Mods & Streamer: !quiz · !zahlenraten · !wortraten · !abenteuer. Auswerten: !game finish · Abbrechen: !game cancel. Mitspielen: !play <Antwort> · Punkte: !points [top]');
  }catch(error){this.service.say(`🎮 ${error instanceof Error?error.message:'Spielaktion fehlgeschlagen.'}`);}
  return true;
 }
}
