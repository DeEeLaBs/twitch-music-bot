import type { GreetingEvent } from './greetings.ts';
export interface GreetingDelivery {event:GreetingEvent|null;serverNow:number;leaseUntil:number}
/** One browser must never restart an interrupted event or outlive the server's output lease. */
export class GreetingOutputGate {
 private played='';private active='';doneId='';
 receive(body:GreetingDelivery,requestStarted:number,now=Date.now()) {
  const event=body.event;
  if(!event){this.active='';this.doneId='';return null;}
  // Full round-trip subtraction is conservative: response transit never extends ownership.
  const until=requestStarted+Math.max(0,Math.min(event.endsAt,body.leaseUntil)-body.serverNow);
  if(until<=now||(this.played===event.id&&this.active!==event.id)){this.active='';this.doneId=event.id;return null;}
  this.played=event.id;this.active=event.id;this.doneId='';return {event,until};
 }
 interrupt(){if(this.active)this.doneId=this.active;this.active='';}
 finish(id:string){if(this.active===id){this.doneId=id;this.active='';}}
}
