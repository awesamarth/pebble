import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const url=new URL(request.url);const target=new URL('/home?integration=gmail',url.origin);if(!['127.0.0.1:7341','localhost:7341'].includes(url.host))return new Response(null,{status:403});
 try{if(url.searchParams.has('error'))throw new Error('cancelled');const token=await readFile(resolve('.pebble/owner.token'),'utf8');const params=new URLSearchParams({code:url.searchParams.get('code')??'',state:url.searchParams.get('state')??''});const result=await fetch(`http://127.0.0.1:7342/integrations/gmail/callback?${params}`,{headers:{'x-pebble-owner':token},cache:'no-store'});target.searchParams.set('result',result.ok?'connected':'failed');}catch{target.searchParams.set('result','failed');}
 return Response.redirect(target,303);
}
