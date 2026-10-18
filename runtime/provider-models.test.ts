import {test,expect} from 'bun:test';
import {AccountModelCatalog} from './provider-models';
import type {ModelChoice} from './model-settings';
const compatible:ModelChoice[]=[{id:'one',name:'One',reasoningLevels:['off'],supportsImages:true},{id:'two',name:'Two',reasoningLevels:['off','low'],supportsImages:false}];
test('account catalogs parse both formats, intersect in server order and isolate cached credentials',async()=>{
 let calls=0;const fetcher=(async(_url:unknown,options:RequestInit)=>{calls++;expect(options.redirect).toBe('error');const bearer=(options.headers as Record<string,string>).Authorization;return Response.json(bearer==='Bearer oauth-secret'?{models:[{slug:'two',display_name:'Account Two',visibility:'list'},{slug:'one',visibility:'hidden'},{slug:'unknown',visibility:'list'}]}:{data:[{id:'one'},{id:'unknown'},{id:'two'},{id:'one'}]});}) as typeof fetch;
 const catalog=new AccountModelCatalog(fetcher);
 const [a,b]=await Promise.all([catalog.list('oauth','oauth-secret',compatible),catalog.list('oauth','oauth-secret',compatible)]);expect(calls).toBe(1);expect(a.map(m=>[m.id,m.name])).toEqual([['two','Account Two']]);expect(b).toEqual(a);
 expect((await catalog.list('api_key','different-secret',compatible)).map(m=>m.id)).toEqual(['one','two']);expect(calls).toBe(2);
 expect(await catalog.list('oauth','oauth-secret',[])).toEqual([]);expect(calls).toBe(2);
});
test('catalog failure is sanitized and never cached or replaced with fallback',async()=>{
 let calls=0;const catalog=new AccountModelCatalog((async()=>{calls++;throw new Error('secret provider payload');}) as unknown as typeof fetch);
 for(let i=0;i<2;i++)await expect(catalog.list('oauth','synthetic',compatible)).rejects.toThrow('Could not load models from your account.');
 expect(calls).toBe(2);
});

test('expired known catalog returns immediately during one background refresh; strict reads and new credentials wait',async()=>{
 let now=0,calls=0;let release!:(response:Response)=>void;
 const catalog=new AccountModelCatalog((async()=>{calls++;if(calls===1)return Response.json({data:[{id:'one'}]});return new Promise<Response>(resolve=>{release=resolve;});}) as unknown as typeof fetch,()=>now);
 await catalog.list('api_key','synthetic',compatible);now=300001;
 const start=performance.now();expect((await catalog.list('api_key','synthetic',compatible,{staleWhileRefresh:true})).map(m=>m.id)).toEqual(['one']);
 console.log(`catalog stale return: ${(performance.now()-start).toFixed(1)} ms (refresh held unresolved)`);
 expect(calls).toBe(2);await catalog.list('api_key','synthetic',compatible,{staleWhileRefresh:true});expect(calls).toBe(2);
 let strictDone=false;const strict=catalog.list('api_key','synthetic',compatible).then(value=>{strictDone=true;return value;});await Bun.sleep(10);expect(strictDone).toBe(false);
 release(Response.json({data:[{id:'two'}]}));expect((await strict).map(m=>m.id)).toEqual(['two']);
 let newDone=false;const fresh=catalog.list('api_key','new-synthetic',compatible,{staleWhileRefresh:true}).then(value=>{newDone=true;return value;});await Bun.sleep(10);expect(newDone).toBe(false);expect(calls).toBe(3);release(Response.json({data:[{id:'one'}]}));await fresh;
});

test('transient refresh failure keeps known choices with backoff; explicit reads fail and rejected auth invalidates stale choices',async()=>{
 let now=0,calls=0,status=200;
 const catalog=new AccountModelCatalog((async()=>{calls++;return status===200?Response.json({models:[{slug:'one',visibility:'list'}]}):Response.json({}, {status});}) as unknown as typeof fetch,()=>now);
 await catalog.list('oauth','synthetic',compatible);now=300001;status=503;
 expect((await catalog.list('oauth','synthetic',compatible,{staleWhileRefresh:true})).map(m=>m.id)).toEqual(['one']);await Bun.sleep(0);expect(calls).toBe(2);
 await catalog.list('oauth','synthetic',compatible,{staleWhileRefresh:true});expect(calls).toBe(2);
 await expect(catalog.list('oauth','synthetic',compatible)).rejects.toThrow('Could not load models');expect(calls).toBe(3);
 now+=30001;status=401;await catalog.list('oauth','synthetic',compatible,{staleWhileRefresh:true});await Bun.sleep(0);
 await expect(catalog.list('oauth','synthetic',compatible,{staleWhileRefresh:true})).rejects.toThrow('Could not load models');expect(calls).toBe(5);
});
