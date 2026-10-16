import {test,expect} from 'bun:test';
import {Harness,createRegistry,type ConversationId} from '@earendil-works/pi-durable';
import {MemoryStorage} from '@earendil-works/pi-durable/storage/memory';
import {BACKGROUND_CONTEXT as ctx} from '@earendil-works/chord/context';
import {createModels,type AssistantMessage} from '@earendil-works/pi-ai';
import {openaiProvider} from '@earendil-works/pi-ai/providers/openai';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import {executionIdentity,executionIdentityExtension} from './execution-identity';
import {workspaceExtension} from './workspace-tools';
import {createDiscordTools} from './discord-tools';
function latestIdentity(messages:readonly unknown[]){let section='';for(const message of messages){const m=message as {role:string;sections?:Record<string,string|null>};if(m.role==='system'&&m.sections&&'runtime_execution'in m.sections)section=m.sections.runtime_execution??'';}return JSON.parse(section.replace(/^<runtime_execution>\n|\n<\/runtime_execution>$/g,''));}
test('Pi section tracks resolved provider/model/reasoning per request without changing historical identity or API options',async()=>{
 const base=openaiProvider(),models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});const identities:unknown[]=[];
 models.setProvider({...base,auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:(model,context,options)=>{
  const identity=latestIdentity(context.messages);expect(identity.provider).toBe(model.provider);expect(identity.modelId).toBe(model.id);expect(identity.requestedReasoning).toBe(options?.reasoning??'off');identities.push(identity);
  const retry=identities.length===1;const stream=createAssistantMessageEventStream();const message:AssistantMessage={role:'assistant',content:[{type:'text',text:'SYNTHETIC COMPLETE'}],provider:model.provider,api:model.api,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:retry?'error':'stop',...(retry?{errorMessage:'503 service unavailable'}:{}),timestamp:Date.now()};queueMicrotask(()=>{if(retry)stream.push({type:'error',reason:'error',error:message});else stream.push({type:'done',reason:'stop',message});});return stream;
 }});
 const identity=executionIdentityExtension(models),registry=createRegistry();registry.install(identity);const harness=await Harness.open(new MemoryStorage(),{models,registry,settings:{retry:{enabled:true,maxRetries:1,baseDelayMs:1}}},ctx);
 try{const root=await harness.root(ctx,{agent:{model:{provider:'openai',modelId:'gpt-6-sol'},thinkingLevel:'low',tools:[],extensions:[identity]}});
  await (await root.submit({type:'input',content:'What is your configuration?',requestId:'identity-one'},ctx)).wait(ctx);
  await root.configure({model:{provider:'openai',modelId:'gpt-4o'},thinkingLevel:'off'},ctx);harness.resume();
  await (await root.submit({type:'input',content:'And now?',requestId:'identity-two'},ctx)).wait(ctx);
  await root.configure({model:{provider:'openai',modelId:'gpt-6-sol'},thinkingLevel:'high'},ctx);harness.resume();
  await (await root.submit({type:'input',content:'And this turn?',requestId:'identity-three'},ctx)).wait(ctx);
  expect(identities).toMatchObject([{modelId:'gpt-6-sol',requestedReasoning:'low',adapterReasoningEffort:'low'},{modelId:'gpt-6-sol',requestedReasoning:'low',reasoningSupport:'supported',effectiveClientReasoning:'low',adapterReasoningEffort:'low'},{modelId:'gpt-4o',requestedReasoning:'off',reasoningSupport:'unsupported',effectiveClientReasoning:'unsupported',adapterReasoningEffort:'not_sent'},{modelId:'gpt-6-sol',requestedReasoning:'high',adapterReasoningEffort:'high'}]);
  const view=await root.context(ctx);expect(view.messages.filter(m=>m.role==='assistant').map(m=>m.model)).toEqual(['gpt-6-sol','gpt-4o','gpt-6-sol']);
  expect(JSON.stringify(identities)).not.toContain('synthetic');expect(JSON.parse(executionIdentity({model:undefined},models))).toMatchObject({requestedReasoning:'not_reported',reasoningSupport:'not_reported',effectiveClientReasoning:'not_reported'});
 }finally{await harness.close(ctx);}
});
test('unauthorized recovered private and channel conversations abort before any provider request',async()=>{
 for(const kind of ['private','channel']){
  let calls=0;let harness!:Harness;const base=openaiProvider(),models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});
  models.setProvider({...base,auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'synthetic'}})}},streamSimple:()=>{calls++;throw new Error('Provider must not run');}});
  const stop=(id:string)=>{void harness.conversation(Number(id) as ConversationId,ctx).then(c=>c?.abort(ctx));};
  const extension=kind==='private'?workspaceExtension({authorize:()=>false,stopInactive:stop,searchMemory:async()=>[],remember:async()=>{},canRemember:()=>false,listIncoming:async()=>[],createDraft:async()=>{}},'fixture_private'):createDiscordTools(stop).extension;
  const registry=createRegistry();registry.install(extension);harness=await Harness.open(new MemoryStorage(),{models,registry},ctx);
  try{const conversation=await harness.createConversation({ownership:{kind:'ownerless'},agent:{model:{provider:'openai',modelId:'gpt-6-sol'},tools:extension.tools,extensions:[extension]}},ctx);const submission=await conversation.submit({type:'input',content:'An interrupted request',requestId:`guard-${kind}`},ctx);await submission.wait(ctx);expect(calls).toBe(0);}
  finally{await harness.close(ctx);}
 }
},10000);
