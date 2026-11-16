import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAT_STYLES} from '../src/overlayChat.ts';
import {mergeOverlayOptions} from '../src/overlayOptions.ts';
import {sceneFromLegacy} from '../src/scene.ts';
import {applyChatDesignPreset,chatDesignPreset,resetPlayerDesign} from '../src/overlayDesignPresets.ts';
test('every chat design has defaults; Ashen restores its complete coordinated appearance',()=>{
 for(const style of CHAT_STYLES){assert.equal(chatDesignPreset(style).style,style);assert.ok(chatDesignPreset(style).fontSize);}
 const preset=chatDesignPreset('ashen');assert.equal(preset.opacity,100);assert.equal(preset.background,'#000000');assert.equal(preset.showNameColors,false);assert.match(preset.fontFamily!,/Times New Roman/);
});
test('chat preset resets appearance but keeps filters, lifetime, frame and other widgets',()=>{
 const options=mergeOverlayOptions();options.scene=sceneFromLegacy(options.chat);
 options.chat={...options.chat,hideCommands:false,blockUsers:['bot'],lifetimeSeconds:90,style:'neon',fontSize:32};
 const id=options.scene.widgets[0].id;options.scene.widgets[0].css='invalid override';
 const reset=applyChatDesignPreset(options,'ashen',id);
 assert.equal(reset.chat.style,'ashen');assert.equal(reset.chat.fontSize,22);assert.equal(reset.chat.hideCommands,false);assert.deepEqual(reset.chat.blockUsers,['bot']);assert.equal(reset.chat.lifetimeSeconds,90);
 assert.deepEqual(reset.scene!.widgets[0].frame,options.scene.widgets[0].frame);assert.equal(reset.scene!.widgets[0].css,'');assert.equal(options.scene.widgets[0].css,'invalid override');assert.deepEqual(reset.alertBox.fonts,options.alertBox.fonts);
});
test('player reset keeps selected layout, theme, frame and unrelated settings',()=>{
 const options=mergeOverlayOptions({layout:'ashen',theme:'ashen',radius:40,fontFamily:'Custom',customCss:'override'});options.scene=sceneFromLegacy(options.chat);
 const reset=resetPlayerDesign(options,options.scene.widgets[0].id);
 assert.equal(reset.layout,'ashen');assert.equal(reset.theme,'ashen');assert.equal(reset.fontFamily,'');assert.equal(reset.customCss,'');assert.equal(reset.artworkScale,100);assert.deepEqual(reset.scene!.widgets[0].frame,options.scene.widgets[0].frame);assert.deepEqual(reset.chat,options.chat);
});
