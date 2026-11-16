import {QUIZ_CATALOG} from './quizCatalog.ts';
import {Hangman} from './hangman.ts';
import fs from 'node:fs';
import {DEFAULT_QUIZ_SHOW,freshQuizShow,type QuizShowProgress,type QuizJoker,type QuizSound} from '../quizShow.ts';
import path from 'node:path';
import {randomInt,randomUUID} from 'node:crypto';
import {writeJson} from './atomicStore.ts';
import {DEFAULT_GAMES, addGameContentPack} from './gameDefaults.ts';
import {GAME_LABELS,normalizeGuess,validateGames,type GameKind,type GameSettings,type GamePlayer,type GameScore,type PublicGameRound,type GameOutput,type GameSnapshot,type Adventure} from '../chatGames.ts';
interface Store {version:1;contentPack?:1;quizCatalogVersion?:1;settings:GameSettings;scores:GameScore[];activeId:string|null;completed:string[];quizShow?:QuizShowProgress}
interface Round {public:PublicGameRound;answers:Map<string,{player:GamePlayer;value:number}>;times:Map<string,number>;secret:string|number;correct:number;adventure?:Adventure;hangman?:Hangman;scene:string;pending?:{result:string;winners:GamePlayer[]}}
export class GameService {
 private store:Store={version:1,contentPack:1,settings:structuredClone(DEFAULT_GAMES),scores:[],activeId:null,completed:[]};
 private countdownRound='';private event: {id:string;at:number;kind:QuizSound}|undefined;
 private round:Round|null=null;private startToken=randomUUID();private lastStart='';private error='';private blocked=false;
 private file:string;private now:()=>number;private random:(max:number)=>number;
 private notices:string[]=[];private sender:((text:string)=>void)|undefined;private timer:ReturnType<typeof setInterval>|undefined;private sent:number[]=[];private hintAt=0;private pendingHint='';
 constructor(file=path.join(process.cwd(),'data/chat-games.json'),now=Date.now,random=randomInt){
  this.file=file;this.now=now;this.random=random;
  this.store.settings.quizzes.push(...structuredClone(QUIZ_CATALOG));this.store.quizCatalogVersion=1;
  let loaded=false;
  for(const candidate of [file,file+'.backup']){if(!fs.existsSync(candidate))continue;try{
   const raw=JSON.parse(fs.readFileSync(candidate,'utf8')) as Store;
   if(raw.version!==1||!Array.isArray(raw.scores)||raw.scores.length>50000||raw.scores.some(p=>!p||!/^\d{1,32}$/.test(p.id)||typeof p.name!=='string'||p.name.length>60||/[\x00-\x1f\x7f]/.test(p.name)||!Number.isSafeInteger(p.points)||p.points<0)||new Set(raw.scores.map(p=>p.id)).size!==raw.scores.length||!Array.isArray(raw.completed)||raw.completed.length>256||raw.completed.some(id=>typeof id!=='string'||id.length>80)||!(raw.activeId===null||typeof raw.activeId==='string'))throw Error('Invalid store');
   raw.settings=validateGames(raw.settings);raw.activeId=null;
   if(raw.quizCatalogVersion!==1){const ids=new Set(raw.settings.quizzes.map(q=>q.id));raw.settings.quizzes.push(...QUIZ_CATALOG.filter(q=>!ids.has(q.id)).slice(0,1000-raw.settings.quizzes.length));raw.quizCatalogVersion=1;}
   const progress=raw.quizShow;
   if(progress&&(!Number.isInteger(progress.level)||progress.level<0||progress.level>15||!Array.isArray(progress.used)||progress.used.length>1000||progress.used.some(id=>typeof id!=='string')||!Array.isArray(progress.jokers)||progress.jokers.some(j=>!['fifty','time','swap'].includes(j))))throw Error('Invalid quiz progress');
   if(raw.contentPack!==1){
    raw.settings=validateGames(addGameContentPack(raw.settings));
    raw.contentPack=1;
   }
   // A saved active marker is deliberately cleared without resuming or awarding points.
   writeJson(file,raw,{strictAtomic:true,preserveBackup:true});this.store=raw;loaded=true;break;
  }catch{}}
  if(!loaded&&(fs.existsSync(file)||fs.existsSync(file+'.backup'))){this.blocked=true;this.error='Spielespeicher unlesbar. Originaldatei oder Backup wiederherstellen.';}
 }
 private commit(next:Store){if(this.blocked)throw Error(this.error);try{writeJson(this.file,next,{strictAtomic:true});this.store=next;this.error='';}catch{this.error='Spielstand konnte nicht gespeichert werden. Bitte erneut auswerten; Punkte wurden nicht vergeben.';throw Error(this.error);}}
 private choose(max:number){const value=this.random(max);if(!Number.isInteger(value)||value<0||value>=max)throw Error('Auslosung fehlgeschlagen.');return value;}
 output():GameOutput {return structuredClone({round:this.round&&!(this.round.public.phase==='result'&&this.now()>=this.round.public.until)?this.round.public:null,serverNow:this.now(),storageError:this.error,quizShow:{...(this.store.quizShow||freshQuizShow()),design:(this.store.settings.quizShow||DEFAULT_QUIZ_SHOW).design,sound:this.store.settings.quizShow||DEFAULT_QUIZ_SHOW,event:this.event}});}
 snapshot():GameSnapshot {return {...this.output(),settings:structuredClone(this.store.settings),leaders:structuredClone([...this.store.scores].sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id)).slice(0,100)),startToken:this.startToken};}
 points(id:string){return this.store.scores.find(p=>p.id===id)?.points||0;}
 configure(raw:unknown){this.tick();if(this.round)throw Error('Einstellungen erst nach Ende der Runde ändern.');const settings=validateGames(raw);this.commit({...this.store,settings});return this.snapshot();}
 start(kind:string,token:unknown,contentId?:string){
  this.tick();if(token===this.lastStart)return this.snapshot();if(token!==this.startToken)throw Error('Veralteter Startauftrag. Status aktualisieren.');if(this.round)throw Error('Es läuft bereits eine Runde.');if(!Object.hasOwn(GAME_LABELS,kind))throw Error('Unbekanntes Spiel.');
  const k=kind as GameKind,s=this.store.settings;const r:Round={public:{id:randomUUID(),kind:k,phase:'running',startedAt:this.now(),prompt:'',choices:[],votes:[],deadline:this.now()+s.seconds*1000,remaining:0,hint:'',result:'',until:0,steps:0},answers:new Map(),times:new Map(),secret:'',correct:0,scene:''};
  const content=<T extends {id:string}>(items:T[])=>{const found=contentId?items.find(x=>x.id===contentId):items[0];if(!found)throw Error('Spielinhalt nicht gefunden.');return structuredClone(found);};
  if(k==='quiz'){const show=s.quizShow?.enabled;const progress=this.store.quizShow||freshQuizShow();const pool=s.quizzes.filter(q=>q.answers.length===4&&(!s.quizCategory||(q.category||'Allgemein')===s.quizCategory));const unused=pool.filter(q=>!progress.used.includes(q.id));const eligible=unused.length?unused:pool;if(show&&!eligible.length)throw Error('Keine ungespielten Fragen mit vier Antworten verfügbar. Andere Kategorie wählen oder Fragen ergänzen.');const q=show?structuredClone(eligible[this.choose(eligible.length)]):content(s.quizzes.filter(q=>!s.quizCategory||(q.category||'Allgemein')===s.quizCategory));if(show)r.scene=q.id;r.public.prompt=q.question;r.public.choices=q.answers;r.correct=q.correct;}
  if(k==='number'){r.secret=s.minimum+this.choose(s.maximum-s.minimum+1);r.public.prompt=`Welche Zahl zwischen ${s.minimum} und ${s.maximum} suchen wir?`;}
  if(k==='word'){const w=content(s.words);r.secret=w.word;r.hangman=new Hangman(w.word,w.hint);Object.assign(r.public,r.hangman.view());}
  if(k==='adventure'){r.adventure=content(s.adventures);r.scene=r.adventure.entry;this.scene(r);}
  this.commit({...this.store,activeId:r.public.id,...(k==='quiz'&&s.quizShow?.enabled?{quizShow:{...(this.store.quizShow||freshQuizShow()),used:[...(this.store.quizShow?.used||[]).filter(id=>id!==r.scene),r.scene].slice(-1000)}}:{})});this.round=r;if(k==='quiz')this.sound('question');this.lastStart=this.startToken;this.startToken=randomUUID();this.pendingHint='';this.notices=[];
  if(k==='quiz')this.announce(`🎮 Quiz startet! Alle können mitspielen: Schreibe !play A, !play B${r.public.choices.length>=3?', !play C':''}${r.public.choices.length>=4?' oder !play D':''} (auch 1–${r.public.choices.length} möglich). Du hast ${s.seconds} Sekunden und eine Antwort pro Person. Jede richtige Antwort gibt nach der Auswertung 10 Punkte. Dein Punktestand: !points · Rangliste: !points top.`);
  if(k==='word')this.announce('🎮 Gemeinsam Galgenraten: !play A für einen Buchstaben oder !play <Wort> zum Lösen. Acht gemeinsame Fehlversuche; Wiederholungen kosten nichts. Hinweis ab drei übrigen Versuchen. Wer das Wort vollständig löst, erhält 10 Punkte.');
  this.announceRound(r,`${GAME_LABELS[k]} (${s.seconds}s) · !play <Antwort>`);return this.snapshot();
 }
 private scene(r:Round){const scene=r.adventure!.scenes.find(s=>s.id===r.scene)!;r.public.prompt=scene.text;r.public.choices=scene.choices.map(c=>c.text);r.public.votes=scene.choices.map(()=>0);r.answers.clear();r.times.clear();r.public.steps++;r.public.deadline=this.now()+this.store.settings.seconds*1000;}
 private check(id:unknown){if(!this.round||typeof id!=='string'||id!==this.round.public.id)throw Error('Veraltete Runde. Status aktualisieren.');return this.round;}
 answer(player:GamePlayer,value:string){
  this.tick();const r=this.round;if(!r||r.public.phase==='result')return;if(r.public.phase==='settling')throw Error('Die Auswertung wartet auf erfolgreiches Speichern.');if(r.public.phase!=='running')return;
  if(!/^\d{1,32}$/.test(player.id)||typeof player.name!=='string'||!value||value.length>100||/[\x00-\x1f\x7f]/.test(value))return;
  player={id:player.id,name:player.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,60)};
  if(!r.times.has(player.id)&&r.times.size>=1000)throw Error('Teilnehmerlimit erreicht (1000).');const previous=r.times.get(player.id);if(previous!==undefined&&this.now()-previous<2000)return;
  if(r.public.kind==='quiz'&&r.answers.has(player.id))return;
  const answerText=value.trim();const letter=r.public.kind==='quiz'&&/^[a-d]$/i.test(answerText)?answerText.toUpperCase().charCodeAt(0)-64:NaN;const number=Number.isFinite(letter)?letter:/^\d{1,5}$/.test(answerText)?Number(answerText):NaN;
  if(r.public.hidden?.includes(number-1))throw Error('Diese Antwort wurde durch 50:50 entfernt.');
  if((r.public.kind==='quiz'||r.public.kind==='adventure')&&(!Number.isInteger(number)||number<1||number>r.public.choices.length))return;
  if(r.public.kind==='number'&&(!Number.isInteger(number)||number<this.store.settings.minimum||number>this.store.settings.maximum))return;
  if(r.hangman){
   const outcome=r.hangman.guess(value);if(outcome==='ignored')return;
   r.times.set(player.id,this.now());Object.assign(r.public,r.hangman.view());
   if(outcome==='won')this.settle(r,`${player.name} gewinnt! Lösung: ${r.secret}. +10 Punkte.`,[player]);
   else if(outcome==='lost')this.settle(r,`Keine Versuche mehr. Lösung: ${r.secret}. Gemeinsam beim nächsten Mal!`,[]);
   return;
  }
  r.times.set(player.id,this.now());
  if(r.public.kind==='quiz'||r.public.kind==='adventure'){r.answers.set(player.id,{player,value:number-1});if(r.public.kind==='adventure')r.public.votes=r.public.choices.map((_,i)=>[...r.answers.values()].filter(a=>a.value===i).length);return;}
  const won=r.public.kind==='number'?number===r.secret:normalizeGuess(value)===normalizeGuess(String(r.secret));
  if(won){this.settle(r,`${player.name} gewinnt! Lösung: ${r.secret}. +10 Punkte.`,[player]);return;}
  if(r.public.kind==='number'){r.public.hint=number<Number(r.secret)?`Die gesuchte Zahl ist größer als ${number}.`:`Die gesuchte Zahl ist kleiner als ${number}.`;this.pendingHint=r.public.hint;}
 }
 private settle(r:Round,result:string,winners:GamePlayer[]){
  r.pending??={result,winners:structuredClone(winners)};r.public.phase='settling';
  const scores=structuredClone(this.store.scores);
  for(const winner of r.pending.winners){const existing=scores.find(p=>p.id===winner.id);if(existing){if(!Number.isSafeInteger(existing.points+10))throw Error('Punktelimit erreicht.');existing.points+=10;existing.name=winner.name;}else{if(scores.length>=50000)throw Error('Rangliste voll. Bitte Spielstand prüfen.');scores.push({...winner,points:10});}}
  const progress=this.store.quizShow||freshQuizShow();const show=r.public.kind==='quiz'&&this.store.settings.quizShow?.enabled;const nextLevel=0;
  this.commit({...this.store,scores,...(show?{quizShow:{...progress,level:nextLevel}}:{}),activeId:null,completed:[...this.store.completed,r.public.id].slice(-256)});
  if(r.public.kind==='quiz'){r.public.correct=r.correct;this.sound(r.pending.winners.length?'success':'failure');}
  r.public.winners=r.pending.winners.map(player=>player.name);r.public.phase='result';r.public.result=r.pending.result;r.public.until=this.now()+(r.public.kind==='quiz'?5000:8000);r.pending=undefined;this.pendingHint='';this.notices=[];this.announce(r.public.kind==='quiz'?(r.public.winners.length?`🏆 Gewonnen: ${r.public.winners.join(', ')} · je +10 Punkte.`:'🏁 Quiz beendet. Keine richtige Antwort.'):`🏁 ${r.public.result}`);
 }
 finish(id:unknown){const r=this.check(id);if(r.public.phase==='result')return this.snapshot();if(r.pending){this.settle(r,r.pending.result,r.pending.winners);return this.snapshot();}
  if(r.public.kind==='adventure'){this.advance(r);return this.snapshot();}
  const winners=r.public.kind==='quiz'?[...r.answers.values()].filter(a=>a.value===r.correct).map(a=>a.player):[];
  const solution=r.public.kind==='quiz'?r.public.choices[r.correct]:String(r.secret);
  this.settle(r,`${r.public.kind==='word'?(this.now()>=r.public.deadline?'Zeit abgelaufen. ':'Runde beendet. '):''}Lösung: ${solution}. ${winners.length?winners.length+' richtige Antwort(en), je +10 Punkte.':'Keine richtige Antwort.'}`,winners);return this.snapshot();
 }
 private advance(r:Round,choice?:number){
  const scene=r.adventure!.scenes.find(s=>s.id===r.scene)!;
  if(!scene.choices.length||r.public.steps>=30){this.settle(r,r.public.steps>=30?'Abenteuer beendet: maximal 30 Entscheidungen erreicht.':scene.text,[]);return;}
  let tie=false;
  if(choice===undefined){const counts=r.public.votes,max=Math.max(0,...counts);if(!max){r.public.phase='paused';r.public.remaining=0;this.announce('🎮 Keine Stimmen. Abenteuer pausiert. Mods: !game choose <Nummer> oder !game resume.');return;}
   const candidates=counts.map((v,i)=>v===max?i:-1).filter(i=>i>=0);tie=candidates.length>1;choice=candidates[this.choose(candidates.length)];
  }
  if(!Number.isInteger(choice)||choice<0||choice>=scene.choices.length)throw Error('Ungültige Entscheidung.');
  const chosen=scene.choices[choice];r.scene=chosen.next;this.scene(r);
  if(!r.public.choices.length){this.settle(r,`${tie?'Gleichstand per Los entschieden. ':''}${chosen.text}: ${r.public.prompt}`,[]);return;}
  r.public.phase='running';this.announceRound(r,`${tie?'Gleichstand per Los entschieden. ':''}${chosen.text} · !play <Nummer>`);
 }
 control(action:string,id:unknown,choice?:number){if(action==='reset-show'){if(this.round)throw Error('Runde zuerst beenden.');this.commit({...this.store,quizShow:freshQuizShow()});this.event=undefined;return this.snapshot();}const r=this.check(id);
  if(['fifty','time','swap'].includes(action))return this.joker(action as QuizJoker,id);
  if(action==='cancel'){this.commit({...this.store,activeId:null,completed:[...this.store.completed,r.public.id].slice(-256)});this.round=null;this.pendingHint='';this.announce('🎮 Runde abgebrochen. Keine Punkte vergeben.');}
  else if(action==='finish')return this.finish(id);
  else if(action==='pause'&&r.public.kind==='adventure'&&r.public.phase==='running'){r.public.remaining=Math.max(0,r.public.deadline-this.now());r.public.phase='paused';}
  else if(action==='resume'&&r.public.kind==='adventure'&&r.public.phase==='paused'){r.public.deadline=this.now()+(r.public.remaining||this.store.settings.seconds*1000);r.public.phase='running';}
  else if(action==='choose'&&r.public.kind==='adventure'&&r.public.phase==='paused'){this.advance(r,(choice??0)-1);}
  else throw Error('Diese Aktion ist im aktuellen Zustand nicht verfügbar.');return this.snapshot();
 }
 tick(){const r=this.round;if(r?.public.kind==='quiz'&&r.public.phase==='running'&&r.public.deadline-this.now()<=5000&&r.public.deadline>this.now()&&this.countdownRound!==r.public.id){this.countdownRound=r.public.id;this.sound('countdown');}if(!r)return;if(r.public.phase==='result'&&this.now()>=r.public.until){this.round=null;return;}if(r.public.phase==='settling'||(r.public.phase==='running'&&this.now()>=r.public.deadline))this.finish(r.public.id);}
 private sound(kind:QuizSound){this.event={id:randomUUID(),at:this.now(),kind};}
 joker(kind:QuizJoker,id:unknown){
  this.tick();const r=this.check(id);const progress=this.store.quizShow||freshQuizShow();
  if(!this.store.settings.quizShow?.enabled||r.public.kind!=='quiz'||r.public.phase!=='running'||progress.jokers.includes(kind))throw Error('Joker ist gerade nicht verfügbar.');
  let replacement:typeof this.store.settings.quizzes[number]|undefined;
  if(kind==='swap'){const choices=this.store.settings.quizzes.filter(q=>q.answers.length===4&&(!this.store.settings.quizCategory||(q.category||'Allgemein')===this.store.settings.quizCategory)&&!progress.used.includes(q.id));if(!choices.length)throw Error('Keine andere ungespielte Frage mit vier Antworten verfügbar.');replacement=structuredClone(choices[this.choose(choices.length)]);}
  const next={...progress,jokers:[...progress.jokers,kind],used:replacement?[...progress.used,replacement.id]:progress.used};
  this.commit({...this.store,quizShow:next});
  if(kind==='time')r.public.deadline+=30000;
  if(kind==='fifty'){const wrong=r.public.choices.map((_,i)=>i).filter(i=>i!==r.correct);wrong.splice(this.choose(wrong.length),1);r.public.hidden=wrong;}
  if(replacement){r.public.id=randomUUID();r.public.startedAt=this.now();r.public.prompt=replacement.question;r.public.choices=replacement.answers;r.public.hidden=[];r.public.deadline=this.now()+this.store.settings.seconds*1000;r.correct=replacement.correct;r.answers.clear();r.times.clear();r.scene=replacement.id;this.notices=[];this.announceRound(r,'Neue Quizfrage · !play A–D');}
  this.sound('joker');return this.snapshot();
 }
 private announce(text:string){
  // Bound messages by UTF-8 bytes without discarding long questions or scene text.
  let part='';for(const char of text){if(Buffer.byteLength(part+char)>380){if(this.notices.length>=12)this.notices.shift();this.notices.push(part);part='';}part+=char;}
  if(part){if(this.notices.length>=12)this.notices.shift();this.notices.push(part);}
 }
 private announceRound(r:Round,title:string){if(r.public.kind==='quiz')return;this.announce(`🎮 ${title}: ${r.public.prompt}`);for(let i=0;i<r.public.choices.length;i+=2)this.announce('🎮 '+r.public.choices.slice(i,i+2).map((c,j)=>`${i+j+1}: ${c}`).join(' | '));}
 say(text:string){this.announce(text.replace(/[\r\n\x00-\x1f\x7f]/g,' ').slice(0,700));}
 startRuntime(sender:(text:string)=>void){this.stopRuntime();this.sender=sender;this.timer=setInterval(()=>{try{this.tick();}catch{/* Retain settlement for a safe retry. */}this.flush();},500);this.timer.unref();}
 stopRuntime(){clearInterval(this.timer);this.timer=undefined;this.sender=undefined;this.notices=[];}
 private flush(){const now=this.now();this.sent=this.sent.filter(t=>now-t<30000);if(!this.sender||this.sent.length>=8||(this.sent.length&&now-this.sent.at(-1)!<2500))return;
  if(!this.notices.length&&this.pendingHint&&now-this.hintAt>=5000){this.notices.push(`🎮 ${this.pendingHint}`);this.pendingHint='';this.hintAt=now;}
  const text=this.notices.shift();if(!text)return;const bytes=Buffer.from(text);let end=Math.min(bytes.length,380);while(end>0&&(bytes[end]&0xc0)===0x80)end--;try{this.sender(bytes.subarray(0,end).toString('utf8'));this.sent.push(now);}catch{/* Do not replay obsolete messages after reconnect. */}
 }
}
let singleton:GameService|undefined;
export const getGameService=()=>singleton??=new GameService();
