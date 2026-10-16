/** Memory may summarize owner-authored facts, never credentials or source instructions. */
export function mayRememberOwnerText(text:string):boolean{
 return !!text.trim()&&text.length<=16000&&!/(?:do\s*not|don't|dont|never)\s+(?:save|store|remember)|(?:password|passphrase|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|private[ _-]?key|one[ -]?time[ -]?(?:password|code)|\botp\b|\bsk-[a-z0-9_-]{12,}|-----BEGIN)/i.test(text);
}
export function validateOwnerFact(source:string,fact:string){
 if(!mayRememberOwnerText(source)||!mayRememberOwnerText(fact)||!fact.trim()||fact.length>2000)throw new Error('This message is not eligible for durable memory.');
 // Instruction-like content and quoted/imported source blocks must never become owner facts.
 if(/(?:ignore|override)\s+(?:all |previous |system |the )*(?:instructions|rules)|\b(?:system prompt|developer message)\b/i.test(fact)||/^\s*(?:>|<[^>]+>|```)/m.test(source))throw new Error('Only owner-authored facts can be saved.');
 const stop=new Set(['the','a','an','i','my','me','we','our','you','your','owner','user','they','their','them','is','am','are','was','be','to','of','for','in','at','on','and','that','this','it']);
 const words=(value:string)=>(value.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).filter(word=>!stop.has(word)).map(word=>word.length>4?word.replace(/s$/,'' ):word);
 const sourceWords=new Set(words(source)),factWords=words(fact);
 if(!factWords.length||factWords.some(word=>!sourceWords.has(word)))throw new Error('Keep the fact grounded in the owner’s own words.');
}
