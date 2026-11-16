import {useState} from 'react';
import {apiFetch} from '../apiClient.ts';
import {DEFAULT_QUIZ_SHOW,QUIZ_SOUNDS,type QuizShowSettings as Settings,type QuizSound} from '../quizShow.ts';
import {playQuizSound} from './QuizAudio.tsx';
const labels:Record<QuizSound,string>={question:'Fragenstart',countdown:'Letzte Sekunden',reveal:'Auflösung',success:'Runde gewonnen',failure:'Keine richtige Antwort',joker:'Joker',complete:'Leiter abgeschlossen'};
export function QuizShowSettings({value,onChange}:{value?:Settings;onChange:(value:Settings)=>void}){
 const settings=value||DEFAULT_QUIZ_SHOW,[error,setError]=useState(''),[uploading,setUploading]=useState(false);
 const upload=async(kind:QuizSound,file:File)=>{
  setUploading(true);setError('');
  try{
   if(file.size>5*1024*1024)throw Error('Maximal 5 MB pro Sound.');
   const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Datei konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
   const response=await apiFetch('/api/v1/greetings/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'sound',dataUrl})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Upload fehlgeschlagen.');
   onChange({...settings,sounds:{...settings.sounds,[kind]:data.url}});
  }catch(e){setError(e instanceof Error?e.message:'Upload fehlgeschlagen.');}finally{setUploading(false);}
 };
 return <section className="quiz-settings"><h3>Quizshow</h3>
 <label><input type="checkbox" checked={settings.enabled} onChange={e=>onChange({...settings,enabled:e.target.checked,design:e.target.checked?'show':settings.design})}/> Quizshow-Modus aktivieren</label>
 <p className="game-help">Fragen mit vier Antworten · persönliche Punkte wie bisher.</p>
 <label>Overlay-Design<select value={settings.design} onChange={e=>onChange({...settings,design:e.target.value as Settings['design']})}><option value="classic">Klassisch</option><option value="show">Quizshow</option></select></label>
 <label>Lautstärke {settings.volume}%<input type="range" min="0" max="100" value={settings.volume} onChange={e=>onChange({...settings,volume:Number(e.target.value)})}/></label>
 <label><input type="checkbox" checked={settings.muted} onChange={e=>onChange({...settings,muted:e.target.checked})}/> Stumm</label>
 {error&&<p role="alert">{error}</p>}
 {QUIZ_SOUNDS.map(kind=><div className="quiz-sound-row" key={kind}><strong>{labels[kind]}</strong><button type="button" onClick={()=>void playQuizSound(kind,settings).catch(()=>setError('Audio konnte nicht abgespielt werden.'))}>Anhören</button><label>MP3, WAV oder OGG<input type="file" accept=".mp3,.wav,.ogg" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(kind,file);e.target.value='';}}/></label><button type="button" disabled={!settings.sounds[kind]} onClick={()=>{const sounds={...settings.sounds};delete sounds[kind];onChange({...settings,sounds});}}>Standard</button></div>)}
 </section>;
}
