import type {QuizShowSettings, QuizShowOutput} from './quizShow.ts';
import {validateQuizShow} from './quizShow.ts';
export type GameKind='quiz'|'number'|'word'|'adventure';
export interface QuizQuestion {id:string;question:string;answers:string[];correct:number;category?:string}
export interface GameWord {id:string;word:string;hint:string}
export interface AdventureScene {id:string;text:string;choices:{text:string;next:string}[]}
export interface Adventure {id:string;name:string;entry:string;scenes:AdventureScene[]}
export interface GameSettings {seconds:number;minimum:number;maximum:number;quizzes:QuizQuestion[];words:GameWord[];adventures:Adventure[];quizShow?:QuizShowSettings;quizCategory?:string}
export interface GamePlayer {id:string;name:string}
export interface GameScore extends GamePlayer {points:number}
export interface HangmanPublic {remaining:number;maximum:number;letters:{value:string;correct:boolean}[];wrongWords:string[]}
export interface PublicGameRound {id:string;kind:GameKind;phase:'running'|'paused'|'settling'|'result';startedAt:number;prompt:string;choices:string[];votes:number[];deadline:number;remaining:number;hint:string;result:string;until:number;steps:number;hidden?:number[];winners?:string[];correct?:number;word?:HangmanPublic}
export interface GameOutput {round:PublicGameRound|null;serverNow:number;storageError:string;quizShow?:QuizShowOutput}
export interface GameSnapshot extends GameOutput {settings:GameSettings;leaders:GameScore[];startToken:string}
export const GAME_LABELS:Record<GameKind,string>={quiz:'Quiz',number:'Zahlenraten',word:'Wort erraten',adventure:'Chat-Abenteuer'};

function text(value:unknown,max=240,empty=false):string {if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\x00-\x1f\x7f]/.test(value))throw Error(`Texte benötigen ${empty?'0':'1'} bis ${max} Zeichen ohne Steuerzeichen.`);return value.trim();}
function id(value:unknown):string {if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw Error('Ungültige Inhalts-ID.');return value;}
function list<T>(raw:unknown,map:(value:any)=>T,min=1,max=100):T[]{if(!Array.isArray(raw)||raw.length<min||raw.length>max)throw Error(`Bitte ${min} bis ${max} Einträge anlegen.`);return raw.map(map);}
function unique<T extends {id:string}>(items:T[]):T[]{if(new Set(items.map(i=>i.id)).size!==items.length)throw Error('Inhalts-IDs müssen eindeutig sein.');return items;}
export function normalizeGuess(value:string){return value.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}\s]/gu,'').trim().replace(/\s+/g,' ');}
export function validateGames(raw:unknown):GameSettings {
 if(!raw||typeof raw!=='object')throw Error('Ungültige Spieleinstellungen.');const r=raw as GameSettings;
 if(!Number.isInteger(r.seconds)||r.seconds<10||r.seconds>300||!Number.isInteger(r.minimum)||!Number.isInteger(r.maximum)||r.minimum<1||r.maximum>10000||r.minimum>=r.maximum)throw Error('Rundenzeit: 10–300 Sekunden. Zahlenbereich: 1–10000 mit Minimum kleiner Maximum.');
 const quizzes=unique(list(r.quizzes,q=>{const answers=list(q.answers,(a)=>text(a,100),2,4);if(!Number.isInteger(q.correct)||q.correct<0||q.correct>=answers.length||new Set(answers.map(normalizeGuess)).size!==answers.length)throw Error('Quiz benötigt unterschiedliche Antworten und genau eine richtige Auswahl.');return {id:id(q.id),question:text(q.question),answers,correct:q.correct,...(q.category?{category:text(q.category,60)}:{})};},1,1000));
 const words=unique(list(r.words,w=>{const word=text(w.word,60);if(!normalizeGuess(word))throw Error('Wörter benötigen Buchstaben oder Zahlen.');return {id:id(w.id),word,hint:text(w.hint,160,true)};}));
 const adventures=unique(list(r.adventures,a=>{
  const scenes=unique(list(a.scenes,s=>({id:id(s.id),text:text(s.text,500),choices:list(s.choices,c=>({text:text(c.text,100),next:id(c.next)}),0,4)}),1,50));
  const entry=id(a.entry),map=new Map(scenes.map(s=>[s.id,s]));if(!map.has(entry))throw Error('Der Abenteuer-Einstieg fehlt.');
  for(const scene of scenes)for(const c of scene.choices)if(!map.has(c.next))throw Error('Eine Folgeszene fehlt.');
  const reachable=new Set<string>();const visit=(key:string)=>{if(reachable.has(key))return;reachable.add(key);for(const c of map.get(key)!.choices)visit(c.next);};visit(entry);
  const endings=scenes.filter(s=>!s.choices.length);if(!endings.some(s=>reachable.has(s.id)))throw Error('Das Abenteuer benötigt ein erreichbares Ende.');
  const canEnd=new Set(endings.map(s=>s.id));for(let i=0;i<scenes.length;i++)for(const s of scenes)if(s.choices.some(c=>canEnd.has(c.next)))canEnd.add(s.id);
  if([...reachable].some(key=>!canEnd.has(key)))throw Error('Jede erreichbare Szene benötigt einen Weg zu einem Ende.');
  return {id:id(a.id),name:text(a.name,80),entry,scenes};
 },1,20));return {seconds:r.seconds,minimum:r.minimum,maximum:r.maximum,quizzes,words,adventures,...(r.quizCategory?{quizCategory:text(r.quizCategory,60)}:{}),...(r.quizShow===undefined?{}:{quizShow:validateQuizShow(r.quizShow)})};
}
