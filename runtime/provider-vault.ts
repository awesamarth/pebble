import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export interface ProviderVault {readonly supported:boolean;get(id:string):Promise<string|null>;set(id:string,value:string):Promise<void>;delete(id:string):Promise<void>}
/** Secrets cross the native API only; unsupported platforms never fall back to files. */
export class MacProviderVault implements ProviderVault {
 readonly supported=process.platform==='darwin';private namespace:string;
 constructor(directory:string){this.namespace=createHash('sha256').update(resolve(directory)).digest('hex');}
 private async entry(id:string){if(!this.supported||id!=='openai')throw new Error('Secure provider storage unavailable');const {AsyncEntry}=await import('@napi-rs/keyring');return new AsyncEntry('com.pebble.provider',`${this.namespace}:${id}`);}
 async get(id:string){return (await this.entry(id)).getPassword(AbortSignal.timeout(10000));}
 async set(id:string,value:string){await (await this.entry(id)).setPassword(value,AbortSignal.timeout(10000));}
 async delete(id:string){await (await this.entry(id)).deleteCredential(AbortSignal.timeout(10000));}
}
