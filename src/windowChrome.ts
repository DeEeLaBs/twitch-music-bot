export interface CaptionOverlay extends EventTarget {
  visible: boolean;
  getTitlebarAreaRect(): DOMRect;
}

/** Binds the native caption geometry without giving the renderer window controls. */
export function bindNativeWindowControls(
  overlay: CaptionOverlay | undefined,
  root: Pick<HTMLElement,'classList'|'style'>,
  viewport: Pick<Window,'innerWidth'|'addEventListener'|'removeEventListener'>,
  onActive: (active:boolean)=>void
):()=>void {
  if(!overlay)return()=>{};
  const update=()=>{
    const area=overlay.getTitlebarAreaRect();
    const active=overlay.visible&&area.width>0&&area.height>0;
    root.classList.toggle('has-native-window-controls',active);
    if(active){
      root.style.setProperty('--native-controls-right',`${Math.max(0,viewport.innerWidth-area.right)}px`);
      root.style.setProperty('--native-controls-height',`${area.height}px`);
    }
    onActive(active);
  };
  update();overlay.addEventListener('geometrychange',update);viewport.addEventListener('resize',update);
  return()=>{
    overlay.removeEventListener('geometrychange',update);viewport.removeEventListener('resize',update);
    root.classList.remove('has-native-window-controls');
    root.style.removeProperty('--native-controls-right');root.style.removeProperty('--native-controls-height');
  };
}
