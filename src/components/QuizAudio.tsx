import {useEffect,useRef,useState} from 'react';
import type {GameOutput} from '../chatGames.ts';
import type {QuizShowSettings,QuizSound} from '../quizShow.ts';

export async function playQuizSound(kind:QuizSound,settings:QuizShowSettings) {
  if(settings.muted||settings.volume===0)return;
  const url=settings.sounds[kind];
  if(url){const audio=new Audio(url);audio.volume=settings.volume/100;await audio.play();return;}
  const context=new AudioContext();
  if(context.state==='suspended')await context.resume();
  if(context.state!=='running'){await context.close();throw Error('Audio blockiert. Browserquelle für Audio freigeben.');}
  const notes:Record<QuizSound,number[]>={question:[196,294,392],countdown:[440,440,440],reveal:[220,330,440],success:[262,330,392,523],failure:[294,247,196],joker:[392,523,392],complete:[262,330,392,523,659,784]};
  notes[kind].forEach((frequency,index)=>{
    const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+index*.14;
    oscillator.type='sine';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(settings.volume/100*.18,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.2);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start(at);oscillator.stop(at+.21);
  });
  setTimeout(()=>void context.close(),1600);
}

export function QuizAudio({output}:{output:GameOutput}){
  const seen=useRef<string|null>(null),baseline=useRef(false),lastPoll=useRef(0);
  const resultTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(resultTimer.current),[]);
  const [error,setError]=useState('');
  useEffect(()=>{
    const event=output.quizShow?.event,now=Date.now(),reconnected=now-lastPoll.current>2500;
    lastPoll.current=now;
    if(!baseline.current||reconnected){baseline.current=true;seen.current=event?.id||null;return;}
    if(!event||seen.current===event.id)return;
    seen.current=event.id;
    if(output.serverNow-event.at>2500)return;
    const settings=output.quizShow!.sound;
    const play=(kind:QuizSound)=>void playQuizSound(kind,settings).then(()=>setError('')).catch(()=>setError('Quiz-Audio konnte nicht abgespielt werden. Datei und Audiofreigabe prüfen.'));
    clearTimeout(resultTimer.current);
    if(['success','failure','complete'].includes(event.kind)){play('reveal');resultTimer.current=setTimeout(()=>play(event.kind),650);}
    else play(event.kind);
  },[output]);
  return error?<p role="status" className="quiz-audio-error">{error}</p>:null;
}
