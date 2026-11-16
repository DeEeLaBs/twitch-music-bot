import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GameService} from '../src/server/gameService.ts';
import {validateGames,normalizeGuess} from '../src/chatGames.ts';
import {DEFAULT_GAMES} from '../src/server/gameDefaults.ts';
import {QUIZ_CATALOG} from '../src/server/quizCatalog.ts';
import {GameChat} from '../src/server/gameChat.ts';
function setup(t:any,pick=0){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'games-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=100000;const file=path.join(dir,'games.json');const service=new GameService(file,()=>now,()=>pick);return {service,file,time:(ms:number)=>{now+=ms;}};}
const user=(id='1',name='Viewer')=>({id,name});
const start=(s:GameService,kind:string)=>s.start(kind,s.snapshot().startToken);

test('quiz start explains participation once through the existing chat output',t=>{
 const {service,time}=setup(t);
 const sent:string[]=[];
 service.startRuntime(message=>sent.push(message));
 t.after(()=>service.stopRuntime());
 const token=service.snapshot().startToken;
 service.start('quiz',token);
 service.start('quiz',token);
 (service as any).flush();
 assert.equal(sent.length,1);
 assert.match(sent[0],/!play A/);
 assert.match(sent[0],/eine Antwort pro Person/);
 assert.match(sent[0],/10 Punkte/);
 assert.match(sent[0],/!points top/);
 for(let i=0;i<4;i++){time(3000);(service as any).flush();}
 assert.equal(sent.length,1);
 const round=service.output().round!;
 assert.ok(!sent[0].includes(round.prompt));
 service.finish(round.id);
 time(3000);(service as any).flush();
 assert.match(sent.at(-1)!,/Quiz beendet/);
 assert.doesNotMatch(sent.at(-1)!,/Lösung:/);
});

test('quizshow persists ladder and jokers, hides solutions and scores once',t=>{
 const {service,file,time}=setup(t);
 service.configure({...service.snapshot().settings,quizShow:{enabled:true,design:'show',volume:60,muted:false,sounds:{}}});
 const round=start(service,'quiz').round!;
 const question=service.snapshot().settings.quizzes.find(q=>q.question===round.prompt)!;
 assert.equal(round.correct,undefined);
 service.joker('fifty',round.id);
 const hidden=service.output().round!.hidden!;
 assert.equal(hidden.length,2);
 assert.ok(!hidden.includes(question.correct));
 assert.throws(()=>service.answer(user('9'),'ABCD'[hidden[0]]),/entfernt/);
 service.answer(user(),'ABCD'[question.correct]);
 service.joker('time',round.id);
 assert.equal(service.output().round!.deadline,round.deadline+30000);
 assert.throws(()=>service.joker('time',round.id),/verfügbar/);
 service.finish(round.id);service.finish(round.id);
 assert.equal(service.points('1'),10);
 assert.equal(service.output().quizShow!.level,0);
 const restored=new GameService(file);
 assert.equal(restored.output().round,null);
 assert.equal(restored.points('1'),10);
 assert.equal(restored.output().quizShow!.jokers.length,2);
 assert.equal(restored.output().quizShow!.event,undefined);
 time(9000);
 const next=start(service,'quiz').round!;
 assert.notEqual(next.prompt,round.prompt);
 service.joker('swap',next.id);
 assert.notEqual(service.output().round!.id,next.id);
 assert.throws(()=>service.finish(next.id),/Veraltete/);
 service.finish(service.output().round!.id);
 assert.equal(service.output().quizShow!.level,0);
});
test('content pack fills an existing library once and preserves edits and points',t=>{
 const {file}=setup(t);
 const custom={...DEFAULT_GAMES.quizzes[0],question:'Meine eigene Frage'};
 const settings={...DEFAULT_GAMES,seconds:45,quizzes:[custom],words:DEFAULT_GAMES.words.slice(0,1),adventures:DEFAULT_GAMES.adventures.slice(0,1)};
 fs.writeFileSync(file,JSON.stringify({version:1,settings,scores:[{id:'1',name:'Viewer',points:20}],activeId:null,completed:[]}));
 const migrated=new GameService(file);
 const updated=migrated.snapshot().settings;
 assert.deepEqual(updated.quizzes[0],custom);
 assert.equal(updated.seconds,45);
 assert.equal(updated.quizzes.length,120);
 assert.equal(updated.words.length,25);
 assert.equal(updated.adventures.length,3);
 assert.equal(migrated.points('1'),20);
 migrated.configure({...updated,quizzes:updated.quizzes.slice(0,-1)});
 assert.equal(new GameService(file).snapshot().settings.quizzes.length,119);
});
test('quiz hides secrets, takes first answer and awards once across retry and restart',t=>{
 const w=setup(t);const s=w.service;const token=s.snapshot().startToken;const a=s.start('quiz',token);assert.equal(s.start('quiz',token).round?.id,a.round?.id);assert.throws(()=>start(s,'word'));
 assert.ok(!JSON.stringify(s.output()).includes('correct'));s.answer(user(),'1');s.answer(user(),'2');s.answer(user('2'),'2');w.time(31000);s.tick();assert.equal(s.snapshot().leaders.find(p=>p.id==='1')?.points,10);s.finish(a.round!.id);assert.equal(s.snapshot().leaders[0].points,10);
 const restarted=new GameService(w.file);assert.equal(restarted.snapshot().leaders[0].points,10);assert.equal(restarted.output().round,null);
});
test('number and word accept only first winner and enforce rate and normalization',t=>{
 const w=setup(t);const s=w.service;start(s,'number');s.answer(user(),'2');s.answer(user(),'1');assert.equal(s.snapshot().round?.phase,'running');w.time(2100);s.answer(user(),'1');s.answer(user('2'),'1');assert.equal(s.snapshot().leaders.length,1);
 w.time(8100);s.tick();start(s,'word');assert.ok(!JSON.stringify(s.output()).includes('Regenbogen'));s.answer(user(),'  REGENBOGEN!! ');assert.equal(s.snapshot().leaders[0].points,20);assert.equal(normalizeGuess(' Äpfel! '),'äpfel');assert.notEqual(normalizeGuess('Äpfel'),normalizeGuess('Apfel'));
});
test('adventure changes votes, resolves ties, pauses without votes and resumes',t=>{
 const w=setup(t,1);const s=w.service;start(s,'adventure');s.answer(user(),'1');w.time(2100);s.answer(user(),'2');s.answer(user('2'),'1');w.time(30000);s.tick();assert.equal(s.snapshot().round?.phase,'result');assert.equal(s.snapshot().leaders.length,0);
 w.time(8100);s.tick();const r=start(s,'adventure').round!;w.time(31000);s.tick();assert.equal(s.snapshot().round?.phase,'paused');s.control('choose',r.id,1);assert.equal(s.snapshot().round?.phase,'result');
});
test('failed settlement freezes input and retries atomically; interrupted round never awards',t=>{
 const w=setup(t);const s=w.service;const r=start(s,'number').round!;fs.unlinkSync(w.file);fs.mkdirSync(w.file);assert.throws(()=>s.answer(user(),'1'));assert.equal(s.snapshot().leaders.length,0);assert.equal(s.output().round?.phase,'settling');assert.throws(()=>s.answer(user('2'),'1'));fs.rmdirSync(w.file);s.finish(r.id);assert.equal(s.snapshot().leaders[0].id,'1');assert.equal(s.snapshot().leaders[0].points,10);s.finish(r.id);assert.equal(s.snapshot().leaders[0].points,10);
 w.time(8100);s.tick();start(s,'quiz');s.answer(user(),'1');const restarted=new GameService(w.file);assert.equal(restarted.snapshot().leaders[0].points,10);assert.equal(restarted.output().round,null);
});
test('validation rejects malformed adventures, limits and unsafe text',()=>{
 assert.deepEqual(validateGames(DEFAULT_GAMES),DEFAULT_GAMES);
 for(const config of [{...DEFAULT_GAMES,seconds:0},{...DEFAULT_GAMES,words:[{id:'x',word:'\nsecret',hint:''}]},{...DEFAULT_GAMES,adventures:[{id:'x',name:'Broken',entry:'missing',scenes:[]}]}])assert.throws(()=>validateGames(config));
});
test('cancel gives no points and stale round controls cannot affect next round',t=>{const w=setup(t);const s=w.service;const a=start(s,'quiz').round!;s.answer(user(),'1');s.control('cancel',a.id);assert.equal(s.snapshot().leaders.length,0);const b=start(s,'number').round!;assert.notEqual(a.id,b.id);assert.throws(()=>s.control('cancel',a.id));assert.equal(s.snapshot().round?.id,b.id);});
test('chat requires trusted fresh channel metadata, prevents duplicates and shares dashboard state',t=>{
 const w=setup(t);const chat=new GameChat(w.service,()=>100000);const message={id:'a',userId:'1',name:'Viewer',channel:'channel',expectedChannel:'channel',role:'viewer',at:100000,own:false,shared:false};
 chat.receive('!game start quiz',message);assert.equal(w.service.output().round,null);
 for(const patch of [{at:1},{channel:'other'},{own:true},{shared:true}])chat.receive('!game start quiz',{...message,...patch,role:'moderator'});
 assert.equal(w.service.output().round,null);chat.receive('!spiel start quiz',{...message,id:'start',role:'moderator'});assert.equal(w.service.output().round?.kind,'quiz');
 const id=w.service.output().round!.id;chat.receive('!game cancel',{...message,id:'start',role:'moderator'});assert.equal(w.service.output().round?.id,id);
 chat.receive('!antwort 1',{...message,id:'answer'});w.service.finish(id);assert.equal(w.service.points('1'),10);
});
test('failed content saves preserve settings; backup recovers scores; unreadable data is retained',t=>{
 const w=setup(t);const s=w.service;start(s,'number');s.answer(user(),'1');w.time(8100);s.tick();s.configure({...DEFAULT_GAMES,seconds:40});
 fs.writeFileSync(w.file,'broken');const recovered=new GameService(w.file);assert.equal(recovered.points('1'),10);
 fs.writeFileSync(w.file,'broken');fs.writeFileSync(w.file+'.backup','broken');const blocked=new GameService(w.file);assert.throws(()=>blocked.configure(DEFAULT_GAMES));assert.equal(fs.readFileSync(w.file,'utf8'),'broken');assert.ok(blocked.output().storageError);
});
test('adventure validates graphs and caps cycles; stale, invalid and late answers do not score',t=>{
 const w=setup(t);const s=w.service;
 const a={id:'cycle',name:'Loop',entry:'start',scenes:[{id:'start',text:'Weiter?',choices:[{text:'Loop',next:'start'},{text:'Ende',next:'end'}]},{id:'end',text:'Ende',choices:[]}]};
 s.configure({...DEFAULT_GAMES,adventures:[a]});start(s,'adventure');for(let i=0;i<31&&s.output().round?.phase==='running';i++){s.answer(user(),'1');w.time(31000);s.tick();}assert.equal(s.output().round?.phase,'result');assert.match(s.output().round!.result,/maximal/);assert.equal(s.snapshot().leaders.length,0);
 for(const adventure of [{...a,entry:'missing'},{...a,scenes:[{...a.scenes[0],choices:[{text:'Lost',next:'missing'}]},a.scenes[1]]},{...a,scenes:[{...a.scenes[0],choices:[{text:'Loop',next:'start'}]},a.scenes[1]]}])assert.throws(()=>validateGames({...DEFAULT_GAMES,adventures:[adventure]}));
 w.time(8100);s.tick();start(s,'quiz');s.answer(user(),'99');s.answer(user(),'not an option');w.time(31000);s.answer(user(),'1');assert.equal(s.snapshot().leaders.length,0);
});
test('identity is stable across renamed winners and repeated cancellation never awards',t=>{const w=setup(t);const s=w.service;start(s,'number');s.answer(user('1','Old name'),'1');w.time(8100);s.tick();start(s,'number');s.answer(user('1','New name'),'1');assert.deepEqual(s.snapshot().leaders,[{id:'1',name:'New name',points:20}]);});
test('runtime settles without overlay polling and caps chat output with a controlled clock',t=>{
 t.mock.timers.enable({apis:['setInterval']});const w=setup(t);const s=w.service;const sent:string[]=[];s.startRuntime(text=>sent.push(text));t.after(()=>s.stopRuntime());
 start(s,'quiz');s.answer(user(),'1');w.time(31000);t.mock.timers.tick(500);assert.equal(s.points('1'),10);assert.equal(s.output().round?.phase,'result');
 for(let i=0;i<20;i++)s.say('🎮 '+i+' '+'🌈'.repeat(120));
 for(let i=0;i<12;i++){w.time(2500);t.mock.timers.tick(500);}
 assert.ok(sent.every(text=>Buffer.byteLength(text)<=380&&!text.includes('�')));assert.ok(sent.length<=9);assert.equal(s.output().round,null);
});


test('catalog has ten categories, valid unique questions and persists category selection',t=>{
 const {service,file}=setup(t);
 assert.equal(QUIZ_CATALOG.length,100);
 assert.equal(new Set(QUIZ_CATALOG.map(q=>q.category)).size,10);
 assert.equal(new Set(QUIZ_CATALOG.map(q=>q.id)).size,100);
 assert.equal(new Set(QUIZ_CATALOG.map(q=>q.question)).size,100);
 validateGames({...DEFAULT_GAMES,quizzes:QUIZ_CATALOG});
 const settings=service.snapshot().settings;
 service.configure({...settings,quizCategory:'Gaming',quizShow:{enabled:true,design:'show',volume:60,muted:true,sounds:{}}});
 const round=start(service,'quiz').round!;
 assert.ok(QUIZ_CATALOG.some(q=>q.category==='Gaming'&&q.question===round.prompt));
 service.joker('swap',round.id);
 assert.ok(QUIZ_CATALOG.some(q=>q.category==='Gaming'&&q.question===service.output().round!.prompt));
 const restored=new GameService(file);
 assert.equal(restored.snapshot().settings.quizCategory,'Gaming');
 assert.equal(restored.snapshot().settings.quizzes.length,settings.quizzes.length);
 restored.configure({...restored.snapshot().settings,quizCategory:'missing'});
 assert.throws(()=>start(restored,'quiz'),/Kategorie/);
 assert.equal(restored.output().round,null);
});
test('classic quiz respects category and rejects oversized or malformed categories',t=>{
 const {service}=setup(t);
 service.configure({...service.snapshot().settings,quizCategory:'Sport'});
 const round=start(service,'quiz').round!;
 assert.ok(QUIZ_CATALOG.some(q=>q.category==='Sport'&&q.question===round.prompt));
 assert.throws(()=>validateGames({...DEFAULT_GAMES,quizCategory:'x'.repeat(61)}));
 assert.throws(()=>validateGames({...DEFAULT_GAMES,quizzes:[{...QUIZ_CATALOG[0],category:'bad\ncategory'}]}));
});
