import { Bell, Users, Monitor, Volume2, Image, Plus, Save, Trash2, Play, Square, Search, MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {formatGreetingChat,type GreetingProfile,type GreetingSettings} from '../greetings.ts';
import { apiFetch } from '../apiClient.ts';
import { GreetingPlayback } from './GreetingWidget.tsx';
interface Snapshot {settings:GreetingSettings;status:string;streamId:string;queued:number;outputConnected:boolean;storageError:string}
async function request(url:string,body?:unknown) {
 const response=await apiFetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Anfrage fehlgeschlagen.');return data;
}
export function GreetingStudio() {
 const [settings,setSettings]=useState<GreetingSettings>({outputOverlayId:'',profiles:[]});
 const [status,setStatus]=useState<Snapshot|null>(null),[overlays,setOverlays]=useState<Array<{id:string;name:string;ready:boolean}>>([]);
 const [selected,setSelected]=useState(''),[login,setLogin]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const [preview,setPreview]=useState<{profile:GreetingProfile;until:number;id:string}|null>(null);
 const saved=useRef(''),[savedVersion,setSavedVersion]=useState(0);
 const dirty=!!saved.current&&JSON.stringify(settings)!==saved.current;
 const [filter,setFilter]=useState('');
 const visibleProfiles=settings.profiles.filter(p=>`${p.name} ${p.login}`.toLowerCase().includes(filter.toLowerCase()));
 const profile=settings.profiles.find(p=>p.userId===selected);
 useEffect(()=>{
  let stopped=false;
  void Promise.all([request('/api/v1/greetings'),request('/api/v1/overlays')]).then(async([data,list])=>{
   const documents=await Promise.all(list.overlays.map((item:{id:string})=>request(`/api/v1/overlays/${item.id}`)));
   if(stopped)return;
   setSettings(data.settings);saved.current=JSON.stringify(data.settings);setStatus(data);setSelected(data.settings.profiles[0]?.userId||'');
   setOverlays(documents.map(item=>({id:item.id,name:item.name,ready:!!item.options.scene?.widgets.some((w:{type:string;visible:boolean})=>w.type==='greeting'&&w.visible)})));
  }).catch(error=>{if(!stopped)setNote(error.message);});
  const timer=setInterval(()=>void request('/api/v1/greetings').then(data=>{if(!stopped)setStatus(data);}).catch(()=>{if(!stopped)setNote('Status konnte nicht aktualisiert werden.');}),5000);
  return()=>{stopped=true;clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!dirty)return;
  const leave=(event:Event)=>{if(!window.confirm('Ungespeicherte Begrüßungs-Einstellungen verwerfen?'))event.preventDefault();};
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('overlay:before-leave',leave);window.addEventListener('beforeunload',unload);
  return()=>{window.removeEventListener('overlay:before-leave',leave);window.removeEventListener('beforeunload',unload);};
 },[dirty,savedVersion]);
 const patch=(values:Partial<GreetingProfile>)=>setSettings(current=>({...current,profiles:current.profiles.map(p=>p.userId===selected?{...p,...values}:p)}));
 const save=async()=>{
  setBusy(true);setNote('');const submitted=structuredClone(settings);
  try{const data=await request('/api/v1/greetings',submitted);saved.current=JSON.stringify(data.settings);setSettings(data.settings);setStatus(data);setSavedVersion(n=>n+1);setNote('Begrüßungen gespeichert.');}
  catch(error){setNote((error as Error).message);}finally{setBusy(false);}
 };
 const add=async()=>{
  setBusy(true);setNote('');
  try{const person=await request(`/api/v1/greetings/resolve?login=${encodeURIComponent(login.trim().replace(/^@/,''))}`);
   setSettings(current=>current.profiles.some(p=>p.userId===person.userId)?current:{...current,profiles:[...current.profiles,{...person,enabled:true,soundEnabled:false,soundUrl:'',volume:50,gifEnabled:false,gifUrl:'',seconds:5,chatEnabled:false,chatMessage:''}]});
   setSelected(person.userId);setLogin('');setFilter('');
  }catch(error){setNote((error as Error).message);}finally{setBusy(false);}
 };
 const upload=async(file:File|undefined,kind:'gif'|'sound')=>{
  if(!file||!profile)return;setBusy(true);setNote('');
  try{
   if(file.size>(kind==='gif'?8:12)*1024*1024)throw new Error('GIF maximal 8 MB, Sound maximal 12 MB.');
   const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
   const extension=file.name.split('.').pop()?.toLowerCase();const mime=kind==='gif'?'image/gif':extension==='mp3'?'audio/mpeg':extension==='ogg'?'audio/ogg':'audio/wav';
   const result=await request('/api/v1/greetings/media',{kind,dataUrl:dataUrl.replace(/^data:[^;]*;/,`data:${mime};`)});
   patch(kind==='gif'?{gifUrl:result.url}:{soundUrl:result.url});setNote('Datei hochgeladen. Aktivieren und Einstellungen speichern.');
  }catch(error){setNote((error as Error).message);}finally{setBusy(false);}
 };
 return <section className="greeting-studio" aria-labelledby="greeting-heading">
  <header className="greeting-heading">
   <div><span className="greeting-eyebrow"><Bell size={14} aria-hidden="true"/> COMMUNITY</span><h2 id="greeting-heading">Persönliche Begrüßungen</h2><p>Ein besonderer Empfang bei der ersten Nachricht pro Stream.</p></div>
   <div className="greeting-statuses" aria-label="Verbindungsstatus">
    <span className={status?.status==='live'?'is-connected':''}><i/>{status?.status==='live'?'Stream live':status?.status==='offline'?'Stream offline':'Streamstatus unbekannt'}</span>
    <span className={status?.outputConnected?'is-connected':''}><i/>OBS {status?.outputConnected?'verbunden':'nicht verbunden'}</span>
    <span>{status?.queued||0} in Warteschlange</span>
   </div>
  </header>
  {status?.storageError&&<div className="greeting-notice is-error" role="alert">{status.storageError}</div>}
  {note&&<div className="greeting-notice" role="status">{note}</div>}
  {!saved.current&&!note&&<p role="status">Begrüßungen werden geladen …</p>}
  <fieldset className="greeting-controls" disabled={busy||!saved.current}>
   <section className="greeting-output" aria-labelledby="greeting-output-heading">
    <div className="greeting-section-intro"><span className="greeting-section-icon"><Monitor size={20} aria-hidden="true"/></span><div><h3 id="greeting-output-heading">Ausgabe im Stream</h3><p>Hier werden Sound und GIF für alle Personen ausgegeben.</p></div></div>
    <label className="greeting-field">Ausgabe-Overlay<select value={settings.outputOverlayId} onChange={e=>setSettings(current=>({...current,outputOverlayId:e.target.value}))}><option value="">Keine Ausgabe</option>{overlays.map(o=><option key={o.id} value={o.id}>{o.name}{o.ready?'':' · Widget fehlt'}</option>)}</select></label>
    <details className="greeting-help"><summary>So richtest du die Ausgabe ein</summary><p>Füge im Overlay-Designer das Widget <strong>Begrüßungen</strong> hinzu und wähle dieses Overlay hier aus. Öffne die OBS-Adresse als Browserquelle. Auch Begrüßungen nur mit Sound benötigen diese Quelle. Reine Chat-Begrüßungen funktionieren ohne OBS. Bei mehreren geöffneten Kopien spielt nur eine ab.</p></details>
    {settings.outputOverlayId&&overlays.some(o=>o.id===settings.outputOverlayId&&!o.ready)&&<p className="greeting-warning">In diesem Overlay fehlt ein sichtbares Begrüßungs-Widget.</p>}
   </section>
   <div className="greeting-workspace">
    <aside className="greeting-people" aria-labelledby="greeting-people-heading">
     <header className="greeting-section-title"><h3 id="greeting-people-heading"><Users size={18} aria-hidden="true"/>Personen</h3><span>{settings.profiles.length}</span></header>
     <form className="greeting-add" onSubmit={e=>{e.preventDefault();void add();}}>
      <label className="greeting-field">Twitch-Login<input autoComplete="off" placeholder="@zuschauername" value={login} onChange={e=>setLogin(e.target.value)} maxLength={26}/></label>
      <button className="greeting-primary" disabled={!login.trim()}><Plus size={16} aria-hidden="true"/>Person hinzufügen</button>
     </form>
     {settings.profiles.length>0&&<label className="greeting-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Personen durchsuchen" placeholder="Person suchen …" value={filter} onChange={e=>setFilter(e.target.value)}/></label>}
     <div className="greeting-person-list" aria-label="Personenliste">
      {visibleProfiles.map(p=><button type="button" className={`greeting-person${p.userId===selected?' is-selected':''}`} aria-pressed={p.userId===selected} key={p.userId} onClick={()=>{setPreview(null);setSelected(p.userId);}}>
       <span className="greeting-avatar" aria-hidden="true">{p.name.slice(0,1).toUpperCase()}</span><span className="greeting-person-text"><strong>{p.name}</strong><small>@{p.login}</small><span className="greeting-person-tags">{!p.enabled?'Pausiert':[p.soundEnabled&&'Sound',p.gifEnabled&&'GIF',p.chatEnabled&&'Chat'].filter(Boolean).join(' · ')||'Noch keine Ausgabe'}</span></span>
      </button>)}
      {settings.profiles.length===0&&<p className="greeting-list-empty">Füge deine erste Person über ihren Twitch-Namen hinzu.</p>}
      {settings.profiles.length>0&&visibleProfiles.length===0&&<p className="greeting-list-empty">Keine passende Person gefunden.</p>}
     </div>
    </aside>
    {profile?<section className="greeting-profile" aria-labelledby="greeting-person-heading">
     <header className="greeting-profile-heading"><div><span className="greeting-eyebrow">BEGRÜSSUNG BEARBEITEN</span><h3 id="greeting-person-heading">{profile.name}</h3><span className="greeting-handle">@{profile.login}</span></div><label className="greeting-toggle"><input type="checkbox" checked={profile.enabled} onChange={e=>patch({enabled:e.target.checked})}/><span>Begrüßung aktiv</span></label></header>
     <div className="greeting-media-grid">
      <section className="greeting-media" aria-labelledby="greeting-sound-heading">
       <h4 id="greeting-sound-heading"><Volume2 size={20} aria-hidden="true"/>Sound</h4><p>Spiele einen persönlichen Begrüßungssound ab.</p>
       <label className="greeting-toggle"><input type="checkbox" disabled={!profile.soundUrl} checked={profile.soundEnabled} onChange={e=>patch({soundEnabled:e.target.checked})}/><span>Sound aktivieren</span></label>
       <label className="greeting-upload">{profile.soundUrl?'Sound ersetzen':'Sound hochladen'}<input type="file" accept=".mp3,.wav,.ogg" onChange={e=>{void upload(e.target.files?.[0],'sound');e.target.value='';}}/><small>MP3, WAV oder OGG · maximal 12 MB</small></label>
       <span className="greeting-file-state">{profile.soundUrl?'Sound hinterlegt':'Noch kein Sound hinterlegt'}</span>
       <label className="greeting-field greeting-volume"><span>Lautstärke <output>{profile.volume}%</output></span><input type="range" aria-label="Lautstärke" min="0" max="100" value={profile.volume} onChange={e=>patch({volume:Number(e.target.value)})}/></label>
      </section>
      <section className="greeting-media" aria-labelledby="greeting-gif-heading">
       <h4 id="greeting-gif-heading"><Image size={20} aria-hidden="true"/>GIF</h4><p>Zeige eine Animation im Begrüßungs-Widget.</p>
       <label className="greeting-toggle"><input type="checkbox" disabled={!profile.gifUrl} checked={profile.gifEnabled} onChange={e=>patch({gifEnabled:e.target.checked})}/><span>GIF aktivieren</span></label>
       <label className="greeting-upload">{profile.gifUrl?'GIF ersetzen':'GIF hochladen'}<input type="file" accept=".gif" onChange={e=>{void upload(e.target.files?.[0],'gif');e.target.value='';}}/><small>Animiertes GIF · maximal 8 MB</small></label>
       <span className="greeting-file-state">{profile.gifUrl?'GIF hinterlegt':'Noch kein GIF hinterlegt'}</span>
       <label className="greeting-field">Begrüßungsdauer <span className="greeting-duration"><input type="number" min="1" max="30" value={profile.seconds} onChange={e=>patch({seconds:Number(e.target.value)})}/>Sekunden</span></label>
      </section>
     </div>
     <section className="greeting-chat greeting-media" aria-labelledby="greeting-chat-heading">
      <header><div><h4 id="greeting-chat-heading"><MessageSquare size={20} aria-hidden="true"/>Nachricht im Chat</h4><p>Begrüße die Person einmal pro Stream bei ihrer ersten Nachricht. Funktioniert auch ohne OBS.</p></div><label className="greeting-toggle"><input type="checkbox" checked={profile.chatEnabled===true} onChange={e=>patch({chatEnabled:e.target.checked})}/><span>Chat-Begrüßung aktivieren</span></label></header>
      <label className="greeting-field">Begrüßungstext<textarea aria-label="Begrüßungstext" rows={3} maxLength={250} value={profile.chatMessage||''} aria-describedby="greeting-chat-help" placeholder="Willkommen {user}, schön, dass du da bist!" onChange={e=>patch({chatMessage:e.target.value})}/></label>
      <div className="greeting-chat-help" id="greeting-chat-help"><span>Platzhalter: <code>{'{user}'}</code> = @Login · <code>{'{name}'}</code> = Anzeigename</span><span>{(profile.chatMessage||'').length}/250 Zeichen</span></div>
      {profile.chatEnabled&&!profile.chatMessage?.trim()&&<p className="greeting-warning">Gib einen Begrüßungstext ein, bevor du speicherst.</p>}
      <div className="greeting-chat-example"><span>Textvorschau · wird nicht gesendet</span><p>{formatGreetingChat(profile)||'Dein Begrüßungstext erscheint hier.'}</p></div>
     </section>
     <section className="greeting-preview-panel" aria-label="Lokale Vorschau">
      <header><div><h4>Sound- und GIF-Vorschau</h4><p>Medien nur hier abspielen. Der Chattext wird beim Test nicht gesendet.</p></div>{preview?<button type="button" onClick={()=>setPreview(null)}><Square size={15} aria-hidden="true"/>Stoppen</button>:<button type="button" disabled={!profile.soundEnabled&&!profile.gifEnabled} onClick={()=>setPreview({profile:structuredClone(profile),until:Date.now()+profile.seconds*1000,id:crypto.randomUUID()})}><Play size={15} aria-hidden="true"/>Vorschau testen</button>}</header>
      <div className="greeting-preview-stage">{preview?<><GreetingPlayback key={preview.id} profile={preview.profile} until={preview.until} onDone={()=>setPreview(null)} onError={()=>setNote('Eine Vorschau-Datei konnte nicht abgespielt werden. Datei und Browser-Audiofreigabe prüfen.')}/>{!preview.profile.gifEnabled&&<span><Volume2 size={28} aria-hidden="true"/>Sound-Vorschau läuft …</span>}</>:<span><Bell size={28} aria-hidden="true"/>{profile.soundEnabled||profile.gifEnabled?'Bereit für deine Vorschau':'Aktiviere Sound oder GIF, um die Begrüßung zu testen.'}</span>}</div>
     </section>
     <footer className="greeting-profile-footer"><small>Twitch-ID: {profile.userId}</small><button type="button" className="greeting-delete" onClick={()=>{if(window.confirm(`${profile.name} wirklich entfernen?`)){setSettings(current=>({...current,profiles:current.profiles.filter(p=>p.userId!==selected)}));setSelected('');setPreview(null);}}}><Trash2 size={15} aria-hidden="true"/>Person entfernen</button></footer>
    </section>:<div className="greeting-empty"><Users size={36} aria-hidden="true"/><h3>{settings.profiles.length?'Person auswählen':'Dein Chat. Deine Begrüßungen.'}</h3><p>{settings.profiles.length?'Wähle links eine Person, um Sound und GIF anzupassen.':'Füge links eine Person hinzu und gestalte ihren persönlichen Empfang mit Sound, GIF und einem Chattext.'}</p></div>}
   </div>
   <footer className="greeting-savebar"><div><strong>{!saved.current?'Einstellungen nicht geladen':busy?'Wird verarbeitet …':dirty?'Ungespeicherte Änderungen':'Alles gespeichert'}</strong><span>Sound, GIF und Chattext lassen sich getrennt aktivieren.</span></div><button type="button" className="greeting-primary" disabled={!dirty} onClick={()=>void save()}><Save size={16} aria-hidden="true"/>{busy?'Bitte warten …':'Änderungen speichern'}</button></footer>
  </fieldset>
 </section>;
}
