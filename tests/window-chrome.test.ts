import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNativeWindowControls,type CaptionOverlay} from '../src/windowChrome.ts';
function fixture(){
 const values=new Map<string,string>();let enabled=false;
 const root={classList:{toggle:(_name:string,value:boolean)=>{enabled=value;},remove:()=>{enabled=false;}},style:{setProperty:(key:string,value:string)=>values.set(key,value),removeProperty:(key:string)=>values.delete(key)}} as unknown as HTMLElement;
 const viewport=Object.assign(new EventTarget(),{innerWidth:1000}) as unknown as Window;
 const overlay=Object.assign(new EventTarget(),{visible:true,getTitlebarAreaRect:()=>({width:852,right:852,height:40})}) as unknown as CaptionOverlay;
 return {values,root,viewport,overlay,enabled:()=>enabled};
}
test('normal browser rendering adds no desktop spacing or listeners',()=>{
 const w=fixture();let notified=false;
 const cleanup=bindNativeWindowControls(undefined,w.root,w.viewport,()=>{notified=true;});cleanup();
 assert.equal(w.enabled(),false);assert.equal(w.values.size,0);assert.equal(notified,false);
});
test('native geometry follows resize, hides correctly and removes listeners on teardown',()=>{
 const w=fixture();let active=false;
 const cleanup=bindNativeWindowControls(w.overlay,w.root,w.viewport,value=>{active=value;});
 assert.equal(active,true);assert.equal(w.values.get('--native-controls-right'),'148px');
 w.overlay.getTitlebarAreaRect=()=>({width:1200,right:1200,height:50}) as DOMRect;
 Object.assign(w.viewport,{innerWidth:1400});w.overlay.dispatchEvent(new Event('geometrychange'));
 assert.equal(w.values.get('--native-controls-right'),'200px');assert.equal(w.values.get('--native-controls-height'),'50px');
 w.overlay.visible=false;w.overlay.dispatchEvent(new Event('geometrychange'));assert.equal(active,false);assert.equal(w.enabled(),false);
 cleanup();assert.equal(w.values.size,0);
 w.overlay.visible=true;w.overlay.dispatchEvent(new Event('geometrychange'));assert.equal(w.enabled(),false);
});
