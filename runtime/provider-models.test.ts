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
