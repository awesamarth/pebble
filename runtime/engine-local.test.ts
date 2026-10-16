import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createModels,type AssistantMessage,type JsonObject} from '@earendil-works/pi-ai';
import {openaiProvider} from '@earendil-works/pi-ai/providers/openai';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import {Engine} from './engine';import {GraphMemory} from './memory';import {defaultLook} from './contracts';

test('real owner Harness discovers and reads granted files then edits and creates through Pi native tools',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'pebble-engine-local-')));const folder=join(directory,'fixture');await mkdir(folder);const note=join(folder,'cedar.txt'),created=join(folder,'summary.txt');await writeFile(note,'Project Cedar\nOriginal task\n');
 const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});const base=openaiProvider();
 let turn=0,index=0;let plan:{name:string;arguments:JsonObject}[]=[];const offered=new Set<string>();const results:{name:string;isError:boolean;text:string}[]=[];
 models.setProvider({...base,auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:(model,context)=>{
  for(const message of context.messages)if(message.role==='system')for(const tool of message.toolsAdded??[])offered.add(tool.name);
  if(index>0){const result=context.messages.filter(m=>m.role==='toolResult').at(-1);if(result?.role==='toolResult')results.push({name:result.toolName,isError:!!result.isError,text:JSON.stringify(result.content)});}
  const call=plan[index++];const stream=createAssistantMessageEventStream();const message:AssistantMessage={role:'assistant',content:call?[{type:'toolCall',id:`local_fixture_${turn}_${index}`,name:call.name,arguments:call.arguments}]:[{type:'text',text:`Local fixture turn ${turn} completed`}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:call?'toolUse':'stop',timestamp:Date.now()};queueMicrotask(()=>stream.push({type:'done',reason:call?'toolUse':'stop',message}));return stream;
 }});
 const config={host:'isolated.invalid',port:6379,tls:true,graph:'fixture'};
 const engine=await Engine.open(directory,models,()=>new GraphMemory(config,async()=>({run:async query=>query==='RETURN 1 AS ok'?[{ok:1}]:[],close:async()=>{}})));
 const send=async(text:string,calls:typeof plan)=>{turn++;index=0;plan=calls;await engine.send(text,`local-harness-fixture-${turn}`);for(let i=0;i<300&&(engine.snapshot().busy||!engine.snapshot().messages.some(m=>m.text===`Local fixture turn ${turn} completed`));i++)await Bun.sleep(10);expect(engine.snapshot().messages.some(m=>m.text===`Local fixture turn ${turn} completed`)).toBe(true);};
 try{
  engine.saveProfile(defaultLook);await engine.setKey('synthetic-only-key');await engine.connectMemory(config);await engine.local.grant({path:folder,write:true,commands:false});
  await send('Find and inspect the Cedar task file in my allowed folder.',[{name:'pebble_local_folders',arguments:{}},{name:'pebble_local_find',arguments:{query:'cedar'}},{name:'pebble_local_read',arguments:{path:note}}]);
  expect(results.map(r=>r.name)).toEqual(['pebble_local_folders','pebble_local_find','pebble_local_read']);expect(results.every(r=>!r.isError)).toBe(true);expect(results[1].text).toContain(note);expect(results[2].text).toContain('Original task');expect(await readFile(note,'utf8')).toContain('Original task');
  await send('Update Original task to Updated task, and create summary.txt with Cedar summary.',[{name:'pebble_local_edit',arguments:{path:note,edits:[{oldText:'Original task',newText:'Updated task'}]}},{name:'pebble_local_write',arguments:{path:created,content:'Cedar summary\n'}}]);
  expect(results.map(r=>r.name)).toEqual(['pebble_local_folders','pebble_local_find','pebble_local_read','pebble_local_edit','pebble_local_write']);expect(results.every(r=>!r.isError)).toBe(true);expect(await readFile(note,'utf8')).toBe('Project Cedar\nUpdated task\n');expect(await readFile(created,'utf8')).toBe('Cedar summary\n');
  for(const name of ['folders','find','read','edit','write','command','command_result'])expect(offered.has(`pebble_local_${name}`)).toBe(true);
  const channel=(engine as unknown as {discordTools:{extension:{tools?:{name:string}[]}}}).discordTools.extension;expect(channel.tools?.some(tool=>tool.name.includes('local_'))).toBe(false);
  expect(engine.local.status().grants).toHaveLength(1);expect(engine.local.status().reviews).toHaveLength(0);
 }finally{await engine.close();await rm(directory,{recursive:true,force:true});}
},15000);
