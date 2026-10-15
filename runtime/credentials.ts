import type { Credential, CredentialStore } from '@earendil-works/pi-ai';
/** Session-only secrets. No global credential files, browser storage or secret logging. */
export class SessionCredentials implements CredentialStore {
 private values=new Map<string,Credential>();private tail:Promise<unknown>=Promise.resolve();
 async read(id:string){return this.values.get(id);}
 async list(){return [...this.values].map(([providerId,c])=>({providerId,type:c.type}));}
 modify(id:string,fn:(c:Credential|undefined)=>Promise<Credential|undefined>){const p=this.tail.then(async()=>{const c=await fn(this.values.get(id));if(c)this.values.set(id,c);return this.values.get(id);});this.tail=p.catch(()=>{});return p;}
 async delete(id:string){const p=this.tail.then(()=>{this.values.delete(id);});this.tail=p.catch(()=>{});await p;}
}
