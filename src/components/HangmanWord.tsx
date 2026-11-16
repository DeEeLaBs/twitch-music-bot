import type {PublicGameRound} from '../chatGames.ts';

export function HangmanDrawing({remaining}:{remaining:number}){
 const mistakes=Math.max(0,Math.min(8,8-remaining));
 const stages=[
  <path d="M16 112h92"/>,<path d="M34 112V16"/>,<path d="M34 16h54M34 36l20-20"/>,<path d="M88 16v18"/>,
  <g><circle cx="88" cy="46" r="12"/><path d="M84 48q4 5 8 0"/><path d="M84 42h.1m8 0h.1"/></g>,
  <path d="M88 58v28"/>,<path d="M88 65L70 76m18-11 18 11"/>,<path d="M88 86l-16 20m16-20 16 20"/>
 ];
 return <svg className="hangman-drawing" viewBox="0 0 128 128" role="img" aria-label={`${mistakes} von 8 Fehlversuchen`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="hangman-ground" d="M12 119h104"/>{stages.slice(0,mistakes).map((stage,i)=><g className="hangman-stroke" key={i}>{stage}</g>)}</svg>;
}

export function HangmanWord({round}:{round:PublicGameRound}){
 const state=round.word;
 const remaining=state?.remaining??8;
 const correct=state?.letters.filter(l=>l.correct)||[];
 const wrong=state?.letters.filter(l=>!l.correct)||[];
 return <div className="hangman-word">
  <div className="hangman-overview"><HangmanDrawing remaining={remaining}/><div><span className="cozy-game-eyebrow">Gemeinsam Galgenraten</span><strong className="hangman-remaining" role="status">{remaining} <span>von 8 Versuchen übrig</span></strong><p>{remaining>3?'Jeder richtige Buchstabe bringt euch weiter.':remaining>0?'Zusammen schafft ihr das noch!':'Keine Versuche mehr.'}</p></div></div>
  <div className="cozy-word" aria-label={`Wort: ${round.prompt}`}>{round.prompt.split(' ').map((word,i)=><span className="cozy-word-group" key={i}>{[...word].map((letter,j)=><span key={j} className={`cozy-letter${letter==='▢'?'':/[\p{L}\p{N}]/u.test(letter)?' is-revealed':' is-symbol'}`} aria-hidden="true">{letter==='▢'?'':letter}</span>)}</span>)}</div>
  <div className="hangman-guesses"><div><span>✓ Richtige Buchstaben</span><p>{correct.length?correct.map(l=><b key={l.value}>{l.value}</b>):'Noch keine'}</p></div><div><span>× Nicht im Wort</span><p>{wrong.length?wrong.map(l=><s key={l.value}>{l.value}</s>):'Noch keine'}</p></div></div>
  {!!state?.wrongWords.length&&<p className="hangman-wrong-words"><strong>Schon versucht:</strong> {state.wrongWords.join(' · ')}</p>}
 </div>;
}
