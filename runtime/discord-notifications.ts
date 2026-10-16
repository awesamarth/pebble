import {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';

export type NotificationDestination={botId:string;ownerId:string;guildId:string;channelId:string};
export type NotificationInput={sourceId:string;dueAt:number;message:string;destination:NotificationDestination;kind?:'reminder'|'task-completion'};
export type NotificationState='pending'|'sending'|'sent'|'cancelled'|'failed'|'unknown';
export type DiscordNotification=NotificationInput & {id:string;kind:'reminder'|'task-completion';state:NotificationState;createdAt:number;updatedAt:number;issue?:string};
type Row={id:string;source_id:string;due_at:number;message:string;destination:string;kind:DiscordNotification['kind'];state:NotificationState;created:number;updated:number;issue:string|null};
/** A confirmed pre-send failure. Other transport failures are ambiguous and never retried. */
export class NotificationUnavailable extends Error{}
export class NotificationRequestError extends Error{}
const item=(r:Row):DiscordNotification=>({id:r.id,sourceId:r.source_id,dueAt:r.due_at,message:r.message,destination:JSON.parse(r.destination),kind:r.kind,state:r.state,createdAt:r.created,updatedAt:r.updated,...(r.issue?{issue:r.issue}:{})});
/** Durable one-shot delivery. No model, recurring tasks, or inferred permission. Caller owns DB. */
export class DiscordNotifications{
 private closed=false;private timer?:ReturnType<typeof setInterval>;private draining?:Promise<void>;private active?:{id:string;controller:AbortController};
 constructor(private db:Database,private deliver:(item:Readonly<DiscordNotification>,signal:AbortSignal,consume:()=>Promise<boolean>)=>Promise<void>,private now=Date.now,private ready=()=>true){
  db.exec("CREATE TABLE IF NOT EXISTS discord_notification_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL); INSERT OR IGNORE INTO discord_notification_settings(id,enabled) VALUES(1,0); CREATE TABLE IF NOT EXISTS discord_notifications(id TEXT PRIMARY KEY,source_id TEXT UNIQUE NOT NULL,due_at INTEGER NOT NULL,message TEXT NOT NULL,destination TEXT NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,issue TEXT,claimed INTEGER NOT NULL DEFAULT 0)");
  db.query("UPDATE discord_notifications SET state='unknown',updated=?,issue='Delivery was interrupted. Check Discord before creating another reminder.' WHERE state='sending'").run(now());
 }
 status(){return {enabled:this.enabled(),items:(this.db.query('SELECT * FROM discord_notifications ORDER BY created DESC,rowid DESC LIMIT 100').all() as Row[]).map(item)};}
 private enabled(){return !!(this.db.query('SELECT enabled FROM discord_notification_settings WHERE id=1').get() as {enabled:number}).enabled;}
 setEnabled(enabled:boolean){
  if(typeof enabled!=='boolean')throw new Error('Choose whether Discord notifications are enabled.');
  this.db.query('UPDATE discord_notification_settings SET enabled=? WHERE id=1').run(enabled?1:0);
  if(!enabled){this.active?.controller.abort();this.db.query("UPDATE discord_notifications SET state='cancelled',updated=?,issue='Notifications were turned off.' WHERE state='pending'").run(this.now());}
  return this.status();
 }
 schedule(input:NotificationInput){
  if(this.closed||!this.enabled())throw new NotificationRequestError('Enable Discord notifications in Apps & actions first.');
  if(!input.sourceId?.trim()||input.sourceId.length>300||!Number.isSafeInteger(input.dueAt)||input.dueAt<this.now()-1000||input.dueAt>this.now()+365*86400000||!input.message?.trim()||input.message.length>1600||!input.destination||!['botId','ownerId','guildId','channelId'].every(key=>/^\d{5,25}$/.test(input.destination[key as keyof NotificationDestination])))throw new NotificationRequestError('Choose a valid time, message and connected Discord destination.');
  const kind=input.kind??'reminder';if(!['reminder','task-completion'].includes(kind))throw new NotificationRequestError('Unsupported notification.');
  return this.db.transaction(()=>{
   const existing=this.db.query('SELECT * FROM discord_notifications WHERE source_id=?').get(input.sourceId) as Row|null;if(existing)return item(existing);
   const count=this.db.query("SELECT count(*) AS count FROM discord_notifications WHERE state IN ('pending','sending')").get() as {count:number};if(count.count>=50)throw new NotificationRequestError('Too many pending reminders. Cancel one first.');
   const id=randomUUID(),time=this.now();this.db.query("INSERT INTO discord_notifications(id,source_id,due_at,message,destination,kind,state,created,updated) VALUES(?,?,?,?,?,?,'pending',?,?)").run(id,input.sourceId,input.dueAt,input.message.trim(),JSON.stringify(input.destination),kind,time,time);
   return item(this.db.query('SELECT * FROM discord_notifications WHERE id=?').get(id) as Row);
  })();
 }
 cancel(id:string){
  const row=this.db.query('SELECT * FROM discord_notifications WHERE id=?').get(id) as Row|null;if(!row)throw new Error('Reminder not found.');
  if(row.state==='pending')this.db.query("UPDATE discord_notifications SET state='cancelled',updated=? WHERE id=? AND state='pending'").run(this.now(),id);
  if(this.active?.id===id)this.active.controller.abort();
  return item(this.db.query('SELECT * FROM discord_notifications WHERE id=?').get(id) as Row);
 }
 start(){if(!this.closed&&!this.timer){this.timer=setInterval(()=>{void this.tick();},5000);this.timer.unref?.();void this.tick();}}
 tick():Promise<void>{if(this.draining)return this.draining;if(this.closed||!this.enabled()||!this.ready())return Promise.resolve();this.draining=this.drain().finally(()=>{this.draining=undefined;});return this.draining;}
 private async drain(){
  while(!this.closed&&this.enabled()&&this.ready()){
   const row=this.db.query("SELECT * FROM discord_notifications WHERE state='pending' AND due_at<=? ORDER BY due_at,rowid LIMIT 1").get(this.now()) as Row|null;if(!row)return;
   if(this.db.query("UPDATE discord_notifications SET state='sending',updated=? WHERE id=? AND state='pending'").run(this.now(),row.id).changes!==1)continue;
   const controller=new AbortController();this.active={id:row.id,controller};let timeout:ReturnType<typeof setTimeout>|undefined;
   try{
    await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted||this.closed||!this.enabled())throw new NotificationUnavailable('Delivery cancelled before sending.');return this.deliver(Object.freeze({...item(row),state:'sending',destination:Object.freeze(JSON.parse(row.destination))}),controller.signal,async()=>!controller.signal.aborted&&!this.closed&&this.enabled()&&this.db.query("UPDATE discord_notifications SET claimed=1 WHERE id=? AND state='sending' AND claimed=0").run(row.id).changes===1);}),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('Delivery timed out'));},15000);})]);
    this.db.query("UPDATE discord_notifications SET state='sent',updated=? WHERE id=? AND state='sending'").run(this.now(),row.id);
   }catch(error){this.db.query("UPDATE discord_notifications SET state=?,updated=?,issue=? WHERE id=? AND state='sending'").run(error instanceof NotificationUnavailable?'failed':'unknown',this.now(),error instanceof NotificationUnavailable?'Delivery blocked. Check the connected bot, owner, channel and send permission.':'Delivery is uncertain. Check Discord before creating another reminder.',row.id);}
   finally{if(timeout)clearTimeout(timeout);this.active=undefined;}
  }
 }
 async close(){this.closed=true;if(this.timer)clearInterval(this.timer);this.timer=undefined;this.active?.controller.abort();await this.draining;}
}
/** Derive the exact reminder from the authenticated human turn, never tool arguments. */
export function reminderFromOwnerText(text:string,now=Date.now()):{dueAt:number;message:string}{
 const clean=text.replace(/<@!?\d+>/g,'').trim();
 const match=/^remind me(?: on discord)? in (\d{1,6}) (seconds?|minutes?|hours?|days?) (?:to |that )?([\s\S]+)$/i.exec(clean);
 if(!match)throw new NotificationRequestError('Please say “remind me in 10 minutes to …”, or choose a time in pebble.');
 const amount=Number(match[1]),unit=match[2].toLowerCase(),scale=unit.startsWith('second')?1000:unit.startsWith('minute')?60000:unit.startsWith('hour')?3600000:86400000;
 if(amount<1||amount*scale>365*86400000||match[3].trim().length>1500)throw new NotificationRequestError('Choose a reminder within the next year and a shorter message.');
 return {dueAt:now+amount*scale,message:`Reminder: ${match[3].trim()}`};
}
export function completionNotificationRequested(text:string){
 // Only the original direct human request may authorize this generic completion ping.
 if(/["“”`]|^[ \t]*>|\b(?:quoted|forwarded|imported)\b/im.test(text))return false;
 return /\b(?:(?:notify|ping|message) me|let me know)\b.{0,50}\b(?:when|once|after)\b.{0,50}\b(?:done|finished|complete|ready)\b/i.test(text);
}
