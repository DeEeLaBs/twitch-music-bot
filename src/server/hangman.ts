import {normalizeGuess,type HangmanPublic} from '../chatGames.ts';

// This state never leaves the server. Only view() is included in overlay output.
export class Hangman {
 private solution:string;
 private hint:string;
 private letters=new Map<string,boolean>();
 private words=new Set<string>();
 private mistakes=0;
 constructor(solution:string,hint:string){this.solution=solution.normalize('NFKC');this.hint=hint;}
 guess(raw:string):'ignored'|'playing'|'won'|'lost' {
  const text=raw.normalize('NFKC').trim(),guess=normalizeGuess(text);
  if(!guess||!/[\p{L}\p{N}]/u.test(guess)||! /^[\p{L}\p{M}\p{N}\p{P}\s]+$/u.test(text))return 'ignored';
  if([...guess].length===1){
   if(!/^[\p{L}\p{N}]$/u.test(text)||this.letters.has(guess))return 'ignored';
   const correct=[...this.solution].some(c=>normalizeGuess(c)===guess);
   this.letters.set(guess,correct);if(!correct)this.mistakes++;
  }else{
   if(this.words.has(guess))return 'ignored';
   if(guess===normalizeGuess(this.solution))return 'won';
   this.words.add(guess);this.mistakes++;
  }
  if(this.mistakes>=8)return 'lost';
  return [...this.solution].every(c=>!/[\p{L}\p{N}]/u.test(c)||this.letters.get(normalizeGuess(c)))?'won':'playing';
 }
 view():{prompt:string;hint:string;word:HangmanPublic}{
  return {
   prompt:[...this.solution].map(c=>/[\p{L}\p{N}]/u.test(c)&&!this.letters.get(normalizeGuess(c))?'▢':c).join(''),
   hint:this.mistakes>=5?this.hint:'',
   word:{remaining:8-this.mistakes,maximum:8,letters:[...this.letters].map(([value,correct])=>({value,correct})),wrongWords:[...this.words]}
  };
 }
}
