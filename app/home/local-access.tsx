'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {FolderOpen,RefreshCw} from 'lucide-react';
import './local-access.css';

type Grant={id:string;path:string;write:boolean;commands:boolean};
type Review={id:string;grantId:string;command:string;cwd:string;state:string;createdAt:number;output?:string;exitCode?:number;issue?:string};
type Access={grants:Grant[];commandAvailable:boolean;commandIssue?:string;reviews:Review[];activity:{operation:string;path?:string;at:number;state:string}[]};
const reviewLabels:Record<string,string>={pending:'Needs your review',awaiting_approval:'Needs your review',approved:'Approved',running:'Running',completed:'Completed',rejected:'Declined',failed:'Couldn’t complete',expired:'Expired',unknown:'Interrupted — check the result'};
const date=(at:number)=>Number.isFinite(at)?new Date(at).toLocaleString():'';
export default function LocalAccess(){
 const[data,setData]=useState<Access>();const[path,setPath]=useState('');const[write,setWrite]=useState(false);const[commands,setCommands]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');const[loadError,setLoadError]=useState('');const[busy,setBusy]=useState('');const[refreshing,setRefreshing]=useState(false);
 const focusInput=useRef(false);const mounted=useRef(false);const request=useRef<AbortController|null>(null);const acting=useRef(false);const input=useRef<HTMLInputElement>(null);
 const refresh=useCallback(async()=>{
  if(request.current||acting.current)return;
  const controller=new AbortController();request.current=controller;setRefreshing(true);
  try{const response=await fetch('/api/runtime/local-access',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error(response.status===404?'Folder access is not available in the running app yet.':'Folder access couldn’t refresh. Try again.');const value=await response.json() as Access;if(!Array.isArray(value.grants)||!Array.isArray(value.reviews)||!Array.isArray(value.activity))throw Error('Folder access couldn’t load. Try refreshing.');if(mounted.current){setData(value);setLoadError('');}}
  catch(reason){if(mounted.current&&!controller.signal.aborted)setLoadError(reason instanceof Error?reason.message:'Folder access couldn’t refresh.');}
  finally{if(request.current===controller)request.current=null;if(mounted.current)setRefreshing(false);}
 },[]);
 useEffect(()=>{mounted.current=true;void refresh();const timer=setInterval(()=>void refresh(),4000);return()=>{mounted.current=false;clearInterval(timer);request.current?.abort();request.current=null;};},[refresh]);
 async function act(action:string,body:unknown,success:string){
  if(acting.current)return;acting.current=true;request.current?.abort();request.current=null;setRefreshing(false);setBusy(action);setError('');setNotice('');
  try{const response=await fetch(`/api/runtime/local-access/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json().catch(()=>null);if(!response.ok)throw Error(value?.error||'This change couldn’t be confirmed. Refresh to check before trying again.');if(mounted.current){setNotice(success);if(action==='grant'){setPath('');setWrite(false);setCommands(false);focusInput.current=true;}}}
  catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:'This change couldn’t be confirmed. Refresh to check before trying again.');}
  finally{acting.current=false;if(mounted.current){setBusy('');void refresh();}}
 }
 useEffect(()=>{if(!busy&&focusInput.current){focusInput.current=false;input.current?.focus();}},[busy]);
 const validPath=path.trim().startsWith('/')&&path.trim()!=='/';const disabled=!!busy||!data;
 return <section className="local-access" aria-labelledby="local-access-title" aria-busy={!!busy}>
  <header className="local-access-heading"><div><span className="eyebrow">ON THIS MAC</span><h2 id="local-access-title"><FolderOpen size={18} aria-hidden="true"/>Local access</h2></div><button className="ws-text-button" disabled={!!busy||refreshing} onClick={()=>void refresh()}><RefreshCw size={13} aria-hidden="true"/>{refreshing?'Refreshing…':'Refresh'}</button></header>
  <p>Choose a folder your pebble can use. Nothing is accessible until you add a folder. Files it reads may be sent to your selected AI provider.</p>
  {(error||loadError)&&<p className="local-access-error" role="alert">{error||loadError}</p>}{notice&&<p className="local-access-notice" role="status">{notice}</p>}{busy&&<p role="status">{busy==='grant'?'Saving folder access…':busy==='revoke'?'Removing folder access…':'Submitting your command review…'}</p>}
  {!data&&!loadError&&<p role="status">Checking folder access…</p>}
  <form onSubmit={event=>{event.preventDefault();if(validPath&&!disabled)void act('grant',{path:path.trim(),write,commands:commands&&data?.commandAvailable===true},'Folder access saved. Check its permissions below.');}}>
   <label htmlFor="local-folder">Folder path</label><input ref={input} id="local-folder" value={path} onChange={event=>setPath(event.target.value)} placeholder="/Users/you/Documents/project" autoComplete="off" spellCheck={false} disabled={disabled} aria-describedby="local-folder-help"/>
   <small id="local-folder-help">{path&&!validPath?'Enter a full folder path beginning with /, rather than the whole Mac.':'Use the full path to one folder. Reading files is included.'}</small>
   <label className="local-access-check"><input type="checkbox" checked={write} onChange={event=>setWrite(event.target.checked)} disabled={disabled}/>Allow editing and creating files</label>
   <label className="local-access-check"><input type="checkbox" checked={commands} onChange={event=>setCommands(event.target.checked)} disabled={disabled||!data?.commandAvailable} aria-describedby="local-command-help"/>Allow commands, with a review each time</label>
   <small id="local-command-help">{data&&!data.commandAvailable?(data.commandIssue||'Commands are unavailable on this Mac. You can still allow file access.'):'You review the exact command and folder before each run. Commands run on a temporary copy. Network access is blocked; runs stop after 30 seconds.'}</small>
   <button className="ws-secondary" disabled={disabled||!validPath}>{busy==='grant'?'Saving folder…':'Allow this folder'}</button>
  </form>
  <details className="local-access-details"><summary>What this access allows</summary><p>Access stays inside the folders you choose. Hidden files and known credential names or patterns are excluded; links to other files or folders are not followed. Editing lets your pebble update or create text files up to 512 KB in existing folders. Commands run on an isolated, temporary copy of your folder; their changes do not affect your original files. Removing a folder stops future access; it does not undo earlier changes or information already sent to your AI provider.</p></details>
  {data&&<><h3>Allowed folders</h3>{!data.grants.length&&<p className="local-access-empty">No folders allowed. File access and commands are off.</p>}<div>{data.grants.map(grant=><article className="local-access-grant" key={grant.id}><div><strong>{grant.path}</strong><small>Read{grant.write?' · Edit & create':''}{grant.commands?' · Commands need review':''}</small></div><button className="ws-text-button" disabled={!!busy} onClick={()=>void act('revoke',{id:grant.id},'Folder access removed.')}>Remove access<span className="local-access-sr"> to {grant.path}</span></button></article>)}</div>
  {!!data.reviews.length&&<div className="local-access-reviews"><h3>Command review</h3>{data.reviews.map(review=>{const pending=['pending','awaiting_approval'].includes(review.state);return <article key={review.id} className="local-access-review"><header><strong>{reviewLabels[review.state]||review.state}</strong><time>{date(review.createdAt)}</time></header><p className="local-access-cwd">Folder: {review.cwd}</p><pre aria-label="Exact command"><code>{review.command}</code></pre>{pending&&<><p>Approve this exact command once. It runs on a temporary copy; your original files stay unchanged. Network access is blocked; the limit is 30 seconds.</p><div className="local-access-buttons"><button className="ws-secondary" disabled={!!busy} onClick={()=>void act('approve',{id:review.id},'Command review submitted. Its result will appear here.')}>Approve once</button><button className="ws-text-button" disabled={!!busy} onClick={()=>void act('reject',{id:review.id},'Command declined.')}>Decline</button></div></>}{review.output!==undefined&&<details><summary>Output{review.exitCode!==undefined?` · exit code ${review.exitCode}`:''}</summary><pre>{review.output||'No output was returned.'}</pre></details>}{review.issue&&<p className="local-access-error">{review.issue}</p>}</article>;})}</div>}
  {!!data.activity.length&&<details className="local-access-details"><summary>Recent file activity</summary><ul>{data.activity.map((item,i)=><li key={i}><strong>{item.operation}</strong>{item.path&&<span>{item.path}</span>}<small>{item.state} · {date(item.at)}</small></li>)}</ul></details>}</>}
 </section>;
}
