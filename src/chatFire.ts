export const clampFire = (value:number) => Math.max(0,Math.min(1,value));
/** Entrance deliberately ignites the entire baseline before the surface rises. */
export function chatFirePhase(progress:number,direction:'in'|'out') {
 const p=clampFire(progress);
 if(direction==='in') return {ignition:clampFire(p/.28),rise:clampFire((p-.3)/.7),burnFront:0,fuel:p<.4?1:clampFire((1-p)/.6)};
 return {ignition:clampFire(p/.1),rise:1,burnFront:clampFire((p-.12)/.78),fuel:clampFire((1-p)/.24)};
}
export function stepChatFire(heat:Float32Array,next:Float32Array,width:number,height:number,ignition:number,fuel:number,frame:number,random:()=>number) {
 const base=(height-1)*width;
 for(let x=0;x<width;x++) heat[base+x]=x/width<ignition?fuel*(100+135*(.5+.5*Math.sin(x*.17+frame*.14)*Math.cos(x*.063-frame*.1))+random()*20):0;
 for(let y=0;y<height-1;y++) {
  const wind=Math.round(Math.sin(y*.16+frame*.09));
  for(let x=0;x<width;x++) {
   const sx=Math.max(1,Math.min(width-2,x+wind)),below=(y+1)*width,below2=Math.min(height-1,y+2)*width;
   next[y*width+x]=Math.max(0,(heat[below+sx-1]+heat[below+sx]+heat[below+sx+1]+heat[below2+sx])*.247-random()*5.5);
  }
 }
 for(let x=0;x<width;x++) next[base+x]=heat[base+x];
}
