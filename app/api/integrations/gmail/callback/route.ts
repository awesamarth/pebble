import {gmailCallbackReason} from '../../../../home/gmail-oauth-errors';
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const url=new URL(request.url);const target=new URL('/home?integration=gmail',url.origin);if(!['127.0.0.1:7341','localhost:7341'].includes(url.host))return new Response(null,{status:403});
 try{if(url.searchParams.has('error')){target.searchParams.set('result','failed');target.searchParams.set('reason','google_denied');return Response.redirect(target,303);}const token=await readFile(resolve('.pebble/owner.token'),'utf8');const params=new URLSearchParams({code:url.searchParams.get('code')??'',state:url.searchParams.get('state')??''});const result=await fetch(`http://127.0.0.1:7342/integrations/gmail/callback?${params}`,{headers:{'x-pebble-owner':token},cache:'no-store'});target.searchParams.set('result',result.ok?'connected':'failed');if(!result.ok){const payload=await result.json().catch(()=>({}));const reason=gmailCallbackReason(payload.error);if(reason)target.searchParams.set('reason',reason);console.error('Gmail callback failed',{stage:'runtime_callback',status:result.status,reason:reason??'unclassified'});}}catch{target.searchParams.set('result','failed');target.searchParams.set('reason','runtime_unavailable');console.error('Gmail callback failed',{stage:'runtime_transport'});}
 return Response.redirect(target,303);
}
