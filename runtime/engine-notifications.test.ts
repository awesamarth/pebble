import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createModels,type AssistantMessage} from '@earendil-works/pi-ai';import {openaiProvider} from '@earendil-works/pi-ai/providers/openai';import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import {Engine} from './engine';import {defaultLook} from './contracts';import type {DiscordSocket} from './integrations/discord';

test('real Engine Gateway -> scoped Pi tools -> durable reminders and private completion -> mock Discord delivery exactly once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pebble-engine-notifications-'));const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}}),base=openaiProvider();const sends:Array<{content:string;nonce:string;allowed_mentions:unknown}>=[];const tools:string[]=[];const receipts:unknown[]=[];let socket!:DiscordSocket;
 models.setProvider({...base,auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:(model,context)=>{
  const stream=createAssistantMessageEventStream();const results=context.messages.filter(m=>m.role==='toolResult');
  const privateLane=context.messages.some(m=>m.role==='system'&&m.toolsAdded?.some(t=>t.name==='pebble_private_work_memory_search'));
  const serialized=JSON.stringify(context);if(!privateLane)expect(serialized).not.toContain('PRIVATE_SENTINEL');
  const reminder=!serialized.includes('Check my private task fixture');
  const name=reminder?'pebble_discord_reminder':'pebble_private_task';
  const call=!privateLane&&!results.length?name:undefined;if(call)tools.push(call);receipts.push(...results);
  const message:AssistantMessage={role:'assistant',content:call?[{type:'toolCall',id:`fixture-${name}`,name:call,arguments:{}}]:[{type:'text',text:privateLane?'PRIVATE_SENTINEL':reminder?'Your reminder is scheduled.':'Your private task has started.'}],provider:'openai',api:'openai-responses',model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:call?'toolUse':'stop',timestamp:Date.now()};queueMicrotask(()=>stream.push({type:'done',reason:call?'toolUse':'stop',message}));return stream;
 }});
 const engine=await Engine.open(dir,models,undefined,{vault:{supported:false,get:async()=>null,set:async()=>{},delete:async()=>{}},discord:{setTimer:()=>0,clearTimer:()=>{},socket:()=>socket={send(){},close(){},onmessage:null,onclose:null,onerror:null},fetch:(async(input,init)=>{const url=String(input);if(url.endsWith('/gateway/bot'))return Response.json({url:'wss://gateway.discord.gg'});if(url.endsWith('/channels/444444'))return Response.json({guild_id:'333333'});if(url.endsWith('/messages')){sends.push(JSON.parse(String(init?.body)));return Response.json({id:String(900000+sends.length),channel_id:'444444'});}throw Error(`Unexpected mock network route: ${url}`);}) as typeof fetch}});
 const wait=async(predicate:()=>boolean)=>{for(let i=0;i<200&&!predicate();i++)await Bun.sleep(10);expect(predicate()).toBe(true);};
 try{
  engine.saveProfile(defaultLook);await engine.setKey('synthetic-isolated-key');expect(engine.notifications.status().enabled).toBe(false);
  await engine.integrations.configureDiscord({token:'SYNTHETIC_TOKEN',guildIds:['333333'],channelIds:['444444'],ingestEnabled:true,allowSend:true,ownerId:'222222',replyMode:'owner-mentions'});
  const packet=(t:string,d:unknown)=>socket.onmessage?.({data:JSON.stringify({op:0,t,d})});packet('READY',{user:{id:'111111'},session_id:'synthetic',resume_gateway_url:'wss://gateway.discord.gg'});engine.notifications.setEnabled(true);
  const reminder={id:'777777',guild_id:'333333',channel_id:'444444',author:{id:'222222'},mentions:[{id:'111111'}],content:'<@111111> remind me in 1 seconds to stretch'};packet('MESSAGE_CREATE',reminder);packet('MESSAGE_CREATE',reminder);
  await wait(()=>engine.notifications.status().items.some(x=>x.kind==='reminder'));await wait(()=>sends.length===1);
  const scheduled=engine.notifications.status().items.find(x=>x.kind==='reminder')!;expect(scheduled.destination).toEqual({botId:'111111',ownerId:'222222',guildId:'333333',channelId:'444444'});expect(scheduled.message).toBe('Reminder: stretch');
  await Bun.sleep(Math.max(0,scheduled.dueAt-Date.now()+20));await engine.notifications.tick();await engine.notifications.tick();expect(sends.filter(x=>x.content==='Reminder: stretch')).toHaveLength(1);expect(engine.notifications.status().items.find(x=>x.id===scheduled.id)?.state).toBe('sent');
  const work={...reminder,id:'888888',content:'<@111111> Check my private task fixture and notify me when done'};packet('MESSAGE_CREATE',work);packet('MESSAGE_CREATE',work);
  await wait(()=>engine.privateWorkItems()[0]?.state==='completed');await wait(()=>engine.notifications.status().items.some(x=>x.kind==='task-completion'));await engine.notifications.tick();await engine.notifications.tick();
  expect(engine.privateWorkItems()).toHaveLength(1);expect(engine.privateWorkItems()[0].result).toBe('PRIVATE_SENTINEL');expect(sends.filter(x=>x.content.startsWith('Your private task is ready in pebble.'))).toHaveLength(1);expect(JSON.stringify(sends)).not.toContain('PRIVATE_SENTINEL');expect(JSON.stringify(receipts)).not.toContain('PRIVATE_SENTINEL');expect(tools).toEqual(['pebble_discord_reminder','pebble_private_task']);expect(engine.notifications.status().items).toHaveLength(2);expect(new Set(sends.map(x=>x.nonce)).size).toBe(sends.length);
 }finally{await engine.close();await rm(dir,{recursive:true,force:true});}
},15000);
