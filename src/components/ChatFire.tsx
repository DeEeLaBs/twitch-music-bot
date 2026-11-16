import {useLayoutEffect,useRef} from 'react';
import {chatFirePhase,stepChatFire} from '../chatFire.ts';

/** Short-lived, low-resolution heat simulation composited at device resolution. */
export function ChatFire({direction,duration,seed,targetSelector}:{direction:'in'|'out';duration:number;seed:string;targetSelector?:string}) {
 const ref=useRef<HTMLCanvasElement>(null);
 useLayoutEffect(()=>{
  const canvas=ref.current;
  const slot=canvas?.closest('.chat-fire-slot');
  const surface=slot?.querySelector<HTMLElement>(targetSelector || '.chat-message-surface');
  if(!canvas||!surface||duration<=0)return;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if(reduced?.matches)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const width=surface.offsetWidth,height=surface.offsetHeight;if(!width||!height)return;
  const ratio=Math.min(window.devicePixelRatio||1,1.5),cw=width+24,ch=height+48;
  canvas.width=Math.round(cw*ratio);canvas.height=Math.round(ch*ratio);
  canvas.style.width=`${cw}px`;canvas.style.height=`${ch}px`;canvas.style.left = (surface.offsetLeft - 12) + String.fromCharCode(112,120); canvas.style.top = (surface.offsetTop - 36) + String.fromCharCode(112,120); ctx.scale(ratio,ratio);
  const gw=Math.max(48,Math.min(224,Math.round(width*.45))),gh=56;
  const buffer=document.createElement('canvas');buffer.width=gw;buffer.height=gh;
  const bc=buffer.getContext('2d');if(!bc)return;
  const pixels=bc.createImageData(gw,gh);let heat=new Float32Array(gw*gh),next=new Float32Array(gw*gh);
  let state=seed.split('').reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,731)||731;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const palette=Array.from({length:256},(_,i)=>{const t=i/255;return [Math.min(255,Math.round(t*620)),Math.round(Math.max(0,t-.19)*310),Math.round(Math.max(0,t-.65)*450),Math.round(Math.min(1,Math.max(0,t-.09)*2.3)*255)];});
  let request=0,stopped=false,last=0,frame=0;const start=performance.now();
  const finish=()=>{stopped=true;window.cancelAnimationFrame(request);ctx.clearRect(0,0,cw,ch);};
  const onReduced=()=>{if(reduced?.matches)finish();};reduced?.addEventListener?.('change',onReduced);
  const draw=(now:number)=>{
   if(stopped)return;
   if((slot as HTMLElement).hidden){finish();return;}
   const elapsed=now-start,p=elapsed/duration;if(p>=1){finish();return;}
   if(now-last<1000/45){request=window.requestAnimationFrame(draw);return;}last=now;
   const phase=chatFirePhase(p,direction);
   // Four small updraft steps give newly ignited fuel a natural rising plume.
   for(let n=0;n<4;n++){stepChatFire(heat,next,gw,gh,phase.ignition,phase.fuel,frame++,random);[heat,next]=[next,heat];}
   for(let i=0;i<heat.length;i++){const color=palette[Math.min(255,Math.round(heat[i]))],at=i*4;pixels.data[at]=color[0];pixels.data[at+1]=color[1];pixels.data[at+2]=color[2];pixels.data[at+3]=color[3];}
   bc.putImageData(pixels,0,0);ctx.clearRect(0,0,cw,ch);
   const baseline=36+height*(1-phase.burnFront),flameHeight=Math.min(86,Math.max(54,height*.75));
   ctx.globalCompositeOperation='screen';ctx.filter='blur(5px)';ctx.globalAlpha=.32*phase.fuel;
   ctx.drawImage(buffer,12,baseline-flameHeight,width,flameHeight+4);
   ctx.filter='none';ctx.globalAlpha=phase.fuel;ctx.drawImage(buffer,12,baseline-flameHeight,width,flameHeight);
   for(let i=0;i<12;i++){
    const life=(p*1.4+i*.137)%1,x=12+width*((i*.173)%1),active=x/Math.max(width,1)<phase.ignition;
    if(!active)continue;
    ctx.globalAlpha=Math.sin(life*Math.PI)*phase.fuel*.8;
    ctx.fillStyle=direction==='out'&&life>.55?'#918577':'#ffd18a';
    ctx.fillRect(x+Math.sin(i*2.7+life*5)*12,baseline-life*90,life>.6?1:2,2);
   }
   ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';request=window.requestAnimationFrame(draw);
  };
  request=window.requestAnimationFrame(draw);
  return ()=>{finish();reduced?.removeEventListener?.('change',onReduced);};
 },[direction,duration,seed]);
 return <canvas ref={ref} className="chat-fire-canvas" aria-hidden="true"/>;
}
