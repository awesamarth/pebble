import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {GmailIntegration,type GmailConfig,type GmailEvent,type GmailHooks} from './gmail';
import {DiscordAdapter,type DiscordConfig,type DiscordMessage,type DiscordDeps} from './discord';
import {IntegrationStore,type OutboundDraft,type IntakeEvent} from './store';
import type {MessageSource} from '../memory';
export class IntegrationError extends Error{}
export class IntegrationService{
 readonly gmail:GmailIntegration;private discord?:DiscordAdapter;private discordSend=false;private store:IntegrationStore;private flushing?:Promise<void>;private closed=false;
 constructor(directory:string,private sourceSink:(source:MessageSource)=>Promise<void>,deps:{gmail?:Partial<GmailHooks>;discord?:DiscordDeps}={}){
  this.store=new IntegrationStore(join(directory,'integrations.sqlite'));
  this.gmail=new GmailIntegration({...deps.gmail,onEvent:async e=>{await this.gmailEvent(e);},onCursor:async(id,email)=>{if(email)this.store.setCursor(`gmail:${email.toLowerCase()}`,id);},loadCursor:async email=>this.store.cursor(`gmail:${email.toLowerCase()}`),deliverySeen:async key=>this.store.hasDelivery(key),onDelivery:async key=>{this.store.markDelivery(key);}});this.discordDeps=deps.discord;void this.flush();
 }
 private discordDeps?:DiscordDeps;
 status(){return {gmail:this.gmail.status(),discord:{configured:!!this.discord,allowSend:this.discordSend,...(this.discord?.status()??{state:'setup_required',issue:undefined,botId:undefined,guildIds:[],channelIds:[],mentionOnly:true,messageContent:false})}};}
 events(){return this.store.events();}approvals(){return this.store.approvals();}
 private async ingest(event:Omit<IntakeEvent,'receivedAt'|'sourceId'>){if(this.closed)return;this.store.ingest(event);await this.flush();}
 private async flush(){if(this.flushing)return this.flushing;this.flushing=(async()=>{try{for(;;){const events=this.store.pendingSources();if(!events.length)break;for(const e of events){await this.sourceSink({id:e.sourceId,conversationId:`${e.provider}:${e.account}`,role:e.provider,text:e.text});this.store.markSynced(e.sourceId);}}}catch{/* Durable source retry on next event or explicit refresh; never fabricate memory. */}})();try{await this.flushing;}finally{this.flushing=undefined;}}
 private async gmailEvent(e:GmailEvent){const status=this.gmail.status();if(!status.connected||!status.ingestEnabled||!status.email)return;const payload=e.message.payload as {headers?:{name:string;value:string}[]}|undefined;const headers=payload?.headers??[];const header=(name:string)=>headers.find(h=>h.name.toLowerCase()===name)?.value??'';const metadata={from:header('From'),to:header('To'),subject:header('Subject'),date:header('Date'),mode:e.contentMode};let body='';if(e.contentMode==='full'){const decoded=(part:unknown):string=>{if(!part||typeof part!=='object')return '';const p=part as {mimeType?:string;body?:{data?:string};parts?:unknown[]};if(p.mimeType==='text/plain'&&p.body?.data)return Buffer.from(p.body.data,'base64url').toString('utf8');return (p.parts??[]).map(decoded).join('\n');};body=decoded(payload).slice(0,16000);}
  await this.ingest({provider:'gmail',account:status.email.toLowerCase(),externalId:e.id,text:`From: ${metadata.from}\nTo: ${metadata.to}\nSubject: ${metadata.subject}\nDate: ${metadata.date}${body?`\n\n${body}`:''}`,metadata});}
 private async discordEvent(e:DiscordMessage){const botId=this.discord?.status().botId;if(!botId)return;await this.ingest({provider:'discord',account:botId,externalId:e.id,text:e.contentRedacted?'Message content unavailable under the configured Discord intents.':e.content||'(empty message)',metadata:{guildId:e.guildId,channelId:e.channelId,authorId:e.authorId,contentRedacted:String(e.contentRedacted)}});}
 configureGmail(config:GmailConfig){this.gmail.configure(config);return this.status();}
 async configureDiscord(config:DiscordConfig&{ingestEnabled?:boolean;allowSend?:boolean}){if(config.ingestEnabled!==true)throw new IntegrationError('Explicit consent is required before listening to Discord.');this.discord?.disconnect();const adapter=new DiscordAdapter(config,event=>{if(this.discord!==adapter)return;return this.discordEvent(event);},this.discordDeps);this.discord=adapter;this.discordSend=config.allowSend===true;await adapter.connect();return this.status();}
 disconnectDiscord(){this.discord?.disconnect();this.discord=undefined;this.discordSend=false;}
 async disconnectGmail(){try{if(this.gmail.status().connected)await this.gmail.stopWatch();}finally{this.gmail.disconnect();}}
 async refreshSources(){await this.flush();return this.events();}
 propose(draft:OutboundDraft){if(draft.provider==='browser')throw new IntegrationError('Browser reviews use the browser control panel.');if(draft.provider==='gmail'){const s=this.gmail.status();if(!s.connected||!s.allowSend||draft.account!==s.email?.toLowerCase())throw new IntegrationError('Connect Gmail with optional send permission before drafting an email.');if(!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(draft.destination))throw new IntegrationError('Enter one exact recipient email address.');}else{const s=this.discord?.status();if(!s||s.state!=='connected'||!this.discordSend||draft.account!==s.botId||!s.guildIds.includes(draft.guildId??'')||!s.channelIds.includes(draft.destination))throw new IntegrationError('Choose a connected Discord bot and an allowed guild/channel with outbound permission enabled.');}return this.store.propose(draft);}
 reject(id:string){return this.store.reject(id);}
 async approve(id:string,digest:string){
 const action=this.store.approval(id);if(action?.state==='pending'){
  const d=action.draft;const g=this.gmail.status();const s=this.discord?.status();
  const ready=d.provider==='gmail'?g.connected&&g.allowSend&&g.email?.toLowerCase()===d.account:!!s&&s.state==='connected'&&this.discordSend&&s.botId===d.account&&s.guildIds.includes(d.guildId??'')&&s.channelIds.includes(d.destination);
  if(!ready)throw new IntegrationError('Reconnect this same sending account and scope before approving. The review remains pending.');
 }
 return this.store.approveAndExecute(id,digest,async(draft,nonce,check)=>{
  if(draft.provider==='gmail'){
   const s=this.gmail.status();if(!s.connected||!s.allowSend||s.email?.toLowerCase()!==draft.account)throw new Error('Account changed.');
   const subject=`=?UTF-8?B?${Buffer.from(draft.subject??'').toString('base64')}?=`;const content=Buffer.from(draft.content).toString('base64').match(/.{1,76}/g)?.join('\r\n')??'';
   const raw=Buffer.from(`From: ${draft.account}\r\nTo: ${draft.destination}\r\nSubject: ${subject}\r\nMessage-ID: <${nonce}@pebble.local>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${content}`).toString('base64url');
   const result=await this.gmail.sendApproved(raw,{execute:async operation=>{if(!await check())throw new Error('Approval unavailable.');return operation();}});if(typeof result.id!=='string')throw new Error('Delivery uncertain.');return result.id;
  }
  const adapter=this.discord;const s=adapter?.status();if(!adapter||!s||!this.discordSend||s.botId!==draft.account)throw new Error('Account changed.');
  const input={guildId:draft.guildId!,channelId:draft.destination,content:draft.content,nonce:createHash('sha256').update(nonce).digest('hex').slice(0,24)};
  const result=await adapter.sendApproved(input,async exact=>exact.guildId===input.guildId&&exact.channelId===input.channelId&&exact.content===input.content&&exact.nonce===input.nonce&&await check());return result.id;
 });}
 async close(){this.closed=true;this.gmail.disconnect();this.disconnectDiscord();await this.flushing;this.store.close();}
}
export type IntegrationsStatus=ReturnType<IntegrationService['status']>;
