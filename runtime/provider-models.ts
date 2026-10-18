import {createHash} from 'node:crypto';
import type {ModelChoice} from './model-settings';
type Entry={id:string;name?:string};
class CatalogLoadError extends Error{constructor(readonly authRejected=false){super('Could not load models from your account. Check your connection or sign in again. No model was changed.');}}
/** Account-listed models, intersected with local transport support. Listing is not an inference guarantee. */
export class AccountModelCatalog{
 private cache=new Map<string,{expires:number;entries:Entry[];retryAfter?:number}>();
 private pending=new Map<string,Promise<Entry[]>>();
 constructor(private fetcher:typeof fetch=fetch,private now:()=>number=Date.now){}
 async list(method:'api_key'|'oauth',bearer:string,compatible:ModelChoice[],options:{staleWhileRefresh?:boolean}={}):Promise<ModelChoice[]>{
  if(!bearer||/[\r\n]/.test(bearer))throw new Error('Reconnect your model account to load its models.');
  const key=createHash('sha256').update(`${method}\0${bearer}`).digest('hex');
  const cached=this.cache.get(key);let entries:Entry[];
  if(cached&&cached.expires>this.now())entries=cached.entries;
  else{
   if(cached&&options.staleWhileRefresh){
    entries=cached.entries;
    // A known account catalog can serve this turn while a single refresh runs.
    if(!cached.retryAfter||cached.retryAfter<=this.now())void this.refresh(key,method,bearer).catch(()=>{});
   }else entries=await this.refresh(key,method,bearer);
  }
  const supported=new Map(compatible.map(choice=>[choice.id,choice]));
  return entries.flatMap(entry=>{const choice=supported.get(entry.id);return choice?[{...choice,reasoningLevels:[...choice.reasoningLevels],name:entry.name??choice.name}]:[];});
 }
 private refresh(key:string,method:'api_key'|'oauth',bearer:string):Promise<Entry[]>{
  const pending=this.pending.get(key);if(pending)return pending;
  const request=this.load(method,bearer).then(entries=>{if(!this.cache.has(key)&&this.cache.size>=32)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{expires:this.now()+300_000,entries});return entries;}).catch(error=>{
   if(error instanceof CatalogLoadError&&error.authRejected)this.cache.delete(key);
   else{const cached=this.cache.get(key);if(cached)cached.retryAfter=this.now()+30_000;}
   throw error;
  }).finally(()=>this.pending.delete(key));
  this.pending.set(key,request);return request;
 }
 private async load(method:'api_key'|'oauth',bearer:string):Promise<Entry[]>{
  try{
   const response=await this.fetcher('https://api.openai.com/v1/models',{method:'GET',headers:{Authorization:`Bearer ${bearer}`},signal:AbortSignal.timeout(10_000),redirect:'error'});
   if(!response.ok)throw new CatalogLoadError(response.status===401||response.status===403);
   const body=await response.json() as Record<string,unknown>;
   const raw=method==='oauth'?body.models:body.data;
   if(!Array.isArray(raw))throw new Error('Invalid account catalog');
   const seen=new Set<string>();const entries:Entry[]=[];
   for(const row of raw.slice(0,500)){
    if(!row||typeof row!=='object')continue;const item=row as Record<string,unknown>;
    if(method==='oauth'&&item.visibility!=='list')continue;
    const id=method==='oauth'?item.slug:item.id;
    if(typeof id!=='string'||!id||id.length>200||seen.has(id))continue;
    seen.add(id);entries.push({id,name:method==='oauth'&&typeof item.display_name==='string'&&item.display_name.trim()?item.display_name.slice(0,200):undefined});
   }
   return entries;
  }catch(error){throw error instanceof CatalogLoadError?error:new CatalogLoadError();}
 }
}
