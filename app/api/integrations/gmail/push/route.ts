import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Public ingress only for Google-authenticated Pub/Sub; verification runs in the owner. */
export async function POST(request:Request){
 if(!request.headers.get('authorization')?.startsWith('Bearer '))return new Response(null,{status:401});
 if(Number(request.headers.get('content-length')??0)>24000)return new Response(null,{status:413});
 try{const body=await request.text();if(body.length>24000)return new Response(null,{status:413});const token=await readFile(resolve('.pebble/owner.token'),'utf8');const result=await fetch('http://127.0.0.1:7342/integrations/gmail/push',{method:'POST',headers:{'x-pebble-owner':token,authorization:request.headers.get('authorization')!,'content-type':'application/json'},body,signal:request.signal,cache:'no-store'});return new Response(null,{status:result.ok?204:result.status,headers:{'Cache-Control':'no-store'}});}catch{return new Response(null,{status:503});}
}
