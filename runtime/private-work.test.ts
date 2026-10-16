import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {PrivateWorkQueue} from './private-work';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('private work executes immutable owner requests serially, bounds intake and keeps receipts private',async()=>{
 const db=new Database(':memory:');const releases:Array<(text:string)=>void>=[];const seen:string[]=[];
 const queue=new PrivateWorkQueue(db,async(input)=>{expect(Object.isFrozen(input)).toBe(true);seen.push(input.request);return new Promise<string>(resolve=>releases.push(resolve));});
 const input={sourceId:'discord:one',scope:'owner:channel',request:'Find my travel email'};
 const receipt=queue.enqueue(input);input.request='mutated';
 expect(Object.keys(receipt).sort()).toEqual(['id','state']);
 expect(queue.enqueue({...input,request:'replacement'}).id).toBe(receipt.id);
 for(let n=2;n<=5;n++)queue.enqueue({sourceId:`discord:${n}`,scope:input.scope,request:`task ${n}`});
 expect(()=>queue.enqueue({sourceId:'overflow',scope:input.scope,request:'extra'})).toThrow('busy');
 await tick();expect(seen).toEqual(['Find my travel email']);
 releases.shift()!('Private mailbox result');await tick();expect(seen).toHaveLength(2);
 const completed=queue.listOwner().find(item=>item.id===receipt.id)!;expect(completed.result).toBe('Private mailbox result');expect(completed.state).toBe('completed');
 expect(queue.enqueue({sourceId:'discord:one',scope:input.scope,request:'again'})).toEqual({id:receipt.id,state:'completed'});
 await queue.close();releases.shift()!('late private result');await tick();
 expect(queue.listOwner().filter(item=>item.state==='unknown')).toHaveLength(4);
 expect(queue.listOwner().some(item=>item.result==='late private result')).toBe(false);
 // Caller retains its connection. Reopening never executes interrupted tasks.
 let replayed=false;const reopened=new PrivateWorkQueue(db,async()=>{replayed=true;return 'bad replay';});await tick();expect(replayed).toBe(false);await reopened.close();db.close();
});
test('executor failures are sanitized and startup marks persisted unfinished work unknown',async()=>{
 const db=new Database(':memory:');const queue=new PrivateWorkQueue(db,async()=>{throw new Error('secret mailbox error');});
 queue.enqueue({sourceId:'failure',scope:'channel',request:'Read mail'});await tick();
 expect(queue.listOwner()[0].state).toBe('failed');expect(JSON.stringify(queue.listOwner())).not.toContain('secret mailbox error');await queue.close();
 db.query("INSERT INTO private_work(id,source_id,scope,request,state,created,updated) VALUES('interrupted','interrupted','channel','private task','running',1,1)").run();
 const reopened=new PrivateWorkQueue(db,async()=>{throw new Error('must not run');});expect(reopened.listOwner().find(item=>item.id==='interrupted')?.state).toBe('unknown');await reopened.close();db.close();
});

test('completion callback receives only immutable original request once, and notification failure preserves result',async()=>{
 const db=new Database(':memory:');const seen:unknown[]=[];const queue=new PrivateWorkQueue(db,async()=> 'private result',Date.now,async request=>{expect(Object.isFrozen(request)).toBe(true);seen.push(request);throw new Error('notification unavailable');});
 const request={sourceId:'synthetic-complete',scope:'discord:fixture',request:'Check synthetic fixture and ping me when done'};queue.enqueue(request);await tick();queue.enqueue(request);await tick();expect(seen).toEqual([request]);expect(queue.listOwner()[0].state).toBe('completed');expect(queue.listOwner()[0].result).toBe('private result');await queue.close();db.close();
});
