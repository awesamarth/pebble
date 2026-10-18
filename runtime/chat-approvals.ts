import type {Approval} from './integrations/store';
import type {ChatMessage} from './contracts';
export class ChatApprovalError extends Error{}
const escape=(text:string)=>text.replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
export function draftChatNotice(review:Approval):string{const d=review.draft;return `Ready to send this ${d.provider==='gmail'?'email':'message'}:\n\n**From:** ${escape(d.account)}\n\n**To:** ${escape(d.destination)}\n\n**Subject:** ${escape(d.subject||'(no subject)')}\n\n**Body:**\n\n${d.content.split('\n').map(line=>'> '+escape(line)).join('\n')}\n\nNothing has been sent. Reply **yeah send** to send this exact draft. If several drafts are pending, say **send draft ${review.id}**.\n\nDraft ID: ${review.id}`;}
/** Only trusted, committed results of these tools become host-authored chat notices. */
export function approvalToolNotice(name:string,resultText:string,isError:boolean):Pick<ChatMessage,'text'|'approval'>|undefined{
 if(!['pebble_message_draft','pebble_message_approve'].includes(name))return;
 if(isError)return {text:resultText||'The message action could not complete. Nothing was retried.'};
 try{const value=JSON.parse(resultText);const review=value.review as Approval|undefined;if(name==='pebble_message_draft'&&review?.state==='pending'&&review.id&&review.digest&&['gmail','discord'].includes(review.draft?.provider)&&typeof review.draft.content==='string')return {text:draftChatNotice(review),approval:{id:review.id,digest:review.digest}};
 if(name==='pebble_message_approve'&&typeof value.message==='string')return {text:value.message};
 }catch{/* Malformed output is never treated as approval. */}
}
export function chooseChatApproval(ownerText:string,requestedId:string,shown:readonly {id:string;digest:string}[],reviews:readonly Approval[]):Approval{
 const text=ownerText.trim().toLowerCase().replace(/[.!]+$/,'').trim();
 const specific=text.match(/^(?:(?:yes|yeah|yep|ok|okay)[, ]+)?send draft ([a-z0-9-]+)$/);
 const consent=/^(?:(?:yes|yeah|yep|yup|ok|okay|haan)[, ]+)?(?:please )?send(?: it| the email| the message)?$/.test(text)||text==='go ahead and send';
 if(!consent&&!specific)throw new ChatApprovalError('Please review the draft shown in chat, then reply “yeah send”. Changes need a new draft.');
 const visible=new Map(shown.map(item=>[item.id,item.digest]));const pending=reviews.filter(r=>r.state==='pending'&&r.expiresAt>Date.now()&&r.draft.provider!=='browser'&&visible.get(r.id)===r.digest);
 if(!specific&&pending.length>1)throw new ChatApprovalError('Several drafts are pending. Tell me which one: “send draft <draft ID>”. Nothing was sent.');
 const selected=specific?pending.find(r=>r.id===specific[1]):pending.length===1?pending[0]:undefined;
 if(!selected||selected.id!==requestedId)throw new ChatApprovalError('That exact draft is no longer pending, expired, or was not shown before this approval. Nothing was sent or retried.');
 return selected;
}
