import {test,expect} from 'bun:test';
import {DeviceCredentials,SessionCredentials,routedCredentialStore} from './credentials';
import type {ProviderVault} from './provider-vault';
test('device credentials persist login and refresh, serialize writes and retain auth on secure-store failures',async()=>{
 let raw:string|null=null,reads=0,fail=false;const vault:ProviderVault={supported:true,get:async()=>{reads++;return raw;},set:async(_id,value)=>{if(fail)throw new Error('synthetic secret must not escape');raw=value;},delete:async()=>{if(fail)throw new Error('synthetic');raw=null;}};
 const a=new DeviceCredentials('/tmp/synthetic',vault);await a.modify('openai',async()=>({type:'oauth',access:'synthetic-a',refresh:'synthetic-r',expires:1}));
 expect(a.persistenceStatus('openai').state).toBe('saved');const b=new DeviceCredentials('/tmp/synthetic',vault);expect((await b.read('openai'))?.type).toBe('oauth');await b.read('openai');expect(reads).toBe(2);
 await b.modify('openai',async c=>c?.type==='oauth'?{...c,refresh:'rotated',access:'new'}:c);expect(JSON.parse(raw!).credential.refresh).toBe('rotated');
 fail=true;await expect(b.modify('openai',async()=>({type:'api_key',key:'new-key'}))).rejects.toThrow('could not be saved');expect((await b.read('openai'))?.type).toBe('oauth');await expect(b.delete('openai')).rejects.toThrow('not signed out');expect((await b.read('openai'))?.type).toBe('oauth');
 fail=false;await b.delete('openai');expect(await b.read('openai')).toBeUndefined();expect(raw).toBeNull();expect(b.persistenceStatus('openai').state).toBe('not_saved');
 expect(new SessionCredentials().persistenceStatus('openai')).toEqual({state:'session',supported:false,saved:false});
});
test('unreadable native storage fails closed without exposing its error',async()=>{
 const a=new DeviceCredentials('/tmp/synthetic',{supported:true,get:async()=>{throw new Error('PRIVATE TOKEN');},set:async()=>{},delete:async()=>{}});
 expect(await a.read('openai')).toBeUndefined();expect(a.persistenceStatus('openai').state).toBe('error');expect(JSON.stringify(a.persistenceStatus('openai'))).not.toContain('PRIVATE');await expect(a.modify('openai',async()=>({type:'api_key',key:'synthetic'}))).rejects.toThrow('could not be read');
});

test('provider slots coexist securely, list all restored metadata and sign out independently',async()=>{
 const values=new Map<string,string>();const writes:string[]=[];const vault:ProviderVault={supported:true,get:async id=>values.get(id)??null,set:async(id,value)=>{writes.push(id);values.set(id,value);},delete:async id=>{values.delete(id);}};
 const store=new DeviceCredentials('/tmp/synthetic-multi',vault);
 await store.modify('openai',async()=>({type:'oauth',access:'synthetic-chatgpt',refresh:'synthetic-refresh',expires:1}));
 for(const id of ['openai_api','anthropic','google','openrouter'])await store.modify(id,async()=>({type:'api_key',key:`synthetic-${id}`}));
 expect(writes).toEqual(['openai','openai_api','anthropic','google','openrouter']);
 const restored=new DeviceCredentials('/tmp/synthetic-multi',vault);const metadata=await restored.list();
 expect(metadata.map(item=>item.providerId).sort()).toEqual(['anthropic','google','openai','openai_api','openrouter']);expect(JSON.stringify(metadata)).not.toContain('synthetic-');
 for(const id of ['openai','openai_api','anthropic','google','openrouter'])expect(restored.persistenceStatus(id).saved).toBe(true);
 await restored.delete('anthropic');expect(await restored.read('anthropic')).toBeUndefined();expect((await restored.read('openai'))?.type).toBe('oauth');expect((await restored.read('openai_api'))?.type).toBe('api_key');expect(values.size).toBe(4);
 for(const id of ['openai_api','anthropic','google','openrouter'])await expect(restored.modify(id,async()=>({type:'oauth',access:'synthetic',refresh:'synthetic',expires:1}))).rejects.toThrow('Invalid');
 await expect(restored.read('unsupported')).rejects.toThrow('Unsupported');await expect(restored.modify('unsupported',async()=>({type:'api_key',key:'synthetic'}))).rejects.toThrow('Unsupported');await expect(restored.delete('unsupported')).rejects.toThrow('Unsupported');
});

test('routed SDK reads, refreshes and deletes select distinct active OpenAI slots dynamically',async()=>{
 const store=new SessionCredentials();await store.modify('openai',async()=>({type:'oauth',access:'synthetic-chatgpt',refresh:'synthetic-refresh',expires:1}));await store.modify('openai_api',async()=>({type:'api_key',key:'synthetic-openai'}));await store.modify('google',async()=>({type:'api_key',key:'synthetic-google'}));
 let openaiSlot='openai';const routed=routedCredentialStore(store,provider=>provider==='openai'?openaiSlot:provider);
 expect((await routed.read('openai'))?.type).toBe('oauth');openaiSlot='openai_api';expect((await routed.read('openai'))?.type).toBe('api_key');
 await routed.modify('openai',async()=>({type:'api_key',key:'synthetic-rotated'}));expect((await store.read('openai'))?.type).toBe('oauth');
 expect(await routed.list()).toEqual([{providerId:'openai',type:'api_key'},{providerId:'google',type:'api_key'}]);
 await routed.delete('openai');expect(await store.read('openai_api')).toBeUndefined();expect((await store.read('openai'))?.type).toBe('oauth');expect((await routed.read('google'))?.type).toBe('api_key');
 openaiSlot='openai';await routed.modify('openai',async c=>c?.type==='oauth'?{...c,access:'synthetic-refreshed'}:c);expect((await routed.read('openai'))?.type).toBe('oauth');expect((await routed.list()).find(item=>item.providerId==='openai')?.type).toBe('oauth');
 await expect(routed.read('unsupported')).rejects.toThrow('Unsupported');
});


test('OAuth write override preserves active API reads and ordinary delete routing',async()=>{
 const store=new SessionCredentials();await store.modify('openai_api',async()=>({type:'api_key',key:'synthetic-api'}));
 const routed=routedCredentialStore(store,id=>id==='openai'?'openai_api':id,id=>id);
 await routed.modify('openai',async()=>({type:'oauth',access:'synthetic-login',refresh:'synthetic-refresh',expires:1}));
 expect((await store.read('openai'))?.type).toBe('oauth');expect((await routed.read('openai'))?.type).toBe('api_key');
 expect((await routed.list()).find(item=>item.providerId==='openai')?.type).toBe('api_key');
 await routed.delete('openai');expect(await store.read('openai_api')).toBeUndefined();expect((await store.read('openai'))?.type).toBe('oauth');
});
