import { useLayoutEffect, useState } from 'react';
import {bindNativeWindowControls,type CaptionOverlay} from '../windowChrome.ts';

export function DesktopWindowChrome({integratedHeader=false}:{integratedHeader?:boolean}) {
  const [active,setActive]=useState(false);
  useLayoutEffect(()=>bindNativeWindowControls(
    (navigator as Navigator & {windowControlsOverlay?:CaptionOverlay}).windowControlsOverlay,
    document.documentElement,window,setActive
  ),[]);
  return active?<div aria-hidden="true" className={`native-window-drag-region${integratedHeader?' is-integrated':''}`}/>:null;
}
