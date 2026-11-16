export interface WheelField {id:string;text:string;color:string}
export interface WheelSnapshot {fields:WheelField[];phase:'hidden'|'ready'|'spinning'|'result';operationId:string;winner:number|null;startedAt:number;duration:number;serverNow:number;storageError:string;lastResult?:string}
export function validateWheelFields(raw:unknown):WheelField[] {
 if(!Array.isArray(raw)||raw.length<2||raw.length>30)throw new Error('Bitte 2 bis 30 Radfelder anlegen.');
 const ids=new Set<string>();
 return raw.map(f=>{
  if(!f||typeof f.id!=='string'||!/^[\w-]{1,80}$/.test(f.id)||ids.has(f.id))throw new Error('Ungültige oder doppelte Feld-ID.');
  if(typeof f.text!=='string'||!f.text.trim()||f.text.length>80||/[\x00-\x1f\x7f]/.test(f.text))throw new Error('Feldtexte benötigen 1 bis 80 Zeichen ohne Steuerzeichen.');
  if(typeof f.color!=='string'||!/^#[\da-f]{6}$/i.test(f.color))throw new Error('Ungültige Feldfarbe.');
  ids.add(f.id);return {id:f.id,text:f.text.trim(),color:f.color};
 });
}
// Segments start at twelve o'clock and run clockwise. Land at the winner's centre.
export function wheelAngle(winner:number,count:number){return 360*6+360-(winner+.5)*360/count;}
export function wheelProgress(snapshot:WheelSnapshot,now:number){return Math.max(0,Math.min(1,(now-snapshot.startedAt)/snapshot.duration));}
