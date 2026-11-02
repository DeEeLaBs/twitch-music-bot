export interface GreetingAudio {
 src:string;volume:number;play():Promise<void>;pause():void;
 addEventListener(type:'error',listener:()=>void):void;removeEventListener(type:'error',listener:()=>void):void;
}
export function playGreetingSound(url:string,volume:number,onError:()=>void,create:(url:string)=>GreetingAudio=url=>new Audio(url)) {
 const audio=create(url);let disposed=false;audio.volume=volume/100;
 const failed=()=>{if(!disposed)onError();};
 audio.addEventListener('error',failed);void audio.play().catch(failed);
 return()=>{disposed=true;audio.removeEventListener('error',failed);audio.pause();audio.src='';};
}
