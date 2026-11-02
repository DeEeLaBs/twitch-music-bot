export function parseGreetingMedia(dataUrl:unknown,kind:unknown) {
 if(typeof dataUrl!=='string'||!['gif','sound'].includes(String(kind)))throw new Error('GIF oder Sound auswählen.');
 const match=/^data:(image\/gif|audio\/(?:mpeg|mp3|wav|x-wav|ogg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
 if(!match)throw new Error('Nur GIF, MP3, WAV oder OGG erlaubt.');
 const bytes=Buffer.from(match[2],'base64');
 if(!bytes.length||bytes.length>(kind==='gif'?8:12)*1024*1024)throw new Error('GIF maximal 8 MB, Sound maximal 12 MB.');
 const header=bytes.subarray(0,12).toString('ascii');
 if(kind==='gif') {
  if(match[1]!=='image/gif'||!/^GIF8[79]a/.test(header)||bytes.length<14||!bytes.readUInt16LE(6)||!bytes.readUInt16LE(8)||bytes.readUInt16LE(6)>4096||bytes.readUInt16LE(8)>4096||bytes[bytes.length-1]!==0x3b)throw new Error('Ungültige GIF-Datei (maximal 4096×4096 Pixel).');
  return {bytes,extension:'gif'};
 }
 const extension=match[1]==='audio/ogg'&&header.startsWith('OggS')?'ogg':/^audio\/(?:x-)?wav$/.test(match[1])&&header.startsWith('RIFF')&&header.slice(8,12)==='WAVE'?'wav':/^audio\/(mpeg|mp3)$/.test(match[1])&&(header.startsWith('ID3')||(bytes[0]===255&&(bytes[1]&224)===224))?'mp3':'';
 if(!extension)throw new Error('Dateiinhalt passt nicht zum Audioformat.');
 return {bytes,extension};
}
