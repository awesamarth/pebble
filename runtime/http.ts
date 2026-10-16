import {chatBodyLimit} from './chat-images';
import {timingSafeEqual} from 'node:crypto';
import {Engine,SetupError} from './engine';
import {GmailError} from './integrations/gmail';
import {IntegrationError} from './integrations/service';
export function runtimeHandler(engine:Engine,token:string){
const authorized=(request:Request)=>{const value=request.headers.get('x-pebble-owner')??'';return value.length===token.length&&timingSafeEqual(Buffer.from(value),Buffer.from(token));};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
return async (request:Request):Promise<Response>=>{
 if(!authorized(request))return json({error:'Unauthorized runtime request.'},401);
 const path=new URL(request.url).pathname;
 try{
  if(request.method==='GET'){
   if(path==='/browser/status')return json(engine.browser.status());if(path==='/browser/screenshot-view')return json(engine.browser.screenshotPreview());
   if(path==='/work')return json({tasks:engine.privateWorkItems()});
   if(path==='/integrations/status')return json(engine.integrations.status());if(path==='/integrations/events')return json(await engine.integrations.refreshSources());if(path==='/integrations/approvals')return json(engine.integrations.approvals());
   if(path==='/integrations/gmail/callback'){const q=new URL(request.url).searchParams;await engine.integrations.gmail.completeOAuth(q.get('code')??'',q.get('state')??'');return json({ok:true});}
   if(path==='/model-settings')return json(await engine.generationView());if(path==='/status')return json(await engine.status());if(path==='/history')return json(engine.snapshot());if(path==='/models')return json(await engine.activeModelChoices());if(path==='/oauth')return json(engine.oauth);if(path==='/memory')return json(await engine.facts(new URL(request.url).searchParams.get('q')??''));
   if(path==='/events'){
    let unsubscribe:(()=>void)|undefined;let interval:ReturnType<typeof setInterval>|undefined;const encoder=new TextEncoder();
    const stream=new ReadableStream({start(controller){let ended=false;const stop=()=>{if(ended)return;ended=true;unsubscribe?.();clearInterval(interval);try{controller.close();}catch{}};
     unsubscribe=engine.subscribe(view=>{if(!ended)try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(view)}\n\n`));}catch{stop();}});interval=setInterval(()=>{try{controller.enqueue(encoder.encode(': keepalive\n\n'));}catch{stop();}},15000);request.signal.addEventListener('abort',stop,{once:true});},cancel(){unsubscribe?.();clearInterval(interval);}});
    return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
   }
  }
  if(request.method==='POST'){
   const limit=path==='/chat'?chatBodyLimit:24000;if(Number(request.headers.get('content-length')??0)>limit)return json({error:'Request too large.'},413);
   const raw=await request.text();if(raw.length>limit)return json({error:'Request too large.'},413);const body=raw?JSON.parse(raw):{};
   if(path==='/browser/start')return json(await engine.browser.start());
   if(path==='/browser/resume')return json(await engine.browser.resume());
   if(path==='/browser/pause')return json(await engine.browserPause('pause'));
   if(path==='/browser/takeover')return json(await engine.browserPause('takeover'));
   if(path==='/browser/stop')return json(await engine.browserPause('stop'));
   if(path==='/browser/observe')return json(await engine.browser.observe());
   if(path==='/browser/scroll')return json(await engine.browser.scroll(body.direction,body.amount));
   if(path==='/browser/action')return json(await engine.browser.propose(body.action,body.revision));
   if(path==='/browser/approve')return json(await engine.browser.approve(body.id,body.digest));
   if(path==='/browser/reject')return json(engine.browser.reject(body.id));
   if(path==='/browser/screenshot'){await engine.browser.screenshot();return json(engine.browser.screenshotPreview());}
   const integrations=engine.integrations;
   if(path==='/integrations/gmail/configure')return json(integrations.configureGmail(body));
   if(path==='/integrations/gmail/search')return json(await integrations.gmail.searchMessages(body.query,body.maxResults??5));
   if(path==='/integrations/gmail/read')return json(await integrations.gmail.readMessage(body.id));
   if(path==='/integrations/gmail/start')return json(await integrations.gmail.beginOAuth());
   if(path==='/integrations/gmail/watch')return json(await integrations.gmail.startWatch());
   if(path==='/integrations/gmail/sync')return json(await integrations.gmail.syncHistory());
   if(path==='/integrations/gmail/recover')return json(await integrations.gmail.resumeFromNow(body.consent===true));
   if(path==='/integrations/gmail/disconnect'){await integrations.disconnectGmail();return json(integrations.status());}
   if(path==='/integrations/gmail/push')return json(await integrations.gmail.handlePush(request.headers.get('authorization'),body));
   if(path==='/integrations/discord/connect')return json(await integrations.configureDiscord(body));
   if(path==='/integrations/discord/disconnect'){await integrations.disconnectDiscord(body.forget===true);return json(integrations.status());}
   if(path==='/integrations/draft')return json(integrations.propose(body));
   if(path==='/integrations/approve')return json(await integrations.approve(body.id,body.digest));
   if(path==='/integrations/reject')return json(integrations.reject(body.id));
   if(path==='/profile'){engine.saveProfile(body);return json(await engine.status());}
   if(path==='/model-settings')return json(await engine.setGeneration(body));
   if(path==='/provider'){if(body.provider!==undefined&&body.provider!=='openai')throw new SetupError('This version supports ChatGPT sign-in and OpenAI API keys. Choose an OpenAI connection.');await engine.setKey(body.key,body.model);return json(await engine.status());}
   if(path==='/provider/disconnect'){await engine.disconnect();return json(await engine.status());}
   if(path==='/oauth/start')return json(engine.startOAuth());if(path==='/oauth/complete'){engine.completeOAuth(body.value);return json({ok:true});}
   if(path==='/memory/connect')return json(await engine.connectMemory(body,body.initialize===true));if(path==='/memory/health')return json(await engine.memoryHealth());if(path==='/memory/fact')return json(await engine.remember(body));
   if(path==='/memory/fact/update')return json(await engine.editFact(body));if(path==='/memory/fact/delete')return json(await engine.deleteFact(body));
   if(path==='/chat')return json(await engine.send(body.content,body.requestId,body.images));if(path==='/resume'){await engine.resume();return json({ok:true});}if(path==='/abort'){await engine.abort();return json({ok:true});}
  }
  return json({error:'Unknown runtime operation.'},404);
 }catch(error){if(error instanceof GmailError)return json({error:`Gmail: ${error.code.replaceAll('_',' ')}.`},path==='/integrations/gmail/push'?401:409);if(error instanceof IntegrationError)return json({error:error.message},409);return json({error:error instanceof SetupError?error.message:'The operation could not complete. Check setup and try again.'},error instanceof SetupError?409:500);}
};
}
