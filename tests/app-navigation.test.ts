import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreAppTab,saveAppTab} from '../src/appNavigation.ts';
const storage=(values:Record<string,string>={})=>({getItem:(key:string)=>values[key]??null,setItem:(key:string,value:string)=>{values[key]=value;}});
test('last view survives a fresh session and explicit valid links take precedence',()=>{
 const persistent=storage();saveAppTab('overlay',persistent,storage());
 assert.equal(restoreAppTab('',persistent,storage()),'overlay');
 assert.equal(restoreAppTab('?tab=games',persistent,storage()),'games');
 assert.equal(restoreAppTab('?tab=invalid',persistent,storage()),'overlay');
});
test('legacy views migrate and invalid or unavailable storage falls back safely',()=>{
 assert.equal(restoreAppTab('',storage(),storage({musicbot_activeTab:'diagnostics'})),'diagnostics');
 assert.equal(restoreAppTab('?tab=blacklist',storage()),'commands');
 assert.equal(restoreAppTab('?tab=spotify',storage()),'settings');
 assert.equal(restoreAppTab('',storage({musicbot_activeTab:'malformed'})),'player');
 const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
 assert.equal(restoreAppTab('',blocked),'player');assert.doesNotThrow(()=>saveAppTab('overlay',blocked));
});
