import type { Credential, CredentialStore } from '@earendil-works/pi-ai';
import {MacProviderVault,type ProviderVault} from './provider-vault';
export type PersistenceStatus={state:'session'|'saved'|'not_saved'|'error';supported:boolean;saved:boolean;issue?:string};
/** Session-only default remains useful for isolated tests. */
export class SessionCredentials implements CredentialStore {
 protected values=new Map<string,Credential>();protected tail:Promise<unknown>=Promise.resolve();
 async read(id:string){return this.values.get(id);}
 async list(){return [...this.values].map(([providerId,c])=>({providerId,type:c.type}));}
 persistenceStatus(_id:string):PersistenceStatus{return {state:'session',supported:false,saved:false};}
 modify(id:string,fn:(c:Credential|undefined)=>Promise<Credential|undefined>){const p=this.tail.then(async()=>{const c=await fn(this.values.get(id));if(c)this.values.set(id,c);return this.values.get(id);});this.tail=p.catch(()=>{});return p;}
 async delete(id:string){const p=this.tail.then(()=>{this.values.delete(id);});this.tail=p.catch(()=>{});await p;}
}
function validCredential(value:unknown):value is Credential {
 if(!value||typeof value!=='object')return false;const c=value as Record<string,unknown>;
 return c.type==='api_key'?typeof c.key==='string'&&!!c.key:c.type==='oauth'&&typeof c.access==='string'&&!!c.access&&typeof c.refresh==='string'&&!!c.refresh&&typeof c.expires==='number'&&Number.isFinite(c.expires);
}
/** Project-scoped OS storage. Native writes complete before session state changes. */
export class DeviceCredentials extends SessionCredentials {
 private vault:ProviderVault;private loads=new Map<string,Promise<void>>();private states=new Map<string,PersistenceStatus>();
 constructor(directory:string,vault?:ProviderVault){super();this.vault=vault??new MacProviderVault(directory);}
 persistenceStatus(id:string):PersistenceStatus{return this.states.get(id)??{state:'not_saved',supported:this.vault.supported&&id==='openai',saved:false};}
 private issue(id:string,saved=false){this.states.set(id,{state:'error',supported:this.vault.supported&&id==='openai',saved,issue:'Secure sign-in storage is unavailable. Unlock macOS Keychain and allow pebble access, then try again.'});}
 private load(id:string){let pending=this.loads.get(id);if(!pending){pending=(async()=>{if(!this.vault.supported||id!=='openai')return;try{const raw=await this.vault.get(id);if(raw===null){this.states.set(id,{state:'not_saved',supported:true,saved:false});return;}if(raw.length>100000)throw new Error('Invalid stored credential');const data=JSON.parse(raw);if(data.version!==1||!validCredential(data.credential))throw new Error('Invalid stored credential');this.values.set(id,data.credential);this.states.set(id,{state:'saved',supported:true,saved:true});}catch{this.issue(id);}})();this.loads.set(id,pending);}return pending;}
 async read(id:string){await this.load(id);return this.values.get(id);}
 async list(){await this.load('openai');return super.list();}
 modify(id:string,fn:(c:Credential|undefined)=>Promise<Credential|undefined>){const p=this.tail.then(async()=>{await this.load(id);if(this.persistenceStatus(id).state==='error'&&!this.values.has(id))throw new Error('Secure sign-in storage could not be read. Unlock Keychain and restart pebble before signing in.');if(!this.vault.supported||id!=='openai')throw new Error('Secure connection storage is not supported on this device in this version.');const next=await fn(structuredClone(this.values.get(id)));if(!next)return this.values.get(id);if(!validCredential(next))throw new Error('Invalid sign-in credential');try{await this.vault.set(id,JSON.stringify({version:1,credential:next}));}catch{this.issue(id,this.persistenceStatus(id).saved);throw new Error('Sign-in could not be saved securely. Unlock macOS Keychain and try again.');}this.values.set(id,structuredClone(next));this.states.set(id,{state:'saved',supported:true,saved:true});return this.values.get(id);});this.tail=p.catch(()=>{});return p;}
 async delete(id:string){const p=this.tail.then(async()=>{await this.load(id);try{await this.vault.delete(id);}catch{this.issue(id,this.persistenceStatus(id).saved);throw new Error('Saved sign-in could not be removed. Unlock macOS Keychain and try again; you are not signed out.');}this.values.delete(id);this.states.set(id,{state:'not_saved',supported:this.vault.supported&&id==='openai',saved:false});});this.tail=p.catch(()=>{});await p;}
}
