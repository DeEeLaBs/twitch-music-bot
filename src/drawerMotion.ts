const clamp=(value:number)=>Math.min(1,Math.max(0,value));
function fade(start:number,end:number,value:number){const t=clamp((value-start)/(end-start));return t*t*(3-2*t);}

/** Reveal the fixed-size panel without resizing/reflowing its contents. */
export function drawerFrame(progress:number,origin:{left:number;top:number;width:number;height:number},panel:{width:number;height:number}){
  const p=clamp(progress),widen=clamp(p/.58),drop=clamp((p-.36)/.64);
  const width=origin.width+(panel.width-origin.width)*widen;
  const square=origin.height+(panel.width-origin.height)*widen;
  const height=square+(panel.height-square)*drop;
  const left=origin.left*(1-widen),top=origin.top*(1-widen);
  const radius=Math.min(width,height)/2*(1-fade(.42,.9,p));
  return {
    clipPath:`inset(${top}px ${Math.max(0,panel.width-left-width)}px ${Math.max(0,panel.height-top-height)}px ${left}px round ${radius}px)`,
    imageTransform:`translate(${left}px, ${top}px) scale(${width/panel.width})`,
    reveal:fade(.46,.78,p),buttonOpacity:Math.max(0,1-p/.2),scrimOpacity:fade(.08,.62,p),
  };
}
