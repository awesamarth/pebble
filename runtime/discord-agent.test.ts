import {test,expect} from 'bun:test';
import {Harness,createRegistry} from '@earendil-works/pi-durable';
import {MemoryStorage} from '@earendil-works/pi-durable/storage/memory';
import {BACKGROUND_CONTEXT as ctx} from '@earendil-works/chord/context';
import {createModels,type AssistantMessage} from '@earendil-works/pi-ai';
import {openaiProvider} from '@earendil-works/pi-ai/providers/openai';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import {replyToDiscord} from './discord-agent';
test('real Harness scopes Discord context, applies model settings and returns bounded text without tools',async()=>{
 const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});const base=openaiProvider();let calls=0;let empty=false;
 const stream:typeof base.streamSimple=(model,context,options)=>{
  calls++;expect(model.id).toBe('gpt-6-sol');expect(options?.reasoning).toBe('low');const serialized=JSON.stringify(context);expect(serialized).not.toContain('PRIVATE_WEB_SENTINEL');expect(serialized).toContain('CHANNEL_HISTORY');expect(serialized).toContain('CHANNEL_FACT');expect(context.messages.some(message=>message.role==='system'&&message.toolsAdded?.length)).toBe(false);
  const events=createAssistantMessageEventStream();const message:AssistantMessage={role:'assistant',content:[{type:'text',text:empty?'':'x'.repeat(1900)}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};queueMicrotask(()=>events.push({type:'done',reason:'stop',message}));return events;
 };
 models.setProvider({...base,auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:stream});const harness=await Harness.open(new MemoryStorage(),{models,registry:createRegistry()},ctx);
 try{
  await harness.root(ctx,{agent:{instructions:'PRIVATE_WEB_SENTINEL',tools:[]}});
  const request={text:'Hello',sourceId:'discord-synthetic-1',conversationId:'discord-channel-fixture',history:[{role:'user' as const,text:'CHANNEL_HISTORY'}],memories:[{text:'CHANNEL_FACT',sourceId:'source-fixture'}],signal:new AbortController().signal};const settings={model:'gpt-6-sol',reasoning:'low' as const,name:'bunty'};
  expect((await replyToDiscord(harness,request,settings)).length).toBe(1800);empty=true;await expect(replyToDiscord(harness,{...request,sourceId:'discord-synthetic-2'},settings)).rejects.toThrow('empty');const aborted=new AbortController();aborted.abort();await expect(replyToDiscord(harness,{...request,signal:aborted.signal},settings)).rejects.toThrow('cancelled');expect(calls).toBe(2);
 }finally{await harness.close(ctx);}
},10000);
