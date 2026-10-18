import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createModels,type AssistantMessage} from '@earendil-works/pi-ai';
import {openaiProvider} from '@earendil-works/pi-ai/providers/openai';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import {Engine} from './engine';import {GraphMemory,type GraphConnection} from './memory';import {defaultLook} from './contracts';
const config={host:'isolated-test.invalid',port:6379,tls:true,graph:'test'};
test('real Pi Durable Harness: streamed committed partial, history reopen, request deduplication, setup gate (isolated model/graph doubles)',async()=>{
 let calls=0;const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});const base=openaiProvider();
 const stream:typeof base.streamSimple=(model)=>{calls++;const events=createAssistantMessageEventStream();void(async()=>{const partial:AssistantMessage={role:'assistant',content:[{type:'text',text:''}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};events.push({type:'start',partial:structuredClone(partial)});partial.content=[{type:'text',text:'ISOLATED TEST'}];events.push({type:'text_delta',contentIndex:0,delta:'ISOLATED TEST',partial:structuredClone(partial)});await Bun.sleep(220);partial.content=[{type:'text',text:'ISOLATED TEST RESPONSE'}];events.push({type:'text_delta',contentIndex:0,delta:' RESPONSE',partial:structuredClone(partial)});events.push({type:'done',reason:'stop',message:partial});})();return events;};
 models.setProvider({...base,auth:{apiKey:{name:'isolated test credential',resolve:async()=>({auth:{apiKey:'test-double'}})}},streamSimple:stream});
 const writes:string[]=[];const connection:GraphConnection={run:async(query,params)=>{if(query==='RETURN 1 AS ok')return [{ok:1}];if(query.includes('MERGE (s:Source')){writes.push(String(params.id));return [];}return [];},close:async()=>{}};
 const factory=()=>new GraphMemory(config,async()=>connection);const dir=await mkdtemp(join(tmpdir(),'pebble-engine-'));let engine=await Engine.open(dir,models,factory);
 try{expect((await engine.status()).ready).toBe(false);await expect(engine.send('hello','isolated-request-1')).rejects.toThrow('setup');engine.saveProfile(defaultLook);await engine.setKey('isolated-test-key','gpt-6-sol');await engine.connectMemory(config);expect((await engine.status()).ready).toBe(true);
 const frames:string[]=[];const unsub=engine.subscribe(v=>{if(v.partial)frames.push(v.partial);});const first=await engine.send('Test only','isolated-request-1');for(let i=0;i<100&&engine.snapshot().messages.length<2;i++)await Bun.sleep(20);expect(engine.snapshot().messages.map(m=>m.text)).toEqual(['Test only','ISOLATED TEST RESPONSE']);expect(frames.some(f=>f==='ISOLATED TEST')).toBe(true);const again=await engine.send('Test only','isolated-request-1');expect(again.submissionId).toBe(first.submissionId);expect(calls).toBe(1);await expect(engine.send('changed','isolated-request-1')).rejects.toThrow('different');unsub();await Bun.sleep(30);expect(writes.length).toBeGreaterThanOrEqual(2);await engine.close();engine=await Engine.open(dir,models,factory);expect(engine.snapshot().messages).toHaveLength(2);expect(engine.profile()?.name).toBe('bunty');expect((await engine.status()).provider.state).toBe('setup_required');expect((await engine.status()).ready).toBe(false);
 }finally{await engine.close();await rm(dir,{recursive:true,force:true});}
},15000);

