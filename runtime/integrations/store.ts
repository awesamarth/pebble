import {discordPreferences,type DiscordPreferences} from './discord-preferences';
import {Database} from 'bun:sqlite';
import {createHash,randomUUID} from 'node:crypto';
export type IntakeEvent={provider:'gmail'|'discord';account:string;externalId:string;sourceId:string;text:string;metadata:Record<string,string>;receivedAt:number};
export type OutboundDraft={provider:'gmail'|'discord'|'browser';account:string;destination:string;subject?:string;content:string;guildId?:string};
export type Approval={id:string;digest:string;draft:OutboundDraft;state:'pending'|'rejected'|'executing'|'succeeded'|'unknown'|'expired';createdAt:number;expiresAt:number;receipt?:string};
const digest=(draft:OutboundDraft)=>createHash('sha256').update(JSON.stringify([draft.provider,draft.account,draft.destination,draft.subject??'',draft.content,draft.guildId??''])).digest('hex');
/** One owner process. Immutable drafts; no automatic retry after ambiguous external effects. */
export class IntegrationStore{
 private db:Database;
 constructor(path:string,private now=Date.now){this.db=new Database(path,{create:true});this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,synced INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cursors(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,digest TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,receipt TEXT);');this.db.exec("CREATE TABLE IF NOT EXISTS discord_replies(id TEXT PRIMARY KEY,scope TEXT NOT NULL,input TEXT NOT NULL,output TEXT,state TEXT NOT NULL,receipt TEXT);");this.db.query("UPDATE discord_replies SET state='unknown' WHERE state IN ('queued','generating','sending')").run();this.db.query("UPDATE approvals SET state='unknown' WHERE state='executing'").run();}
 discordPreferences():DiscordPreferences|undefined{const row=this.db.query('SELECT value FROM preferences WHERE key=?').get('discord') as {value:string}|null;return row?discordPreferences(JSON.parse(row.value)):undefined;}
 saveDiscordPreferences(value:DiscordPreferences){const safe=discordPreferences(value);this.db.query('INSERT INTO preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('discord',JSON.stringify(safe));return safe;}
 discordScopeSuggestions(){return (this.db.query("SELECT DISTINCT json_extract(payload,'$.metadata.guildId') AS guildId,json_extract(payload,'$.metadata.channelId') AS channelId FROM events WHERE json_extract(payload,'$.provider')='discord' LIMIT 30").all() as {guildId:string;channelId:string}[]).filter(r=>/^\d{1,25}$/.test(r.guildId)&&/^\d{1,25}$/.test(r.channelId));}
 ingest(event:Omit<IntakeEvent,'receivedAt'|'sourceId'>){const sourceId=`${event.provider}:${createHash('sha256').update(`${event.account}:${event.externalId}`).digest('hex')}`;const payload:IntakeEvent={...event,sourceId,receivedAt:this.now()};const result=this.db.query('INSERT OR IGNORE INTO events(id,payload) VALUES(?,?)').run(sourceId,JSON.stringify(payload));return {inserted:result.changes===1,event:payload};}
 events(limit=100):IntakeEvent[]{return (this.db.query('SELECT payload FROM events ORDER BY rowid DESC LIMIT ?').all(Math.min(limit,100)) as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 pendingSources():IntakeEvent[]{return (this.db.query('SELECT payload FROM events WHERE synced=0 ORDER BY rowid LIMIT 100').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 markSynced(id:string){this.db.query('UPDATE events SET synced=1 WHERE id=?').run(id);}
 cursor(key:string){const row=this.db.query('SELECT value FROM cursors WHERE key=?').get(key) as {value:string}|null;return row?.value;}
 setCursor(key:string,value:string){this.db.query('INSERT INTO cursors(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
 /** Persisted replay keys are namespaced by authenticated account/subscription identity. */
 hasDelivery(key:string){return this.cursor(`delivery:${key}`)==='done';}markDelivery(key:string){this.setCursor(`delivery:${key}`,'done');}
 propose(draft:OutboundDraft):Approval{
  if(!['gmail','discord','browser'].includes(draft.provider)||!draft.account||!draft.destination||!draft.content?.trim()||draft.content.length>(draft.provider==='discord'?2000:20000)||/[\r\n]/.test(draft.destination)||draft.subject&&/[\r\n]/.test(draft.subject))throw new Error('Choose a valid destination and message.');
  const id=randomUUID();const createdAt=this.now();const expiresAt=createdAt+15*60*1000;const hash=digest(draft);
  this.db.query("INSERT INTO approvals(id,digest,payload,state,created,expires) VALUES(?,?,?,'pending',?,?)").run(id,hash,JSON.stringify(draft),createdAt,expiresAt);return {id,digest:hash,draft:structuredClone(draft),state:'pending',createdAt,expiresAt};
 }
 approval(id:string):Approval|undefined{const r=this.db.query('SELECT * FROM approvals WHERE id=?').get(id) as {id:string;digest:string;payload:string;state:Approval['state'];created:number;expires:number;receipt:string|null}|null;if(!r)return;if(r.state==='pending'&&r.expires<=this.now()){this.db.query("UPDATE approvals SET state='expired' WHERE id=? AND state='pending'").run(id);r.state='expired';}return{id:r.id,digest:r.digest,draft:JSON.parse(r.payload),state:r.state,createdAt:r.created,expiresAt:r.expires,receipt:r.receipt??undefined};}
 approvals():Approval[]{return (this.db.query('SELECT id FROM approvals ORDER BY created DESC LIMIT 100').all() as {id:string}[]).map(r=>this.approval(r.id)!);}
 reject(id:string){this.db.query("UPDATE approvals SET state='rejected' WHERE id=? AND state='pending'").run(id);return this.approval(id);}
 /** Approval is consumed atomically BEFORE the adapter can perform network I/O. */
 async approveAndExecute(id:string,expectedDigest:string,execute:(draft:OutboundDraft,nonce:string,check:()=>Promise<boolean>)=>Promise<string>):Promise<Approval>{
  const current=this.approval(id);if(!current||current.state!=='pending'||expectedDigest!==current.digest||digest(current.draft)!==current.digest)throw new Error('This action is no longer pending or its details changed.');
  const changed=this.db.query("UPDATE approvals SET state='executing' WHERE id=? AND state='pending' AND digest=? AND expires>?").run(id,expectedDigest,this.now());if(changed.changes!==1)throw new Error('Approval already consumed or expired.');
  let checked=false;const check=async()=>{if(checked)return false;checked=true;return this.approval(id)?.state==='executing';};
  try{const receipt=await execute(current.draft,id,check);if(!checked)throw new Error('Adapter did not enforce the approval gate.');this.db.query("UPDATE approvals SET state='succeeded',receipt=? WHERE id=? AND state='executing'").run(receipt,id);}catch{this.db.query("UPDATE approvals SET state='unknown' WHERE id=? AND state='executing'").run(id);}
  return this.approval(id)!;
 }
 claimReply(id:string,scope:string,input:string){return this.db.query("INSERT OR IGNORE INTO discord_replies(id,scope,input,state) VALUES(?,?,?,'queued')").run(id,scope,input).changes===1;}
 replyState(id:string,state:string,output?:string,receipt?:string){this.db.query('UPDATE discord_replies SET state=?,output=COALESCE(?,output),receipt=COALESCE(?,receipt) WHERE id=?').run(state,output??null,receipt??null,id);}
 consumeReply(id:string){return this.db.query("UPDATE discord_replies SET state='sending' WHERE id=? AND state='generating'").run(id).changes===1;}
 replyHistory(scope:string){const rows=this.db.query("SELECT input,output FROM discord_replies WHERE scope=? AND state='succeeded' ORDER BY rowid DESC LIMIT 6").all(scope) as {input:string;output:string}[];return rows.reverse().flatMap(r=>[{role:'user' as const,text:r.input},{role:'assistant' as const,text:r.output}]);}
 /** Local structured diagnostics only: never store raw provider errors, prompts or reasoning. */
 replyDiagnostic(sourceId:string,stage:string,code:string,details:{exceptionType:string;httpStatus?:number;elapsedMs:number;deliveryConsumed:boolean;connected:boolean}){
  this.db.exec('CREATE TABLE IF NOT EXISTS discord_reply_diagnostics(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,stage TEXT NOT NULL,code TEXT NOT NULL,details TEXT NOT NULL,created INTEGER NOT NULL)');
  this.db.query('INSERT INTO discord_reply_diagnostics(id,source_id,stage,code,details,created) VALUES(?,?,?,?,?,?)').run(randomUUID(),sourceId,stage,code,JSON.stringify(details),this.now());
  this.db.query('DELETE FROM discord_reply_diagnostics WHERE rowid NOT IN (SELECT rowid FROM discord_reply_diagnostics ORDER BY rowid DESC LIMIT 500)').run();
 }
 close(){this.db.close();}
}
