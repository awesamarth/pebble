import {chatBodyLimit} from '../../../../runtime/chat-images';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const allowed=new Set(['browser/status','browser/screenshot-view','browser/start','browser/resume','browser/pause','browser/takeover','browser/stop','browser/observe','browser/scroll','browser/action','browser/approve','browser/reject','browser/screenshot','model-settings','status','history','models','oauth','memory','events','profile','provider','provider/disconnect','oauth/start','oauth/complete','memory/connect','memory/health','memory/fact','chat','abort','resume','integrations/status','integrations/events','integrations/approvals','integrations/gmail/search','integrations/gmail/read','integrations/gmail/configure','integrations/gmail/start','integrations/gmail/watch','integrations/gmail/sync','integrations/gmail/recover','integrations/gmail/disconnect','integrations/discord/connect','integrations/discord/disconnect','integrations/draft','integrations/approve','integrations/reject']);
async function proxy(request:Request,context:{params:Promise<{path:string[]}>}){
 const host=request.headers.get('host');if(!['127.0.0.1:7341','localhost:7341'].includes(host??''))return Response.json({error:'Local preview access only.'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==`http://${host}`)return Response.json({error:'Cross-origin request rejected.'},{status:403});
 const {path}=await context.params;const operation=path.join('/');if(!allowed.has(operation))return new Response(null,{status:404});
 try{const token=await readFile(resolve('.pebble/owner.token'),'utf8');const body=request.method==='POST'?await request.text():undefined;if(body&&body.length>(operation==='chat'?chatBodyLimit:24000))return new Response(null,{status:413});
 const upstream=await fetch(`http://127.0.0.1:7342/${operation}${new URL(request.url).search}`,{method:request.method,headers:{'x-pebble-owner':token,'content-type':'application/json'},body,signal:request.signal,cache:'no-store'});
 return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':upstream.headers.get('content-type')??'application/json','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }catch{return Response.json({error:'The Pebble runtime is offline. Start it with bun run runtime.'},{status:503});}
}
export const GET=proxy;export const POST=proxy;
