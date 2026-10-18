import {createHash} from 'node:crypto';import {resolve} from 'node:path';
export interface TokenVault{readonly supported:boolean;get():Promise<string|null>;set(value:string):Promise<void>;delete():Promise<void>}
/** Native OS credential boundary. No subprocess arguments, SQLite, files or browser storage contain the secret. */
export class MacDiscordVault implements TokenVault{
 readonly supported=process.platform==='darwin';private account:string;
 constructor(directory:string){this.account=createHash('sha256').update(resolve(directory)).digest('hex');}
 private async entry(){if(!this.supported)throw new Error('Secure token saving is currently supported on macOS only.');const {AsyncEntry}=await import('@napi-rs/keyring');return new AsyncEntry('com.pebble.discord',this.account);}
 async get(){if(!this.supported)throw new Error('Secure token saving is currently supported on macOS only.');try{return await (await this.entry()).getPassword(AbortSignal.timeout(10000));}catch{throw new Error('Unlock macOS Keychain and allow pebble access, then try again.');}}
 async set(value:string){if(!this.supported)throw new Error('Secure token saving is currently supported on macOS only.');try{await (await this.entry()).setPassword(value,AbortSignal.timeout(10000));}catch{throw new Error('The token could not be saved in macOS Keychain. Unlock it and allow access, then try again.');}}
 async delete(){if(!this.supported)throw new Error('Secure token saving is currently supported on macOS only.');try{await (await this.entry()).deleteCredential(AbortSignal.timeout(10000));}catch{throw new Error('The saved token could not be removed from macOS Keychain. Unlock it and try again.');}}
}

/** Gmail configuration and OAuth session use a separate project-scoped native entry. */
export class MacGmailVault implements TokenVault{
 readonly supported=process.platform==='darwin';private account:string;
 constructor(directory:string){this.account=createHash('sha256').update(resolve(directory)).digest('hex');}
 private async entry(){if(!this.supported)throw new Error('Secure Gmail storage requires macOS Keychain.');const {AsyncEntry}=await import('@napi-rs/keyring');return new AsyncEntry('com.pebble.gmail',this.account);}
 async get(){try{return await (await this.entry()).getPassword(AbortSignal.timeout(10000));}catch{throw new Error('Unlock macOS Keychain to restore Gmail.');}}
 async set(value:string){try{await (await this.entry()).setPassword(value,AbortSignal.timeout(10000));}catch{throw new Error('Gmail could not be saved in macOS Keychain.');}}
 async delete(){try{await (await this.entry()).deleteCredential(AbortSignal.timeout(10000));}catch{throw new Error('Gmail could not be removed from macOS Keychain.');}}
}
