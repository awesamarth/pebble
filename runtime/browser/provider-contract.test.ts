import { expect, test } from 'bun:test';
import { Type, type Tool } from '@earendil-works/pi-ai';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { convertResponsesMessages, convertResponsesTools } from '@earendil-works/pi-ai/api/openai-responses-shared';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import { wrapBrowserProvider } from './provider';
const model=openaiProvider().getModels().find(m=>m.id==='gpt-6-sol')!;
const tool:Tool={name:'pebble_browser_observe',description:'Observe untrusted browser content',parameters:Type.Object({tabId:Type.String()},{additionalProperties:false})};
test('actual converter preserves bounded schema and requires app namespace grouping',()=>{
 const converted=convertResponsesTools([tool]);expect(converted[0]).toMatchObject({type:'function',name:tool.name,parameters:{type:'object',properties:{tabId:{type:'string'}},required:['tabId'],additionalProperties:false}});expect(converted[0]).not.toHaveProperty('namespace');
});
test('actual converter supports screenshots only with image-capable model',()=>{
 const context=normalizeContext({messages:[{role:'toolResult',toolCallId:'call_fixture|fc_fixture',toolName:tool.name,content:[{type:'text',text:'Untrusted screenshot'},{type:'image',mimeType:'image/png',data:'iVBORw0KGgo='}],isError:false,timestamp:1}]});
 expect(convertResponsesMessages(model,context,new Set(['openai']))).toEqual([{type:'function_call_output',call_id:'call_fixture',output:[{type:'input_text',text:'Untrusted screenshot'},{type:'input_image',detail:'auto',image_url:'data:image/png;base64,iVBORw0KGgo='}]}]);
 expect(convertResponsesMessages({...model,input:['text']},context,new Set(['openai']))).toEqual([{type:'function_call_output',call_id:'call_fixture',output:'Untrusted screenshot\n(tool image omitted: model does not support images)'}]);
});
for(const apiKey of ['synthetic-contract-token','sk-synthetic-contract-token'])test(`actual request conversion + namespace call response (${apiKey.startsWith('sk-')?'BYOK':'SIWC'}, isolated fetch)`,async()=>{
 let captured:{url:string;headers:Headers;body:Record<string,unknown>}|undefined;
 const provider=wrapBrowserProvider(openaiProvider());
 const events=provider.stream(model,normalizeContext({systemPrompt:'Use bounded tools',tools:[tool,{...tool,name:'other_safe_tool'}],messages:[{role:'user',content:'Observe fixture',timestamp:1}]}),{apiKey,maxRetries:0,temperature:0.2,maxTokens:500,cacheRetention:'long',onPayload(payload){return {...payload as object,tool_choice:'auto'};},fetch:(async(input: RequestInfo | URL,init?: RequestInit)=>{
 const request=new Request(input,init);captured={url:request.url,headers:request.headers,body:await request.json() as Record<string,unknown>};
 const item={type:'function_call',id:'fc_fixture',call_id:'call_fixture',name:tool.name,namespace:'pebble_browser',arguments:'{"tabId":"tab1"}',status:'completed'};
 const frames=[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,item_id:item.id,delta:item.arguments},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'resp_fixture',status:'completed',output:[item],usage:{input_tokens:0,output_tokens:0,total_tokens:0}}}];
 return new Response(frames.map(v=>`event: ${v.type}\ndata: ${JSON.stringify(v)}\n\n`).join(''),{headers:{'Content-Type':'text/event-stream'}});
 }) as typeof fetch});
 const result=await events.result();expect(result.stopReason).not.toBe('error');expect(result.content).toContainEqual(expect.objectContaining({type:'toolCall',name:tool.name,namespace:'pebble_browser',arguments:{tabId:'tab1'}}));
 expect(captured!.url).toBe('https://api.openai.com/v1/responses');expect(captured!.headers.get('authorization')).toBe(`Bearer ${apiKey}`);expect(captured!.body).toMatchObject({stream:true,store:false,tool_choice:'auto'});
 expect(captured!.body.tools).toEqual([...convertResponsesTools([{...tool,name:'other_safe_tool'}]),{type:'namespace',name:'pebble_browser',description:expect.any(String),tools:convertResponsesTools([tool])}]);
 if(!apiKey.startsWith('sk-'))for(const field of ['temperature','max_output_tokens','prompt_cache_retention','previous_response_id','background'])expect(captured!.body).not.toHaveProperty(field);
 expect(JSON.stringify(captured!.body.input)).not.toContain('"role":"system"');
});
