import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import type {GameOutput} from '../src/chatGames.ts';

async function renderer(){
 const compiled=await build({stdin:{contents:`import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {GameDisplay,gamePreview} from './src/components/GamesWidget.tsx';export {gamePreview};export const render=(output,now=0)=>renderToStaticMarkup(createElement(GameDisplay,{output,now}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};
 new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 return module.exports as {render:(o:GameOutput,now?:number)=>string;gamePreview:(kind:'number'|'word'|'adventure'|'quiz',mistakes?:number)=>GameOutput};
}
test('cozy games render public prompts, votes and actual participation commands',async()=>{
 const {render,gamePreview}=await renderer();
 for(const kind of ['number','word','adventure'] as const){
  const output=gamePreview(kind);const html=render(output);
  assert.match(html,/cozy-game-card/);assert.match(html,/Mach mit im Chat|Entscheidet gemeinsam/);
  assert.match(html,/!play/);assert.ok(!html.includes('quiz-show'));
  if(kind==='number'){assert.match(html,/1 und 100/);assert.match(html,/größer als 25/);}
  if(kind==='word'){assert.match(html,/cozy-letter/);assert.match(html,/nach dem Regen/);assert.ok(!html.includes('Regenbogen'));}
  if(kind==='adventure'){assert.match(html,/4 Stimmen/);assert.match(html,/7 Stimmen/);assert.match(html,/Café/);}
 }
 const quiz=render(gamePreview('quiz'));assert.match(quiz,/cozy-classic-quiz/);assert.ok(!quiz.includes('cozy-game'));
 const show=render({...gamePreview('quiz'),quizShow:{level:0,used:[],jokers:[],design:'show',sound:{enabled:true,design:'show',volume:60,muted:true,sounds:{}}}});assert.match(show,/cozy-quiz/);assert.match(show,/quiz-answers/);assert.match(show,/quiz-jokers/);assert.match(show,/quiz-footer/);assert.ok(!show.includes('A:</b>'));assert.ok(!show.includes('quiz-title'));
});
test('cozy states hide participation after closing, escape user text and exit results',async()=>{
 const {render,gamePreview}=await renderer();
 const output=gamePreview('word');output.round!.prompt='▢▢-▢ ▢';
 assert.match(render(output),/is-symbol/);
 output.round!.phase='paused';output.round!.remaining=12000;
 assert.match(render(output),/Pausiert/);assert.ok(!render(output).includes('!play'));
 output.round!.phase='settling';output.storageError='Speichern fehlgeschlagen';
 assert.match(render(output),/role="alert"/);assert.match(render(output),/Antworten sind geschlossen/);
 output.round!.phase='result';output.round!.result='<script> gewinnt!';output.round!.until=8000;
 const result=render(output,7800);assert.match(result,/data-exiting="true"/);assert.match(result,/&lt;script&gt;/);assert.ok(!result.includes('cozy-letter'));
 assert.equal(render({...output,round:null}),'');
});


test('hangman view shows exactly eight drawing stages and only released hints',async()=>{
 const {render,gamePreview}=await renderer();
 for(let mistakes=0;mistakes<=8;mistakes++){
  const output=gamePreview('word',mistakes);const html=render(output);
  assert.equal((html.match(/class="hangman-stroke"/g)||[]).length,mistakes);
  assert.ok(html.includes(`${8-mistakes}`));
  assert.equal(html.includes('nach dem Regen'),mistakes>=5);
  assert.match(html,/Richtige Buchstaben/);assert.match(html,/Nicht im Wort/);
  assert.match(html,/!play A/);
 }
});
