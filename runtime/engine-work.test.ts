import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createModels,type AssistantMessage} from '@earendil-works/pi-ai';import {openaiProvider} from '@earendil-works/pi-ai/providers/openai';import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import {Engine} from './engine';import {GraphMemory} from './memory';import {defaultLook} from './contracts';

test('real web Harness hands unchanged current owner request to private work and returns its result only through owner task access',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pebble-web-work-'));const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});const base=openaiProvider();
 const original='In the background, find my saved preference for quiet mornings.';const privateInputs:string[]=[];const receipts:unknown[]=[];let privateRead=false;
 models.setProvider({...base,auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:(model,context)=>{
  const privateLane=context.messages.some(message=>message.role==='system'&&message.toolsAdded?.some(tool=>tool.name==='pebble_private_work_memory_search'));
  const results=context.messages.filter(message=>message.role==='toolResult');
  let call:string|undefined;
  if(privateLane){if(!results.length){const user=context.messages.find(message=>message.role==='user');privateInputs.push(JSON.stringify(user?.content));call='pebble_private_work_memory_search';}else privateRead=results.some(result=>result.toolName==='pebble_private_work_memory_search'&&!result.isError);}
  else if(!results.length)call='pebble_task_start';else receipts.push(results.at(-1));
  const stream=createAssistantMessageEventStream();const message:AssistantMessage={role:'assistant',content:call?[{type:'toolCall',id:privateLane?'private_search':'start_web_task',name:call,arguments:privateLane?{query:'quiet mornings'}:{}}]:[{type:'text',text:privateLane?'Private result: prefers quiet mornings [fixture-source]':'Started your private work.'}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:call?'toolUse':'stop',timestamp:Date.now()};queueMicrotask(()=>stream.push({type:'done',reason:call?'toolUse':'stop',message}));return stream;
 }});
 const config={host:'isolated.invalid',port:6379,tls:true,graph:'fixture'};const queries:string[]=[];
 const engine=await Engine.open(directory,models,()=>new GraphMemory(config,async()=>({run:async(query)=>{queries.push(query);if(query==='RETURN 1 AS ok')return [{ok:1}];if(query.includes('MATCH (f:Fact)'))return [{id:'fixture-fact',text:'Prefers quiet mornings',sourceId:'fixture-source',sourceText:'I prefer quiet mornings',conversationId:'private-web',role:'user',person:null,project:null}];return [];},close:async()=>{}})));
 try{
  engine.saveProfile(defaultLook);await engine.setKey('synthetic-only-key');await engine.connectMemory(config);await engine.send(original,'web-background-fixture');
  for(let i=0;i<200&&(engine.privateWorkItems()[0]?.state!=='completed'||engine.snapshot().busy);i++)await Bun.sleep(10);
  const items=engine.privateWorkItems();expect(items).toHaveLength(1);expect(items[0].state).toBe('completed');expect(items[0].request).toBe(original);
  expect(items[0].sourceId).toBe(engine.snapshot().messages.find(message=>message.role==='user')!.id);expect(items[0].result).toBe('Private result: prefers quiet mornings [fixture-source]');
  expect(privateInputs).toEqual([JSON.stringify(original)]);expect(privateRead).toBe(true);expect(JSON.stringify(receipts)??'').toContain(items[0].id);expect(JSON.stringify(receipts)).not.toContain('Private result:');
  expect(engine.integrations.approvals()).toHaveLength(0);expect(queries.some(query=>query.includes('MERGE (f:Fact'))).toBe(false);
 }finally{await engine.close();await rm(directory,{recursive:true,force:true});}
},15000);
