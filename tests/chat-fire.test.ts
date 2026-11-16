import test from 'node:test';
import assert from 'node:assert/strict';
import {chatFirePhase,stepChatFire} from '../src/chatFire.ts';
test('fire ignites left to right completely before the message rises',()=>{
 const start=chatFirePhase(0,'in'),middle=chatFirePhase(.14,'in'),ignited=chatFirePhase(.28,'in'),rise=chatFirePhase(.6,'in');
 assert.equal(start.ignition,0);assert.equal(start.rise,0);
 assert.equal(middle.ignition,.5);assert.equal(middle.rise,0);
 assert.equal(ignited.ignition,1);assert.equal(ignited.rise,0);
 assert.ok(rise.rise>0);assert.equal(chatFirePhase(1,'in').fuel,0);
 assert.equal(chatFirePhase(1,'out').fuel,0);assert.equal(chatFirePhase(1,'out').burnFront,1);
});
test('heat simulation only fuels the ignited region and cools completely without fuel',()=>{
 const width=40,height=24;let heat=new Float32Array(width*height),next=new Float32Array(width*height);
 stepChatFire(heat,next,width,height,.25,1,0,()=>.5);
 assert.ok(next[(height-1)*width+5]>0);assert.equal(next[(height-1)*width+30],0);
 [heat,next]=[next,heat];
 for(let frame=0;frame<200;frame++){stepChatFire(heat,next,width,height,1,0,frame,()=>.5);[heat,next]=[next,heat];}
 assert.ok(heat.every(value=>value===0));
});
