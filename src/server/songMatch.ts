export interface SongMetadata {title:string;artist:string;duration?:number}
function normalized(value:string):string {
 return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[([](?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?)[)\]]/g,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
/** Conservative identity comparison; version qualifiers remain significant. */
export function sameSong(source:SongMetadata,candidate:SongMetadata):boolean {
 const title=normalized(source.title),artist=normalized(source.artist),duration=candidate.duration;
 if(typeof duration!=='number'||!Number.isFinite(duration)||duration<=0)return false;
 return !!title&&!!artist&&!/^(unknown artist|unknown|various artists|artist|unbekannt)$/.test(artist)
  &&title===normalized(candidate.title)&&artist===normalized(candidate.artist)
  &&(!source.duration||(Number.isFinite(source.duration)&&source.duration>0&&Math.abs(duration-source.duration)<=5));
}
export function chooseSongMatch<T extends SongMetadata & {id:string}>(source:SongMetadata,candidates:T[]):T|null {
 const matches=[...new Map(candidates.filter(item=>sameSong(source,item)).map(item=>[item.id,item])).values()];
 if(matches.length>1)throw new Error('Kein eindeutiger Treffer: mehrere passende Songs beim ausgewählten Dienst. Bitte einen direkten Link dieses Dienstes verwenden.');
 return matches[0]||null;
}
