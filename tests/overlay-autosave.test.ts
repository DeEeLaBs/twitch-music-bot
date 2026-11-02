import test from 'node:test';
import assert from 'node:assert/strict';
import { OverlayAutosave } from '../src/overlayAutosave.ts';
const delay=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('rapid edits save the latest design, serialize writes and flush before switching',async()=>{
 const writes:number[]=[];let finish:()=>void=()=>{};
 const save=new OverlayAutosave({value:0},async draft=>{writes.push(draft.value);if(writes.length===1)await new Promise<void>(resolve=>{finish=resolve;});},()=>{},10000);
 save.update({value:1});const flushed=save.flush();await delay();
 save.update({value:2});save.update({value:3});assert.deepEqual(writes,[1]);finish();await flushed;
 assert.deepEqual(writes,[1,3]);assert.equal(save.dirty,false);save.stop();
});
test('failed autosave retains the draft and retries without claiming a saved state',async()=>{
 let fail=true;const statuses:string[]=[];
 const save=new OverlayAutosave({value:0},async()=>{if(fail)throw new Error('offline');},status=>statuses.push(status.state),10000);
 save.update({value:1});await assert.rejects(save.flush(),/offline/);
 assert.equal(save.dirty,true);assert.equal(statuses.at(-1),'error');
 fail=false;await save.flush();assert.equal(save.dirty,false);assert.equal(statuses.at(-1),'saved');save.stop();
});
test('edits automatically save without pressing a button and teardown cancels queued work',async()=>{
 let writes=0;let finish:()=>void=()=>{};const done=new Promise<void>(resolve=>{finish=resolve;});
 const save=new OverlayAutosave({value:0},async()=>{writes++;finish();},()=>{},1);
 save.update({value:1});await done;await delay();assert.equal(writes,1);
 save.update({value:2});save.stop();await delay();assert.equal(writes,1);
});

test('an edit at the saved-notification boundary is included in the flush',async()=>{
 const writes:number[]=[];let injected=false;
 const save=new OverlayAutosave({value:0},async draft=>{writes.push(draft.value);},status=>{
  if(status.state==='saved'&&!injected){injected=true;save.update({value:2});}
 },10000);
 await save.flush();save.update({value:1});await save.flush();
 assert.deepEqual(writes,[1,2]);assert.equal(save.dirty,false);save.stop();
});
