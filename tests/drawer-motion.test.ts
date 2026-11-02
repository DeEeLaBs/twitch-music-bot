import test from 'node:test';
import assert from 'node:assert/strict';
import {drawerFrame} from '../src/drawerMotion.ts';
const origin={left:12,top:8,width:56,height:56},panel={width:288,height:900};
test('drawer morph starts at the avatar and ends at the complete panel',()=>{
  const start=drawerFrame(0,origin,panel),end=drawerFrame(1,origin,panel);
  assert.equal(start.clipPath,'inset(8px 220px 836px 12px round 28px)');
  assert.equal(start.reveal,0);assert.equal(start.buttonOpacity,1);
  assert.equal(end.clipPath,'inset(0px 0px 0px 0px round 0px)');
  assert.equal(end.imageTransform,'translate(0px, 0px) scale(1)');
  assert.equal(end.reveal,1);assert.equal(end.buttonOpacity,0);
});
test('geometry adapts to resized panels and clamps progress endpoints',()=>{
  const resized={width:240,height:480};
  assert.equal(drawerFrame(0,origin,resized).clipPath,'inset(8px 172px 416px 12px round 28px)');
  assert.equal(drawerFrame(1,origin,resized).clipPath,'inset(0px 0px 0px 0px round 0px)');
  assert.deepEqual(drawerFrame(-1,origin,panel),drawerFrame(0,origin,panel));
  assert.deepEqual(drawerFrame(2,origin,panel),drawerFrame(1,origin,panel));
  const reveals=[0,.2,.36,.58,.78,1].map(p=>drawerFrame(p,origin,panel).reveal);
  assert.deepEqual(reveals,[...reveals].sort((a,b)=>a-b));
});
