import {BookOpen, Hash, Puzzle, Trophy} from 'lucide-react';
import {GAME_LABELS, type GameOutput} from '../chatGames.ts';
import './cozyGames.css';
import {HangmanDrawing,HangmanWord} from './HangmanWord.tsx';

export function CozyGameDisplay({output, now}:{output:GameOutput;now:number}) {
 const r=output.round;
 if(!r||r.kind==='quiz')return null;
 const result=r.phase==='result';
 const seconds=Math.max(0,Math.ceil((r.phase==='paused'?r.remaining:r.deadline-now)/1000));
 const status=result?'Ergebnis':r.phase==='paused'?'Pausiert':r.phase==='settling'?'Wird gespeichert':`${seconds}s übrig`;
 const Icon=result?Trophy:r.kind==='number'?Hash:r.kind==='word'?Puzzle:BookOpen;
 const example=r.kind==='number'?'!play <Zahl>':r.kind==='word'?'!play <Wort>':'!play 1';
 const total=r.votes.reduce((sum,v)=>sum+v,0);
 return <section className="cozy-game" data-kind={r.kind} data-phase={r.phase} data-exiting={result&&now>=r.until-300?'true':undefined} aria-label={GAME_LABELS[r.kind]}>
  <article className="cozy-game-card" key={r.id}>
   <header className="cozy-game-heading"><span className="cozy-game-title"><span className="cozy-game-icon"><Icon size={20} aria-hidden="true"/></span>{GAME_LABELS[r.kind]}</span><span className="cozy-game-status">{status}</span></header>
   <div className="cozy-game-body">
    {result?<div className="cozy-game-result" role="status">{r.kind==='word'&&<HangmanDrawing remaining={r.word?.remaining??8}/>}<span className="cozy-game-eyebrow">{r.winners?.length?'Gut gespielt!':'Runde beendet'}</span><h3>{r.result}</h3></div>:<>
     {r.kind==='word'?<HangmanWord round={r}/>:<h3 className={r.kind==='number'?'cozy-number-prompt':''}>{r.prompt}</h3>}
     {r.hint&&<p className="cozy-game-hint"><strong>Hinweis</strong>{r.hint}</p>}
     {r.kind==='adventure'&&r.choices.length>0&&<ol className="cozy-choices">{r.choices.map((choice,i)=><li key={i}><b>{i+1}</b><span>{choice}</span><small>{r.votes[i]||0} Stimmen</small></li>)}</ol>}
    </>}
    {output.storageError&&<p className="cozy-game-error" role="alert">{output.storageError}</p>}
   </div>
   <footer className="cozy-game-footer">{r.phase==='running'?<><span>{r.kind==='adventure'?'Entscheidet gemeinsam':'Mach mit im Chat'} {r.kind==='word'?<><code>!play A</code> oder <code>{example}</code><small className="hangman-scoring">Wer das Wort vollständig löst, erhält 10 Punkte.</small></>:<code>{example}</code>}</span>{r.kind==='adventure'&&<small>{total} Stimmen</small>}</>:<span role="status">{r.phase==='paused'?'Kurze Pause · Gleich geht’s weiter':r.phase==='settling'?'Auswertung wird gespeichert. Antworten sind geschlossen.':'Danke fürs Mitspielen!'}</span>}</footer>
  </article>
 </section>;
}
