import {useLayoutEffect,useRef,type RefObject} from 'react';
import {drawerFrame} from './drawerMotion.ts';

export function useDrawerMorph(open:boolean,drawerRef:RefObject<HTMLElement|null>,buttonRef:RefObject<HTMLButtonElement|null>,scrimRef:RefObject<HTMLDivElement|null>){
  const progress=useRef(0);
  useLayoutEffect(()=>{
    const drawer=drawerRef.current,button=buttonRef.current,scrim=scrimRef.current;
    if(!drawer||!button)return;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const image=drawer.querySelector<HTMLElement>('.drawer-hero-media');
    let origin=button.getBoundingClientRect(),panel={width:drawer.offsetWidth,height:drawer.offsetHeight};
    let frame=0;
    const target=open?1:0;
    const apply=(p:number)=>{
      progress.current=p;
      const values=drawerFrame(p,origin,panel);
      drawer.style.clipPath=values.clipPath;
      drawer.style.setProperty('--drawer-reveal',String(values.reveal));
      drawer.style.visibility=p>0||open?'visible':'hidden';
      drawer.style.pointerEvents=open?'auto':'none';
      if(image)image.style.transform=values.imageTransform;
      button.style.opacity=String(values.buttonOpacity);
      if(scrim)scrim.style.opacity=String(values.scrimOpacity);
    };
    const finish=()=>{cancelAnimationFrame(frame);apply(target);drawer.style.willChange='';if(image)image.style.willChange='';};
    const resize=()=>{origin=button.getBoundingClientRect();panel={width:drawer.offsetWidth,height:drawer.offsetHeight};apply(progress.current);};
    const preference=()=>{if(media.matches)finish();};
    window.addEventListener('resize',resize);media.addEventListener('change',preference);
    const from=progress.current,distance=target-from;
    if(media.matches||Math.abs(distance)<.001)finish();
    else{
      drawer.style.willChange='clip-path';if(image)image.style.willChange='transform';
      apply(from);
      const start=performance.now(),duration=Math.max(100,(open?600:440)*Math.abs(distance));
      const tick=(now:number)=>{
        const t=Math.min(1,(now-start)/duration);
        apply(from+distance*(1-(1-t)**3));
        if(t<1)frame=requestAnimationFrame(tick);else finish();
      };
      frame=requestAnimationFrame(tick);
    }
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);media.removeEventListener('change',preference);drawer.style.willChange='';if(image)image.style.willChange='';};
  },[open,drawerRef,buttonRef,scrimRef]);
}
