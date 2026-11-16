import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {placeWidget,sceneFromLegacy,normalizeScene} from '../src/scene.ts';
test('game defaults and solutions are excluded from both browser component bundles',async()=>{
 for(const entry of ['GamesWidget','GamesStudio']){
  const result=await build({entryPoints:[path.resolve(`src/components/${entry}.tsx`)],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,loader:{'.css':'empty'}});
  assert.ok(!Object.keys(result.metafile!.inputs).some(file=>file.endsWith('gameDefaults.ts')));
  assert.ok(!result.outputFiles[0].text.includes('Regenbogen'));
 }
});
test('games widget survives overlay scene normalization while preserving other widgets',()=>{
 const original=sceneFromLegacy({enabled:true,x:0,y:0,width:30,height:50});const scene=placeWidget(original,'games');const restored=normalizeScene(JSON.parse(JSON.stringify(scene)))!;
 assert.ok(restored.widgets.some(w=>w.type==='games'&&w.frame.width>=280));for(const widget of original.widgets)assert.ok(restored.widgets.some(w=>w.id===widget.id));
});
