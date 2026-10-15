import {test,expect} from 'bun:test';
import {workspaceExtension,type WorkspaceCallbacks} from './workspace-tools';

test('private workspace tools gate memory writes, bound incoming content and propose without sending',async()=>{
 let authorized=false,remembered=0,drafted=0;
 const host:WorkspaceCallbacks={searchMemory:async query=>({query}),canRemember:()=>authorized,remember:async()=>{remembered++;return {saved:true};},listIncoming:async()=>Array.from({length:30},()=>({provider:'discord',text:'x'.repeat(5000)})),createDraft:async()=>{drafted++;return {id:'review-1',state:'pending'};}};
 const tools=workspaceExtension(host).tools!;
 const call=async(name:string,args:unknown={})=>(tools.find(tool=>tool.name===name)!.execute as any)(args);
 expect((await call('pebble_memory_remember',{text:'A fact',sourceId:'user-source'})).isError).toBe(true);expect(remembered).toBe(0);
 authorized=true;await call('pebble_memory_remember',{text:'A fact',sourceId:'user-source'});expect(remembered).toBe(1);
 const incoming=JSON.parse((await call('pebble_incoming_messages')).output[0].text);expect(incoming.untrusted).toBe(true);expect(incoming.messages.length).toBe(20);expect(incoming.messages[0].text.length).toBe(4000);
 const proposed=await call('pebble_message_draft',{provider:'discord',account:'bot',destination:'123',guildId:'456',content:'Hello'});expect(drafted).toBe(1);expect(proposed.control.terminate).toBe(true);expect(JSON.parse(proposed.output[0].text).review.state).toBe('pending');
 await call('pebble_message_draft',{provider:'discord',account:'bot',destination:'123',content:'x'.repeat(2001)});expect(drafted).toBe(1);
});
