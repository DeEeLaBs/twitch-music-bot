import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GameService} from '../src/server/gameService.ts';
import {DEFAULT_GAMES} from '../src/server/gameDefaults.ts';
import {GameChat} from '../src/server/gameChat.ts';

function setup(t:{after:(fn:()=>void)=>void},word='Anna',hint='Geheimer Hinweis'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hangman-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let now=100000;let serial=0;const file=path.join(dir,'games.json');const s=new GameService(file,()=>now,()=>0);
 s.configure({...DEFAULT_GAMES,words:[{id:'test',word,hint}]});s.start('word',s.snapshot().startToken);
 return {s,file,time:(ms=2100)=>{now+=ms;},guess:(value:string,id=String(++serial))=>s.answer({id,name:'Viewer '+id},value),now:()=>now};
}
test('letters reveal every occurrence; shared duplicate guesses cost nothing; fifth mistake releases hint',t=>{
 const {s,guess,file}=setup(t);assert.ok(!JSON.stringify(s.output()).includes('Geheimer Hinweis'));
 guess('A');assert.equal(s.output().round!.prompt,'A▢▢a');
 guess('a');guess('X');guess('x');guess('Falsches Wort');guess('falsches wort');
 assert.equal(s.output().round!.word!.remaining,6);
 guess('Y');guess('Z');assert.equal(s.output().round!.hint,'');
 guess('Q');assert.equal(s.output().round!.word!.remaining,3);assert.equal(s.output().round!.hint,'Geheimer Hinweis');
 guess('V');assert.equal(s.output().round!.hint,'Geheimer Hinweis');
 guess('N','99');assert.equal(s.output().round!.phase,'result');assert.equal(s.points('99'),10);
 guess('Anna','88');s.finish(s.output().round!.id);assert.equal(s.points('99'),10);assert.equal(s.points('88'),0);
 assert.equal(new GameService(file).points('99'),10);
});
test('eight errors lose the shared round; punctuation and invalid guesses cost nothing',t=>{
 const {s,guess}=setup(t,'Ärger-Spaß 2','');
 assert.equal(s.output().round!.prompt,'▢▢▢▢▢-▢▢▢▢ ▢');
 for(const v of ['!!!','😀',' ','A!','a'.repeat(101),'<script>'])guess(v);
 assert.equal(s.output().round!.word!.remaining,8);
 guess('ä');guess('ß');guess('2');
 assert.equal(s.output().round!.prompt,'Ä▢▢▢▢-▢▢▢ß 2');
 for(const v of ['x','y','q','w','v','f','o','u'])guess(v);
 assert.equal(s.output().round!.phase,'result');assert.equal(s.output().round!.word!.remaining,0);
 assert.match(s.output().round!.result,/Ärger-Spaß 2/);assert.deepEqual(s.snapshot().leaders,[]);
 assert.equal(s.output().round!.hint,'');
});
test('whole-word normalization, cooldown, timeout, cancellation and failed settlement remain safe',t=>{
 const w=setup(t,'Ärger-Spaß');w.guess('a','1');w.guess('ä','1');
 assert.equal(w.s.output().round!.prompt,'▢▢▢▢▢-▢▢a▢');w.time();w.guess('ÄRGER-SPAẞ!!','1');
 assert.equal(w.s.points('1'),10);
 const timeout=setup(t);timeout.time(31000);timeout.guess('Anna');assert.equal(timeout.s.output().round!.phase,'result');assert.match(timeout.s.output().round!.result,/Zeit abgelaufen/);assert.equal(timeout.s.snapshot().leaders.length,0);
 const cancel=setup(t);cancel.s.control('cancel',cancel.s.output().round!.id);cancel.guess('Anna');assert.equal(cancel.s.output().round,null);assert.equal(cancel.s.snapshot().leaders.length,0);
 const failure=setup(t);const original=failure.file;fs.renameSync(original,original+'.saved');fs.mkdirSync(original);
 assert.throws(()=>failure.guess('Anna','99'),/gespeichert/);assert.equal(failure.s.output().round!.phase,'settling');assert.equal(failure.s.points('99'),0);
 fs.rmdirSync(original);failure.s.finish(failure.s.output().round!.id);failure.s.finish(failure.s.output().round!.id);assert.equal(failure.s.points('99'),10);
});
test('single-character solutions and canonically equivalent umlauts work without folding accents',t=>{
 const single=setup(t,'ß');single.guess('S');assert.equal(single.s.output().round!.word!.remaining,7);single.guess('ẞ','99');assert.equal(single.s.points('99'),10);
 const accents=setup(t,'Äpfel');accents.guess('A');assert.equal(accents.s.output().round!.prompt,'▢▢▢▢▢');accents.guess('A\u0308');assert.equal(accents.s.output().round!.prompt,'Ä▢▢▢▢');assert.equal(accents.s.output().round!.word!.remaining,7);
});
test('chat rejects stale messages and simultaneous repeated inputs count once across people',t=>{
 const w=setup(t);const chat=new GameChat(w.s,w.now);
 const message={id:'1',userId:'1',name:'Viewer',channel:'test',expectedChannel:'test',role:'viewer',at:w.now(),own:false,shared:false};
 chat.receive('!play X',{...message,at:w.now()-1000});assert.equal(w.s.output().round!.word!.remaining,8);
 for(let i=0;i<10;i++)chat.receive('!play X',{...message,id:String(i+2),userId:String(i+2)});
 assert.equal(w.s.output().round!.word!.remaining,7);assert.equal(w.s.output().round!.word!.letters.length,1);
 assert.ok(!JSON.stringify(w.s.output()).includes('Geheimer Hinweis'));
});
