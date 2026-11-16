import {useEffect,useState} from 'react';
import {GAME_LABELS,type GameKind,type GameOutput} from '../chatGames.ts';
import {CozyGameDisplay} from './CozyGameDisplay.tsx';
import {QuizAudio} from './QuizAudio.tsx';
import {DEFAULT_QUIZ_SHOW} from '../quizShow.ts';
export const GAME_PREVIEW:GameOutput={serverNow:0,storageError:'',round:{id:'preview',kind:'quiz',phase:'running',startedAt:0,prompt:'Welche Farbe entsteht aus Blau und Gelb?',choices:['Grün','Rot','Violett'],votes:[],deadline:30000,remaining:0,hint:'',result:'',until:0,steps:0}};
export const QUIZ_SHOW_PREVIEW:GameOutput={
 ...GAME_PREVIEW,
 round:{...GAME_PREVIEW.round!,choices:['Grün','Rot','Violett','Orange']},
 quizShow:{level:0,used:[],jokers:[],design:'show',sound:{...DEFAULT_QUIZ_SHOW,enabled:true,design:'show',muted:true}}
};
export function gamePreview(kind:GameKind,wordMistakes=5):GameOutput {
 const prompts={quiz:GAME_PREVIEW.round!.prompt,number:'Welche Zahl zwischen 1 und 100 suchen wir?',word:'Re▢en▢▢▢en',adventure:'Zwischen den Bäumen leuchtet ein kleines Café. Auf dem Weg liegt eine geheimnisvolle Karte. Was möchtet ihr tun?'};
 return {...GAME_PREVIEW,round:{...GAME_PREVIEW.round!,id:`preview-${kind}`,kind,prompt:prompts[kind],choices:kind==='quiz'?['Grün','Rot','Violett','Orange']:kind==='adventure'?['Im Café nach dem Weg fragen','Der Karte zum See folgen','Erst einmal die Umgebung erkunden']:[],votes:kind==='adventure'?[4,2,1]:[],...(kind==='word'?{word:{remaining:8-wordMistakes,maximum:8,letters:[...['r','e','n'].map(value=>({value,correct:true})),...['a','i','s','t','u','h','k','l'].slice(0,wordMistakes).map(value=>({value,correct:false}))],wrongWords:[]}}:{}),hint:kind==='word'?(wordMistakes>=5?'Es erscheint nach dem Regen am Himmel.':''):kind==='number'?'Die gesuchte Zahl ist größer als 25.':''}};
}
function GamesPreview(){
 const [kind,setKind]=useState<GameKind>('quiz');
 const [mistakes,setMistakes]=useState(5);
 return <div className={`cozy-preview${kind==='word'?' is-word':''}`}><div className="cozy-preview-controls"><label onPointerDown={e=>e.stopPropagation()}>Spielvorschau<select aria-label="Spielvorschau" value={kind} onPointerDown={e=>e.stopPropagation()} onChange={e=>setKind(e.target.value as GameKind)}>{(Object.keys(GAME_LABELS) as GameKind[]).map(k=><option key={k} value={k}>{GAME_LABELS[k]}</option>)}</select></label>{kind==='word'&&<label>Fehlversuche<select aria-label="Fehlversuche in der Vorschau" value={mistakes} onPointerDown={e=>e.stopPropagation()} onChange={e=>setMistakes(Number(e.target.value))}>{Array.from({length:8},(_,i)=><option key={i} value={i}>{i} Fehler · {8-i} übrig</option>)}</select></label>}</div><GameDisplay output={kind==='quiz'?QUIZ_SHOW_PREVIEW:gamePreview(kind,mistakes)} now={0}/></div>;
}
export function GameDisplay({output,now}:{output:GameOutput;now:number}){
 const r=output.round;if(!r)return null;const seconds=r.phase==='paused'?Math.ceil(r.remaining/1000):Math.max(0,Math.ceil((r.deadline-now)/1000));
 if(r.kind!=='quiz')return <CozyGameDisplay output={output} now={now}/>;
 if(r.kind==='quiz'&&output.quizShow?.design==='show'){
  const show=output.quizShow;
  return <section key={r.id} className="quiz-show cozy-quiz" data-phase={r.phase} data-exiting={r.phase==='result'&&now>=r.until-700?'true':undefined}><main><div className="quiz-topline"><strong className="quiz-timer">{r.phase==='result'?'Auflösung':r.phase==='settling'?'Speichern …':seconds+'s'}</strong></div><h3>{r.phase==='result'?(r.winners?.length?'🏆 '+(r.winners.length===1?'Gewonnen hat ':'Gewonnen haben ')+r.winners.join(', '):'Diese Runde hat niemand gewonnen'):r.prompt}</h3><ol className="quiz-answers" hidden={r.phase==='result'}>{r.choices.map((choice,index)=><li key={index} className={r.hidden?.includes(index)?'is-hidden':r.correct===index?'is-correct':r.phase==='result'?'is-wrong':''}><b aria-label={`Antwort ${'ABCD'[index]}`}>{'ABCD'[index]}</b><span>{r.hidden?.includes(index)?'—':choice}</span></li>)}</ol>{r.phase==='result'&&<p role="status">{r.result}</p>}<div className="quiz-jokers">{(['fifty','time','swap'] as const).map((joker,index)=><span key={joker} className={show.jokers.includes(joker)?'is-used':''}>{['50:50','+30 Sekunden','Fragenwechsel'][index]}</span>)}</div>{r.phase==='running'&&<footer className="quiz-footer">Antworte im Chat mit <strong>!play A–D</strong></footer>}</main></section>;
 }
 return <div className={`games-widget${r.kind==='quiz'?' cozy-classic-quiz':''}`} data-round={r.id} data-phase={r.phase}><header><span>🎮 {GAME_LABELS[r.kind]}</span><span>{r.phase==='paused'?'Pausiert':r.phase==='settling'?'Speichern …':r.phase==='result'?'Ergebnis':`${seconds}s`}</span></header>
 <div className="games-widget-content"><h3 aria-live={r.phase==='result'?'polite':'off'}>{r.phase==='result'?r.result:r.prompt}</h3>{r.phase!=='result'&&r.hint&&<p>{r.hint}</p>}
 {r.phase!=='result'&&r.choices.length>0&&<ol>{r.choices.map((c,i)=><li key={i}><b>{i+1}</b><span>{c}</span>{r.kind==='adventure'&&<small>{r.votes[i]||0} Stimmen</small>}</li>)}</ol>}
 {r.phase==='running'&&<footer>Mitspielen: <strong>!play {r.choices.length?'1–'+r.choices.length:'<Antwort>'}</strong></footer>}
 {r.phase==='settling'&&<p role="status">Auswertung wartet auf erfolgreiches Speichern. Keine weiteren Antworten möglich.</p>}</div></div>;
}
export function GamesWidget({token,overlayId,preview}:{token:string;overlayId:string;preview:boolean}){
 const [output,setOutput]=useState<GameOutput|null>(null),[offset,setOffset]=useState(0),[now,setNow]=useState(Date.now());
 useEffect(()=>{if(preview)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;const abort=new AbortController();const poll=async()=>{const began=Date.now();try{const response=await fetch(`/api/v1/games/output?token=${encodeURIComponent(token)}&overlayId=${encodeURIComponent(overlayId)}`,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(3000)])});if(!response.ok)throw Error();const next:GameOutput=await response.json();if(!stopped){setOutput(next);setOffset(next.serverNow-(began+Date.now())/2);setNow(Date.now());}}catch{if(!stopped)setOutput(null);}if(!stopped)timer=setTimeout(poll,500);};void poll();return()=>{stopped=true;abort.abort();clearTimeout(timer);};},[preview,token,overlayId]);
 useEffect(()=>{if(preview)return;const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[preview]);
 return preview?<GamesPreview/>:output?<><GameDisplay output={output} now={now+offset}/><QuizAudio output={output}/></>:null;
}
