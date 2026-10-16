'use client';
import {useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import type {RuntimeStatus,OAuthView} from '../../runtime/contracts';
import ModelSettings from './model-settings';
type Persistence={supported:boolean;saved:boolean;state:'session'|'saved'|'not_saved'|'error';issue?:string};
export type ProviderConnectionProps={provider:(RuntimeStatus['provider']&{persistence?:Persistence})|undefined;online:boolean;pending:boolean;oauth:OAuthView;redirect:string;onRedirectChange:(value:string)=>void;onStartOAuth:()=>void;onCompleteOAuth:()=>void;onSaveKey:(key:string)=>Promise<boolean>;onSignOut:()=>void};
export default function ProviderConnection({provider,online,pending,oauth,redirect,onRedirectChange,onStartOAuth,onCompleteOAuth,onSaveKey,onSignOut}:ProviderConnectionProps){
 const [key,setKey]=useState('');const [saving,setSaving]=useState(false);const connected=!!provider?.method;const persistence=provider?.persistence;const secureFlowReady=!!persistence?.supported;
 return <article className="ws-connect-panel"><div className="ws-panel-title"><span className="ws-icon">✳</span><div><h2>{connected?'Your model connection':'Connect a model'}</h2><p>{connected?`${provider.method==='oauth'?'ChatGPT':'OpenAI API key'} · Connected`:'Choose how you’d like to connect to OpenAI'}</p></div></div>
 {connected?<>
 <p role="status">{persistence?.state==='saved'&&persistence.saved?'Your connection is saved securely on this Mac.':!persistence||persistence.state==='session'?'Connected. Secure saving becomes available after the next app update; sign in again then to save this connection.':persistence.state==='error'?'Connected, but your sign-in couldn’t be saved securely. Sign in again after pebble restarts.':persistence.supported?'Connected for now. Sign in again to save this connection securely.':'Connected for now. Secure saving isn’t available on this device; sign in again after pebble restarts.'}</p>
 {persistence?.issue&&<p role="alert">{persistence.issue}</p>}
 <ModelSettings authenticated method={provider.method} current={{model:provider.model,reasoning:provider.reasoning}}/><button className="ws-signout" disabled={pending||!online} onClick={onSignOut}>Sign out</button><small>Signing out disconnects this model and removes its saved sign-in.</small>
 </>:<>
 <p>Sign in with ChatGPT or use your own OpenAI API key. Your connection is saved securely in this device’s credential store.</p>{!secureFlowReady&&<p role="status">{!persistence?'Secure sign-in will be available after the next local app update. Your current settings are unchanged.':'Secure connection storage is not supported on this device in this version.'}</p>}
 {persistence?.issue&&<p role="alert">{persistence.issue}</p>}
 <button className="ws-oauth" disabled={pending||saving||!online||!secureFlowReady||oauth.state==='waiting'} onClick={onStartOAuth}>{oauth.state==='waiting'?'Waiting for sign-in…':'Sign in with ChatGPT'} <ArrowUpRight size={16}/></button>
 {oauth.message&&<p role={oauth.state==='error'?'alert':'status'}>{oauth.message}</p>}
 {oauth.url&&oauth.state==='waiting'&&<div className="ws-oauth-flow"><a href={oauth.url} target="_blank" rel="noopener noreferrer">Continue on OpenAI <ArrowUpRight size={14}/></a><p>Finish signing in, then return here.</p><details><summary>Sign-in didn’t finish?</summary><label>Final sign-in address<input type="password" autoComplete="off" value={redirect} onChange={e=>onRedirectChange(e.target.value)}/></label><small>Paste the final address from the sign-in window.</small><button className="ws-secondary" disabled={!redirect.trim()||pending||!online} onClick={onCompleteOAuth}>Complete sign-in</button></details></div>}
 <div className="ws-or">or use an API key</div><form aria-busy={saving||pending} onSubmit={e=>{e.preventDefault();setSaving(true);void onSaveKey(key).then(ok=>{if(ok)setKey('');}).finally(()=>setSaving(false));}}><label>OpenAI API key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="Enter your OpenAI API key" aria-describedby="provider-key-help"/></label><small>Chat messages use this key and may incur API charges. Saving it doesn’t send a chat message.</small><small id="provider-key-help" aria-live="polite">{!online?'Waiting for pebble to reconnect…':!key.trim()?'Enter your API key to continue.':saving||pending?'Saving your connection…':'Ready to save securely.'}</small><button disabled={!key.trim()||pending||saving||!online||!secureFlowReady} className="ws-secondary">{saving?'Saving…':'Save key securely'}</button></form>
 </>}
 </article>;
}