test('same real Harness executes registered browser tools and excludes browser conversation from automatic graph sync',async()=>{
 let calls=0;let toolSeen=false;let resultSeen=false;const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});const base=openaiProvider();
 const stream:typeof base.streamSimple=(model,context)=>{calls++;toolSeen ||= context.messages.some(m=>m.role==='system'&&m.toolsAdded?.some(t=>t.name==='pebble_browser_tabs'));resultSeen ||= context.messages.some(m=>m.role==='toolResult'&&m.toolName==='pebble_browser_tabs'&&!m.isError);const events=createAssistantMessageEventStream();const message:AssistantMessage={role:'assistant',content:calls===1?[{type:'toolCall',id:'call_browser_fixture',name:'pebble_browser_tabs',arguments:{}}]:[{type:'text',text:'ISOLATED BROWSER HARNESS COMPLETE'}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:calls===1?'toolUse':'stop',timestamp:Date.now()};queueMicrotask(()=>events.push({type:'done',reason:calls===1?'toolUse':'stop',message}));return events;};
 models.setProvider({...base,auth:{apiKey:{name:'isolated',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:stream});
 const writes:string[]=[];const connection:GraphConnection={run:async(query,params)=>{if(query==='RETURN 1 AS ok')return [{ok:1}];if(query.includes('MERGE (s:Source'))writes.push(String(params.id));return [];},close:async()=>{}};
 const dir=await mkdtemp(join(tmpdir(),'pebble-browser-harness-'));const engine=await Engine.open(dir,models,()=>new GraphMemory(config,async()=>connection));
 try{engine.saveProfile(defaultLook);await engine.setKey('isolated-test-key','gpt-6-sol');await engine.connectMemory(config);await engine.browser.start();await engine.browser.resume();await engine.send('Inspect only the blank dedicated browser tabs.','browser-harness-fixture-1');for(let i=0;i<150&&!engine.snapshot().messages.some(m=>m.text==='ISOLATED BROWSER HARNESS COMPLETE');i++)await Bun.sleep(20);expect(toolSeen).toBe(true);expect(resultSeen).toBe(true);expect(calls).toBe(2);expect(engine.snapshot().messages.some(m=>m.text==='ISOLATED BROWSER HARNESS COMPLETE')).toBe(true);await Bun.sleep(30);expect(writes).toHaveLength(0);await engine.browser.stop();await engine.connectMemory(config);await Bun.sleep(30);expect(writes).toHaveLength(0);
 }finally{await engine.close();await rm(dir,{recursive:true,force:true});}
},15000);

test('automatic Pi compaction reports progress and retains restored history',async()=>{
 const ctx=(await import('@earendil-works/chord/context')).BACKGROUND_CONTEXT;
 const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});const base=openaiProvider();let summaries=0;
 models.setProvider({...base,getModels:()=>base.getModels().map(m=>m.id==='gpt-6-sol'?{...m,contextWindow:40000}:m),auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:model=>{throw Error('provider stub not installed');}});
 const provider=models.getProvider('openai')!;
 models.setProvider({...provider,streamSimple:(model,context)=>{
  const summary=JSON.stringify(context.messages).includes('context summarization assistant');if(summary)summaries++;
  const message:AssistantMessage={role:'assistant',content:[{type:'text',text:summary?'Synthetic checkpoint: retain the owner’s test task.':'Synthetic response'}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:50,output:10,cacheRead:0,cacheWrite:0,totalTokens:60,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};
  const stream=createAssistantMessageEventStream();setTimeout(()=>stream.push({type:'done',reason:'stop',message}),summary?40:0);return stream;
 }});
 const dir=await mkdtemp(join(tmpdir(),'pebble-compaction-'));let engine=await Engine.open(dir,models);const states:NonNullable<ReturnType<Engine['snapshot']>['context']>[]=[];const unsubscribe=engine.subscribe(v=>{if(v.context)states.push(v.context);});
 try{
  const root=(engine as unknown as {root:Awaited<ReturnType<import('@earendil-works/pi-durable').Harness['root']>>}).root;
  // Large synthetic entries exercise the real default policy, not live account data.
  for(let index=0;index<2;index++){const submission=await root.submit({type:'input',content:`Synthetic turn ${index}: `+'ordinary synthetic words '.repeat(4500),requestId:`synthetic-compaction-${index}`,whenBusy:'reject'},ctx);expect((await submission.wait(ctx)).status).toBe('done');}
  await Bun.sleep(50);expect(summaries).toBeGreaterThan(0);expect(states.some(s=>s.state==='summarizing'&&s.blocking)).toBe(true);expect(JSON.stringify(states)).not.toContain('error');expect(engine.snapshot().messages.filter(m=>m.role==='user')).toHaveLength(2);unsubscribe();await engine.close();engine=await Engine.open(dir,models);expect(engine.snapshot().messages.filter(m=>m.role==='user')).toHaveLength(2);
 }finally{unsubscribe();await engine.close();await rm(dir,{recursive:true,force:true});}
},15000);

test('chat acceptance does not wait for expired model catalog refresh (isolated actual Harness)',async()=>{
 const {AccountModelCatalog}=await import('./provider-models');let now=0,catalogCalls=0,released=false;let refreshResolve!:(response:Response)=>void;
 const catalog=new AccountModelCatalog((async()=>{catalogCalls++;if(catalogCalls===1)return Response.json({data:[{id:'gpt-6-sol'}]});return new Promise<Response>(resolve=>{refreshResolve=resolve;});}) as unknown as typeof fetch,()=>now);
 const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}}),base=openaiProvider();let generations=0;
 models.setProvider({...base,auth:{apiKey:{name:'isolated',resolve:async()=>({auth:{apiKey:'synthetic-catalog-key'}})}},streamSimple:model=>{generations++;const events=createAssistantMessageEventStream();const message:AssistantMessage={role:'assistant',content:[{type:'text',text:'SYNTHETIC CATALOG RESPONSE'}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};queueMicrotask(()=>events.push({type:'done',reason:'stop',message}));return events;}});
 const connection:GraphConnection={run:async query=>query==='RETURN 1 AS ok'?[{ok:1}]:[],close:async()=>{}};
 const directory=await mkdtemp(join(tmpdir(),'pebble-send-catalog-'));const engine=await Engine.open(directory,models,()=>new GraphMemory(config,async()=>connection),undefined,undefined,catalog);
 try{
  engine.saveProfile(defaultLook);await engine.setKey('synthetic-catalog-key','gpt-6-sol','openai','medium');await engine.connectMemory(config);now=300001;
  const start=performance.now();const result=await Promise.race([engine.send('Synthetic catalog check only','catalog-timing-check-1'),Bun.sleep(2000).then(()=>{throw Error('Send waited for held catalog refresh');})]);
  console.log(`actual Harness acceptance with unresolved catalog refresh: ${(performance.now()-start).toFixed(1)} ms`);
  expect(result.submissionId).toBeTruthy();expect(catalogCalls).toBe(2);expect(released).toBe(false);
  refreshResolve(Response.json({data:[{id:'gpt-6-sol'}]}));released=true;
  for(let i=0;i<100&&engine.snapshot().busy;i++)await Bun.sleep(10);
  expect(engine.snapshot().messages.filter(m=>m.role==='user')).toHaveLength(1);expect(generations).toBe(1);expect(engine.generation()).toEqual({model:'gpt-6-sol',reasoning:'medium'});
  const again=await engine.send('Synthetic catalog check only','catalog-timing-check-1');expect(again.submissionId).toBe(result.submissionId);expect(generations).toBe(1);
 }finally{if(!released&&refreshResolve)refreshResolve(Response.json({data:[{id:'gpt-6-sol'}]}));await engine.close();await rm(directory,{recursive:true,force:true});}
},15000);
