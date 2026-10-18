import type {ChatMessage} from '../../runtime/contracts';

/** The view contains durable message_end entries, never generation partials. */
export class CompletedVoiceBlocks {
 private seen=new Set<string>();
 private accepting=false;
 start(messages:ChatMessage[]){this.seen=new Set(messages.map(m=>m.id));this.accepting=true;}
 interrupt(messages:ChatMessage[]){for(const m of messages)this.seen.add(m.id);this.accepting=false;}
 resume(messages:ChatMessage[]){for(const m of messages)this.seen.add(m.id);this.accepting=true;}
 take(messages:ChatMessage[]){const blocks:ChatMessage[]=[];for(const message of messages){if(this.seen.has(message.id))continue;this.seen.add(message.id);if(this.accepting&&message.role==='assistant'&&!message.failed&&message.text.trim())blocks.push(message);}return blocks;}
}

/** Energy VAD: require sustained speech, then finalize after a quiet pause. */
export class SpeechGate {
 private above=0;private began=0;private lastLoud=0;private speaking=false;
 reset(){this.above=0;this.began=0;this.lastLoud=0;this.speaking=false;}
 update(level:number,now:number):'start'|'end'|undefined {
  if(level>=0.025){if(!this.above)this.above=now;this.lastLoud=now;if(!this.speaking&&now-this.above>=160){this.speaking=true;this.began=this.above;return 'start';}}
  else this.above=0;
  if(this.speaking&&(now-this.lastLoud>=1100||now-this.began>=28000)){this.reset();return 'end';}
 }
}
