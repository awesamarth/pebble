import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';

export type PrivateWorkState='queued'|'running'|'completed'|'failed'|'unknown';
export type PrivateWorkRequest={sourceId:string;scope:string;request:string};
export type PrivateWorkReceipt={id:string;state:PrivateWorkState};
export type PrivateWorkItem=PrivateWorkRequest & PrivateWorkReceipt & {createdAt:number;updatedAt:number;result?:string;issue?:string};
type Row={id:string;source_id:string;scope:string;request:string;state:PrivateWorkState;created:number;updated:number;result:string|null;issue:string|null};
/** Owner-only execution lane. Never pass listOwner results to a shared-channel agent. */
export class PrivateWorkQueue{
 private closed=false;
 private active?:{id:string;controller:AbortController};
 private draining?:Promise<void>;
 constructor(private db:Database,private execute:(request:Readonly<PrivateWorkRequest>,signal:AbortSignal)=>Promise<string>,private now=Date.now,private onCompleted?:(request:Readonly<PrivateWorkRequest>)=>Promise<void>|void){
  db.exec('CREATE TABLE IF NOT EXISTS private_work(id TEXT PRIMARY KEY,source_id TEXT UNIQUE NOT NULL,scope TEXT NOT NULL,request TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,result TEXT,issue TEXT)');
  db.query("UPDATE private_work SET state='unknown',updated=?,issue='Interrupted before completion. Review before trying again.' WHERE state IN ('queued','running')").run(now());
 }
 /** This receipt intentionally contains no private content, including on duplicate delivery. */
 enqueue(input:PrivateWorkRequest):PrivateWorkReceipt{
  if(this.closed)throw new Error('Private work is unavailable.');
  if(!input.sourceId?.trim()||input.sourceId.length>300||!input.scope?.trim()||input.scope.length>300||!input.request?.trim()||input.request.length>8000)throw new Error('Choose a valid owner request.');
  const receipt=this.db.transaction(()=>{
   const existing=this.db.query('SELECT id,state FROM private_work WHERE source_id=?').get(input.sourceId) as PrivateWorkReceipt|null;
   if(existing)return {id:existing.id,state:existing.state};
   const count=this.db.query("SELECT count(*) AS count FROM private_work WHERE state IN ('queued','running')").get() as {count:number};
   if(count.count>=5)throw new Error('Private work is busy. Try again after a task finishes.');
   const id=randomUUID(),time=this.now();
   this.db.query("INSERT INTO private_work(id,source_id,scope,request,state,created,updated) VALUES(?,?,?,?,'queued',?,?)").run(id,input.sourceId,input.scope,input.request,time,time);
   return {id,state:'queued' as const};
  })();
  this.start();return receipt;
 }
 listOwner(limit=50):PrivateWorkItem[]{
  return (this.db.query('SELECT * FROM private_work ORDER BY created DESC,rowid DESC LIMIT ?').all(Math.max(1,Math.min(100,Math.floor(limit)||50))) as Row[]).map(r=>({id:r.id,sourceId:r.source_id,scope:r.scope,request:r.request,state:r.state,createdAt:r.created,updatedAt:r.updated,...(r.result!==null?{result:r.result}:{}),...(r.issue!==null?{issue:r.issue}:{})}));
 }
 private start(){
  if(this.draining||this.closed)return;
  // Defer execution until enqueue has returned its content-free receipt.
  this.draining=Promise.resolve().then(()=>this.drain()).finally(()=>{
   this.draining=undefined;
   if(!this.closed&&this.db.query("SELECT id FROM private_work WHERE state='queued' LIMIT 1").get())this.start();
  });
 }
 private async drain(){
  while(!this.closed){
   const row=this.db.query("SELECT * FROM private_work WHERE state='queued' ORDER BY rowid LIMIT 1").get() as Row|null;
   if(!row)return;
   if(this.db.query("UPDATE private_work SET state='running',updated=? WHERE id=? AND state='queued'").run(this.now(),row.id).changes!==1)continue;
   const controller=new AbortController();this.active={id:row.id,controller};
   try{
    const result=await this.execute(Object.freeze({sourceId:row.source_id,scope:row.scope,request:row.request}),controller.signal);
    if(!controller.signal.aborted&&!this.closed){
     if(typeof result!=='string'||!result.trim())throw new Error('Missing result');
     const completed=this.db.query("UPDATE private_work SET state='completed',result=?,updated=? WHERE id=? AND state='running'").run(result.slice(0,30000),this.now(),row.id);
     if(completed.changes===1){try{await this.onCompleted?.(Object.freeze({sourceId:row.source_id,scope:row.scope,request:row.request}));}catch{/* Notification failure must not erase a completed private result. */}}
    }
   }catch{
    if(!this.closed&&!controller.signal.aborted)this.db.query("UPDATE private_work SET state='failed',issue='This task could not be completed. Review it privately before trying again.',updated=? WHERE id=? AND state='running'").run(this.now(),row.id);
   }finally{this.active=undefined;}
  }
 }
 /** Abort is advisory; an executor that ignores it cannot publish a late result. Does not close caller's DB. */
 interrupt(){
  this.active?.controller.abort();
  this.db.query("UPDATE private_work SET state='unknown',issue='Interrupted before completion. Review before trying again.',updated=? WHERE state IN ('queued','running')").run(this.now());
 }
 async close(){this.closed=true;this.interrupt();}
}
