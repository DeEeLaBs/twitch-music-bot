import fs from 'node:fs';
import path from 'node:path';
import {randomInt,randomUUID} from 'node:crypto';
import {writeJson} from './atomicStore.ts';
import {validateWheelFields,type WheelField,type WheelSnapshot} from '../wheel.ts';
export class WheelService {
 private fields:WheelField[]=[{id:'one',text:'Gewinn 1',color:'#9333ea'},{id:'two',text:'Gewinn 2',color:'#0891b2'}];
 private state:Omit<WheelSnapshot,'serverNow'|'storageError'>;
 private error='';private blocked=false;
 private file:string;private now:()=>number;private pick:(max:number)=>number;
 constructor(file=path.join(process.cwd(),'data/wheel.json'),now=Date.now,pick=randomInt){
  this.file=file;this.now=now;this.pick=pick;
  let loaded=false;
  for(const candidate of [file,file+'.backup']){if(!fs.existsSync(candidate))continue;try{const raw=JSON.parse(fs.readFileSync(candidate,'utf8'));if(raw.version!==1)throw Error();this.fields=validateWheelFields(raw.fields);if(candidate!==file)writeJson(file,{version:1,fields:this.fields},{strictAtomic:true,preserveBackup:true});loaded=true;break;}catch{}}
  if(!loaded&&(fs.existsSync(file)||fs.existsSync(file+'.backup'))){this.blocked=true;this.error='Glücksrad-Speicher unlesbar. Originaldatei oder Backup wiederherstellen.';}
  this.state={fields:this.fields,phase:'hidden',operationId:'',winner:null,startedAt:0,duration:6000};
 }
 snapshot():WheelSnapshot{
  const now=this.now();if(this.state.phase==='spinning'&&now>=this.state.startedAt+this.state.duration)this.state.phase='result';
  if(this.state.phase==='result'&&now>=this.state.startedAt+this.state.duration+5000)this.state.phase='hidden';
  return structuredClone({...this.state,serverNow:now,storageError:this.error});
 }
 configure(raw:unknown){
  const phase=this.snapshot().phase;if(phase==='spinning'||phase==='result')throw new Error('Während der Drehung und Ergebnisanzeige können Felder nicht geändert werden.');
  if(this.blocked)throw new Error(this.error);
  const fields=validateWheelFields(raw);
  try{writeJson(this.file,{version:1,fields},{strictAtomic:true});}catch{this.error='Speichern fehlgeschlagen. Der gespeicherte Stand bleibt erhalten.';throw new Error(this.error);}
  this.error='';this.fields=fields;this.state={...this.state,fields,phase:'hidden',operationId:''};return this.snapshot();
 }
 show(){const phase=this.snapshot().phase;if(phase==='spinning'||phase==='result')throw new Error('Bitte die laufende Drehung abwarten.');if(this.blocked)throw new Error(this.error);if(phase==='ready')return this.snapshot();this.state={...this.state,fields:structuredClone(this.fields),phase:'ready',operationId:randomUUID(),winner:null};return this.snapshot();}
 spin(id:unknown){
  const state=this.snapshot();if(typeof id!=='string'||id!==state.operationId)throw new Error('Veraltete Dreh-Anfrage. Status aktualisieren.');
  if(state.phase==='spinning'||state.phase==='result')return state;
  if(state.phase!=='ready')throw new Error('Das Rad zuerst einblenden.');
  const winner=this.pick(state.fields.length);if(!Number.isInteger(winner)||winner<0||winner>=state.fields.length)throw new Error('Auslosung fehlgeschlagen.');
  this.state={...this.state,phase:'spinning',winner,startedAt:this.now(),lastResult:state.fields[winner].text};return this.snapshot();
 }
 hide(){if(this.snapshot().phase==='spinning')throw new Error('Bitte die laufende Drehung abwarten.');this.state.phase='hidden';return this.snapshot();}
}
let service:WheelService|undefined;
export const getWheelService=()=>service??=new WheelService();
