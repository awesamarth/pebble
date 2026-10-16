import {test,expect} from 'bun:test';
import {DeviceCredentials,SessionCredentials} from './credentials';
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
