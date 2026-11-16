import test from 'node:test';
import assert from 'node:assert/strict';
import {chatFromParams,chatSearchParams,chatMotionDuration,DEFAULT_CHAT_OPTIONS,normalizeChat,chatPresence,sampleChatLine} from '../src/overlayChat.ts';
test('ember motion survives storage and OBS links in both directions',()=>{
 const options=normalizeChat({...DEFAULT_CHAT_OPTIONS,motion:'ember',exitMotion:'ember'});
 assert.equal(options.motion,'ember');assert.equal(options.exitMotion,'ember');
 const linked=chatFromParams(new URLSearchParams(chatSearchParams(options)));
 assert.equal(linked.motion,'ember');assert.equal(linked.exitMotion,'ember');
 assert.equal(chatMotionDuration('ember',180,'in'),800);assert.equal(chatMotionDuration('ember',180,'out'),900);
 assert.equal(chatMotionDuration('ember',360,'out'),1800);
 assert.equal(chatMotionDuration('ember',0,'out'),0);assert.equal(chatMotionDuration('none',180,'out'),0);assert.equal(chatMotionDuration('fade',250,'out'),250);
});
test('expired ember lines leave, while overflow, moderation removal and disabled motion do not linger',()=>{
 const line=sampleChatLine({id:'old',text:'old',ts:1000});const newer=sampleChatLine({id:'new',text:'new',ts:2000});
 const options={...DEFAULT_CHAT_OPTIONS,motion:'ember' as const,exitMotion:'ember' as const,lifetimeSeconds:1,maxLines:1};
 assert.deepEqual(chatPresence([line],new Set(['old']),options,2001).leaving,[line]);
 assert.deepEqual(chatPresence([line,newer],new Set(['old']),options,2000).leaving,[]);
 assert.deepEqual(chatPresence([],new Set(['old']),options,2001).leaving,[]);
 assert.deepEqual(chatPresence([line],new Set(['old']),{...options,fadeMs:0},2001).leaving,[]);
});
