import {test,expect} from 'bun:test';import {createModels,Type} from '@earendil-works/pi-ai';import {normalizeContext} from '@earendil-works/pi-ai/utils/transcript';import {installSupportedProviders} from './model-providers';
test('installed Anthropic, Gemini and OpenRouter adapters serialize provider-specific requests without crossing endpoints or retrying',async()=>{
 const models=createModels({authContext:{env:async()=>undefined,fileExists:async()=>false}});installSupportedProviders(models);
 const originalFetch=globalThis.fetch;
 try{for(const provider of ['anthropic','google','openrouter']){
  const sdk=models.getProvider(provider)!;const model=models.getModels(provider).find(m=>provider==='openrouter'?m.id.startsWith('openai/gpt-4.1')&&m.api==='openai-completions':provider==='google'?m.id==='gemini-2.5-flash':m.id==='claude-sonnet-4-6')??models.getModels(provider).find(m=>m.api===(provider==='google'?'google-generative-ai':'anthropic-messages'))!;
  let calls=0,captured:{url:URL;headers:Headers;body:Record<string,unknown>}|undefined;
  globalThis.fetch=(async(input,init)=>{calls++;const request=new Request(input,init);captured={url:new URL(request.url),headers:request.headers,body:await request.json()};return Response.json({error:{message:'Synthetic provider access denied',code:403,status:'PERMISSION_DENIED',type:'permission_error'}},{status:403});}) as typeof fetch;
  const events=sdk.streamSimple(model,normalizeContext({tools:[{name:'fixture_tool',description:'Isolated test',parameters:Type.Object({query:Type.String()},{additionalProperties:false})}],messages:[{role:'user',content:'Synthetic transport test only',timestamp:1}]}),{apiKey:'synthetic-transport-only',maxRetries:0});
  const result=await events.result();expect(result.stopReason).toBe('error');expect(calls).toBe(1);expect(captured).toBeDefined();expect(captured!.url.hostname).toBe(provider==='anthropic'?'api.anthropic.com':provider==='google'?'generativelanguage.googleapis.com':'openrouter.ai');
  if(provider==='google'){expect(captured!.url.pathname).toContain(model.id);expect(captured!.headers.get('x-goog-api-key')??captured!.url.searchParams.get('key')).toBe('synthetic-transport-only');expect(captured!.body.contents).toBeArray();}
  else{expect(captured!.body.model).toBe(model.id);expect(captured!.headers.get(provider==='anthropic'?'x-api-key':'authorization')).toBe(provider==='anthropic'?'synthetic-transport-only':'Bearer synthetic-transport-only');expect(captured!.body.tools).toBeArray();}
 }}finally{globalThis.fetch=originalFetch;}
},15000);
