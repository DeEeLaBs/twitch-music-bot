import {useEffect,useState} from 'react';
import {wheelAngle,wheelProgress,type WheelSnapshot} from '../wheel.ts';
const demo:WheelSnapshot={fields:[{id:'a',text:'Gewinn 1',color:'#9333ea'},{id:'b',text:'Gewinn 2',color:'#0891b2'},{id:'c',text:'Noch einmal',color:'#e87924'}],phase:'ready',operationId:'preview',winner:null,startedAt:0,duration:6000,serverNow:0,storageError:''};
export function WheelFace({state,now,reduced=false}:{state:WheelSnapshot;now:number;reduced?:boolean}){
 if(state.phase==='hidden')return null;
 const n=state.fields.length,step=360/n;
 const progress=state.winner===null?0:state.phase==='result'?1:wheelProgress(state,now);
 const angle=state.winner===null?0:wheelAngle(state.winner,n)*(reduced?1:1-Math.pow(1-progress,4));
 const result=state.winner!==null&&progress>=1;
 return <div className="wheel-face" data-phase={state.phase} data-operation={state.operationId}>
  <svg viewBox="0 0 400 460" role="img" aria-label={result?`Ergebnis: ${state.fields[state.winner!].text}`:'Glücksrad'}>
   <g transform={`rotate(${angle} 200 205)`}>{state.fields.map((f,i)=>{
    const a=(i*step-90)*Math.PI/180,b=((i+1)*step-90)*Math.PI/180,m=((i+.5)*step-90)*Math.PI/180;
    return <g key={f.id}><path d={`M200 205 L${200+185*Math.cos(a)} ${205+185*Math.sin(a)} A185 185 0 ${step>180?1:0} 1 ${200+185*Math.cos(b)} ${205+185*Math.sin(b)} Z`} fill={f.color} stroke={result&&i===state.winner?'#fff':'#18181b'} strokeWidth={result&&i===state.winner?7:2}/><text x={200+115*Math.cos(m)} y={205+115*Math.sin(m)} transform={`rotate(${(i+.5)*step} ${200+115*Math.cos(m)} ${205+115*Math.sin(m)})`} textAnchor="middle" fill="white" stroke="#000" strokeWidth="3" paintOrder="stroke" fontSize={n>15?9:13} fontWeight="700">{f.text.length>18?f.text.slice(0,17)+'…':f.text}</text></g>;
   })}</g><circle cx="200" cy="205" r="20" fill="#18181b" stroke="#fff" strokeWidth="3"/><path d="M185 8 L215 8 L200 40 Z" fill="white" stroke="#18181b" strokeWidth="3"/>
  </svg>
  <div className="wheel-result" role="status">{result?state.fields[state.winner!].text:state.phase==='spinning'?'Das Rad dreht sich …':'Bereit zum Drehen'}</div>
 </div>;
}
export function WheelWidget({token,overlayId,preview}:{token:string;overlayId:string;preview:boolean}){
 const [data,setData]=useState<{state:WheelSnapshot;offset:number}|null>(null),[now,setNow]=useState(Date.now());
 const [previewState,setPreviewState]=useState(demo);
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{if(!preview)return;let stopped=false;const controller=new AbortController();const load=async()=>{try{const response=await fetch('/api/v1/wheel',{cache:'no-store',signal:controller.signal});if(!response.ok)return;const state:WheelSnapshot=await response.json();if(!stopped)setPreviewState({...state,phase:'ready',winner:null});}catch{}};void load();const timer=setInterval(load,2000);return()=>{stopped=true;controller.abort();clearInterval(timer);};},[preview]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(preview)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const poll=async()=>{const start=Date.now();try{const response=await fetch(`/api/v1/wheel/output?token=${encodeURIComponent(token)}&overlayId=${encodeURIComponent(overlayId)}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(3000)])});if(!response.ok)throw Error();const state:WheelSnapshot=await response.json();if(!stopped)setData({state,offset:state.serverNow-(start+Date.now())/2});}catch{if(!stopped)setData(null);}if(!stopped)timer=setTimeout(poll,300);};void poll();return()=>{stopped=true;controller.abort();clearTimeout(timer);};
 },[preview,token,overlayId]);
 useEffect(()=>{if(preview||!data||data.state.phase!=='spinning')return;let id:number;const tick=()=>{setNow(Date.now());id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);},[preview,data?.state.operationId,data?.state.phase]);
 return preview?<WheelFace state={previewState} now={0}/>:data?<WheelFace state={data.state} now={now+data.offset} reduced={reduced}/>:null;
}
