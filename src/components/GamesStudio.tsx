import {QuizShowSettings} from './QuizShowSettings.tsx';
import {OverlayAutosave,type AutosaveStatus} from '../overlayAutosave.ts';
import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../apiClient.ts';
import {GAME_LABELS,validateGames,type GameKind,type GameSettings,type GameSnapshot} from '../chatGames.ts';
import {GameContentEditor} from './GameContentEditor.tsx';
import {GameDisplay,GAME_PREVIEW,gamePreview} from './GamesWidget.tsx';
async function request(action:string,body:unknown={}):Promise<GameSnapshot>{const response=await apiFetch('/api/v1/games/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Spielanfrage fehlgeschlagen.');return data;}
export function GamesStudio(){
 const [state,setState]=useState<GameSnapshot|null>(null),[settings,setSettings]=useState<GameSettings>({seconds:30,minimum:1,maximum:100,quizzes:[],words:[],adventures:[]}),[kind,setKind]=useState<GameKind>('quiz'),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const [wordPreviewMistakes,setWordPreviewMistakes]=useState(5);
 const saver=useRef<OverlayAutosave<GameSettings>|null>(null);
 const [saveStatus,setSaveStatus]=useState<AutosaveStatus>({state:'saved',dirty:false});
 const version=useRef(0);
 const roundActive=!!state?.round;
 let validation='';
 try{validateGames(settings);}catch(e){validation=e instanceof Error?e.message:'Ungültige Einstellungen.';}
 const dirty=!!state&&(saveStatus.dirty||!!validation);
 useEffect(()=>{
  let stopped=false,polling=false;
  const poll=async()=>{
   if(polling)return;
   polling=true;
   const current=version.current;
   try{
    const next=await request('read');
    if(stopped||current!==version.current)return;
    setState(next);
    if(!saver.current){
     setSettings(next.settings);
     saver.current=new OverlayAutosave(next.settings,async draft=>{
      version.current++;
      try{
       const saved=await request('configure',{settings:draft});
       if(!stopped)setState(saved);
      }finally{version.current++;}
     },setSaveStatus,0);
    }
   }catch{if(!stopped)setNote('Spielstatus nicht erreichbar. Verbindung prüfen.');}
   finally{polling=false;}
  };
  void poll();
  const timer=setInterval(poll,1000);
  return()=>{stopped=true;clearInterval(timer);saver.current?.stop();saver.current=null;};
 },[]);
 useEffect(()=>{
  if(!saver.current||validation||roundActive)return;
  saver.current.update(settings);
 },[settings,validation,roundActive]);
 useEffect(()=>{
  if(!dirty)return;
  const leave=(event:Event)=>{
   if(validation){
    if(!confirm('Ungültige Spielinhalte verwerfen?'))event.preventDefault();
    return;
   }
   const navigation=event as CustomEvent<{waitUntil:(task:Promise<void>)=>void}>;
   const save=saver.current?.flush();
   if(save)navigation.detail.waitUntil(save);
  };
  const unload=(event:BeforeUnloadEvent)=>event.preventDefault();
  window.addEventListener('overlay:before-leave',leave);
  window.addEventListener('beforeunload',unload);
  return()=>{window.removeEventListener('overlay:before-leave',leave);window.removeEventListener('beforeunload',unload);};
 },[dirty,validation]);
 const act=async(action:string,body:unknown)=>{
  setBusy(true);version.current++;setNote('');
  try{setState(await request(action,body));}
  catch(e){setNote(e instanceof Error?e.message:'Spielaktion fehlgeschlagen.');}
  finally{version.current++;setBusy(false);}
 };
 const control=(action:string,choice?:number)=>void act('control',{action,choice,roundId:state?.round?.id,step:state?.round?.steps});
 const contents=kind==='quiz'?settings.quizzes.filter(q=>!settings.quizCategory||(q.category||'Allgemein')===settings.quizCategory).map(q=>({id:q.id,label:q.question})):kind==='word'?settings.words.map(w=>({id:w.id,label:w.word})):kind==='adventure'?settings.adventures.map(a=>({id:a.id,label:a.name})):[];
 const selectedId=contents.some(c=>c.id===selected)?selected:contents[0]?.id;
 const r=state?.round;
 const rules:Record<GameKind,string>={quiz:'Eine Antwort pro Person. Jede richtige Antwort erhält 10 Punkte nach der Auswertung.',number:'Ganze Zahl im eingestellten Bereich raten. Erste richtige Antwort: 10 Punkte. Maximal ein Tipp alle zwei Sekunden.',word:'Gemeinsam Galgenraten: !play A oder !play <Wort>. Acht Fehlversuche; Wiederholungen kosten nichts. Hinweis ab drei übrigen Versuchen. Wer das Wort vollständig löst, erhält 10 Punkte. Umlaute bleiben erhalten.',adventure:'Eine Stimme je Person und Entscheidung; Änderungen sind möglich. Mehrheit entscheidet, Gleichstände werden ausgelost. Keine individuellen Punkte.'};
 const command={quiz:'!quiz',number:'!zahlenraten',word:'!wortraten',adventure:'!abenteuer'}[kind];
 return <section className="games-studio games-compact">
 <header className="games-heading"><h2>Chat-Spiele</h2><span role="status">{!state?'Laden …':saveStatus.state==='error'?saveStatus.error:dirty?'Wird gespeichert …':'Gespeichert'}</span></header>
 <nav className="games-picker" aria-label="Spiel auswählen">{(Object.keys(GAME_LABELS) as GameKind[]).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>{setKind(k);setSelected('');}}><strong>{GAME_LABELS[k]}</strong><small>{({quiz:'Fragen & Antworten',number:'Zahl finden',word:'Wörter & Hinweise',adventure:'Gemeinsam entscheiden'})[k]}</small></button>)}</nav>
 {(note||state?.storageError)&&<p role="alert" className="greeting-notice">{note||state?.storageError}</p>}
 <div className="games-layout"><div className="games-main">
 <section className="games-card game-launch"><header><h3>{GAME_LABELS[kind]}</h3><code>{command}</code></header><p className="game-help">{rules[kind]}</p>
 {kind==='quiz'&&<label>Spielkategorie<select disabled={!!r||busy} value={settings.quizCategory||''} onChange={e=>setSettings({...settings,quizCategory:e.target.value})}><option value="">Alle Kategorien</option>{[...new Set(settings.quizzes.map(q=>q.category||'Allgemein'))].sort().map(c=><option key={c} value={c}>{c}</option>)}</select></label>}<div className="game-launch-row">{contents.length>0&&<label>{kind==='quiz'&&settings.quizShow?.enabled?'Frage wird automatisch ausgelost':'Inhalt'}<select disabled={!!r||busy||(kind==='quiz'&&settings.quizShow?.enabled)} value={selectedId} onChange={e=>setSelected(e.target.value)}>{contents.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></label>}
 <button className="is-primary" disabled={!state||busy||!!r||dirty||!!validation||!!state.storageError} onClick={()=>void act('start',{kind,contentId:selectedId,startToken:state?.startToken})}>Runde starten</button></div>
 {r&&<p className="game-help">Aktiv: {GAME_LABELS[r.kind]} · {r.phase==='running'?'Antwortphase':r.phase==='result'?'Ergebnis':r.phase==='paused'?'Pausiert':'Auswertung'}</p>}
 </section>
 <section className="games-card game-live"><header><h3>{r?'Laufende Runde':'Vorschau'}</h3>{r&&<span>{GAME_LABELS[r.kind]}</span>}</header>
 {!r&&kind==='word'&&<label>Vorschau · Fehlversuche<select value={wordPreviewMistakes} onChange={e=>setWordPreviewMistakes(Number(e.target.value))}>{Array.from({length:8},(_,i)=><option key={i} value={i}>{i} Fehler · {8-i} übrig</option>)}</select></label>}
 <div className="game-preview-frame"><GameDisplay output={r?state!:{...GAME_PREVIEW,...(kind==='quiz'?{quizShow:{level:0,used:[],jokers:[],design:settings.quizShow?.design||'classic',sound:settings.quizShow!}}:{}),round:gamePreview(kind,wordPreviewMistakes).round}} now={r?state!.serverNow:0}/></div>
 {r&&<div className="game-actions"><button className="is-primary" disabled={busy||r.phase==='result'} onClick={()=>control('finish')}>{r.phase==='settling'?'Speichern erneut versuchen':'Auswerten'}</button>{r.kind==='adventure'&&<button disabled={busy||!['running','paused'].includes(r.phase)} onClick={()=>control(r.phase==='paused'?'resume':'pause')}>{r.phase==='paused'?'Fortsetzen':'Pause'}</button>}<button disabled={busy||r.phase==='result'} onClick={()=>{if(confirm('Runde ohne weitere Punktevergabe abbrechen?'))control('cancel');}}>Abbrechen</button></div>}
 {(kind==='quiz'||r?.kind==='quiz')&&<div className="game-joker-controls"><span>Joker</span>{(['fifty','time','swap'] as const).map((joker,index)=><button key={joker} disabled={busy||!settings.quizShow?.enabled||r?.kind!=='quiz'||r.phase!=='running'||state!.serverNow>=r.deadline||state?.quizShow?.jokers.includes(joker)} onClick={()=>control(joker)}>{['50:50','+30 Sekunden','Fragenwechsel'][index]}{state?.quizShow?.jokers.includes(joker)?' · verbraucht':''}</button>)}<button disabled={busy||!!r} onClick={()=>{if(confirm('Alle Joker zurücksetzen?'))control('reset-show');}}>Zurücksetzen</button></div>}
 {r?.kind==='adventure'&&r.phase==='paused'&&<div className="game-actions">{r.choices.map((c,i)=><button key={i} disabled={busy} onClick={()=>control('choose',i+1)}>{i+1}: {c}</button>)}</div>}
 <p className="game-help"><code>!play &lt;Antwort&gt;</code> · <code>!points</code> · <code>!points top</code></p>
 </section>
 <section className="games-card game-settings"><h3>{GAME_LABELS[kind]} einstellen</h3><fieldset disabled={!state||busy||!!r}>
 <div className="game-form-row"><label>Rundenzeit (Sekunden)<input type="number" min={10} max={300} value={settings.seconds} onChange={e=>setSettings({...settings,seconds:Number(e.target.value)})}/></label>{kind==='number'&&<><label>Kleinste Zahl<input type="number" min={1} max={9999} value={settings.minimum} onChange={e=>setSettings({...settings,minimum:Number(e.target.value)})}/></label><label>Größte Zahl<input type="number" min={2} max={10000} value={settings.maximum} onChange={e=>setSettings({...settings,maximum:Number(e.target.value)})}/></label></>}</div>
 {kind==='quiz'&&<details className="game-design-settings"><summary>Design & Sounds</summary><QuizShowSettings value={settings.quizShow} onChange={quizShow=>setSettings({...settings,quizShow})}/></details>}
 {kind!=='number'&&<GameContentEditor key={kind} kind={kind} value={settings} onChange={setSettings}/>}
 {validation&&<p role="alert" className="game-validation">{validation}</p>}{saveStatus.state==='error'&&<button onClick={()=>void saver.current?.flush().catch(()=>{})}>Speichern erneut versuchen</button>}
 </fieldset>{r&&<p className="game-help">Einstellungen nach Ende der laufenden Runde verfügbar.</p>}</section>
 </div><aside className="games-card games-leaders"><h3>Rangliste</h3><p className="game-help">Gesamtpunkte · alle Spiele</p>{state?.leaders.length?<ol>{state.leaders.map((p,i)=><li key={p.id}><span>{i+1}</span><strong>{p.name}</strong><b>{p.points}</b></li>)}</ol>:<p className="game-help">Noch keine Punkte.</p>}</aside></div></section>;
}
