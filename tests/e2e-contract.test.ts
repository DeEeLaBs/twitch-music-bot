import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/server/validation.ts';

test('v1.4 config schema accepts advanced controls and rejects malformed permissions',()=>{
 const patch=validateConfig({maxQueueSize:250,minSongDurationSeconds:15,preventRecentDuplicates:20,requestCooldownSeconds:5,globalRequestCooldownSeconds:1,logLevel:'debug',commandPermissions:{sr:['viewer','subscriber']},commandCooldowns:{sr:5}});
 assert.equal(patch.maxQueueSize,250); assert.equal(patch.logLevel,'debug');
 assert.throws(()=>validateConfig({commandPermissions:{sr:['admin']}}));
 assert.throws(()=>validateConfig({commandCooldowns:{sr:-1}}));
});
