import { playGreetingSound } from '../greetingAudio.ts';
import { useEffect, useRef, useState } from 'react';
import { GreetingOutputGate, type GreetingDelivery } from '../greetingDelivery.ts';
import type { GreetingEvent, GreetingProfile } from '../greetings.ts';
export function GreetingPlayback({profile,until,onDone,onError}:{profile:GreetingProfile;until:number;onDone:()=>void;onError?:()=>void}) {
 const callback=useRef(onDone);callback.current=onDone;const errorCallback=useRef(onError);errorCallback.current=onError;
 const failures=useRef({sound:!profile.soundEnabled,gif:!profile.gifEnabled});
 useEffect(()=>{const timer=window.setTimeout(()=>callback.current(),Math.max(0,until-Date.now()));return()=>window.clearTimeout(timer);},[until]);
 useEffect(()=>{
  if(!profile.soundEnabled)return;
  return playGreetingSound(profile.soundUrl,profile.volume,()=>{errorCallback.current?.();failures.current.sound=true;if(failures.current.gif)callback.current();});
 },[profile.soundEnabled,profile.soundUrl,profile.volume]);
 return profile.gifEnabled?<img src={profile.gifUrl} alt={`Begrüßung für ${profile.name}`} style={{width:'100%',height:'100%',objectFit:'contain'}} onError={()=>{errorCallback.current?.();failures.current.gif=true;if(failures.current.sound)callback.current();}}/>:null;
}
export function GreetingWidget({token,overlayId,preview}:{token:string;overlayId:string;preview:boolean}) {
 const [active,setActive]=useState<{event:GreetingEvent;until:number}|null>(null);
 const client=useRef(crypto.randomUUID()),gate=useRef(new GreetingOutputGate());
 useEffect(()=>{
  if(preview||!token||!overlayId)return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  const poll=async()=>{
   const started=Date.now();
   try {
    const response=await fetch('/api/v1/greetings/output',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,overlayId,clientId:client.current,doneId:gate.current.doneId}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(3000)])});
    if(!response.ok)throw new Error('No output');
    const body=await response.json() as GreetingDelivery;
    if(!cancelled)setActive(gate.current.receive(body,started));
   }catch{if(!cancelled){gate.current.interrupt();setActive(null);}}
   if(!cancelled)timer=setTimeout(()=>void poll(),500);
  };
  void poll();return()=>{cancelled=true;controller.abort();clearTimeout(timer);};
 },[token,overlayId,preview]);
 if(preview)return <div className="greeting-placeholder">👋 Begrüßungen<br/><small>GIF · Sound · erste Nachricht</small></div>;
 return active?<GreetingPlayback key={active.event.id} profile={active.event.profile} until={active.until} onDone={()=>{gate.current.finish(active.event.id);setActive(current=>current?.event.id===active.event.id?null:current);}}/>:null;
}
