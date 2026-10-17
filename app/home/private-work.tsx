'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {LockKeyhole,RefreshCw} from 'lucide-react';
import './private-work.css';
import {MessageMarkdown} from './message-markdown';

type WorkTask={id:string;state:string;request:string;result?:string;issue?:string;createdAt:number;updatedAt:number};
const states:Record<string,string>={queued:'Waiting to start',running:'Working',completed:'Completed',failed:'Couldn’t complete',unknown:'Interrupted — review needed'};
function time(value:number){return Number.isFinite(value)?new Date(value).toLocaleString():'';}

/** Mount only in the authenticated owner's workspace, never in a shared-channel view. */
export default function PrivateWork(){
 const [tasks,setTasks]=useState<WorkTask[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState('');
 const [refreshing,setRefreshing]=useState(false);
 const active=useRef<AbortController|null>(null);
 const mounted=useRef(false);
 const refresh=useCallback(async()=>{
  if(active.current)return;
  const controller=new AbortController();active.current=controller;
  if(mounted.current)setRefreshing(true);
  try{
   const response=await fetch('/api/runtime/work',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error(response.status===404?'Private work is not available in the running app yet.':'Private work couldn’t refresh. Check your connection and try again.');
   const value=await response.json() as {tasks?:WorkTask[]};
   if(!Array.isArray(value.tasks))throw new Error('Private work returned an incomplete response. Try refreshing.');
   if(mounted.current){setTasks(value.tasks);setLoaded(true);setError('');}
  }catch(reason){
   if(mounted.current&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Private work couldn’t refresh. Try again.');
  }finally{
   if(active.current===controller)active.current=null;
   if(mounted.current)setRefreshing(false);
  }
 },[]);
 useEffect(()=>{
  mounted.current=true;void refresh();
  const timer=setInterval(()=>void refresh(),3000);
  return()=>{mounted.current=false;clearInterval(timer);active.current?.abort();active.current=null;};
 },[refresh]);
 return <section className="private-work" aria-labelledby="private-work-title">
  <div className="private-work-heading"><div><span className="eyebrow">JUST FOR YOU</span><h2 id="private-work-title"><LockKeyhole size={18} aria-hidden="true"/>Private work</h2></div><button className="ws-text-button" disabled={refreshing} onClick={()=>void refresh()}><RefreshCw size={13} aria-hidden="true"/>{refreshing?'Refreshing…':'Refresh'}</button></div>
  <p className="private-work-intro">Private tasks started in chat or Discord appear here. Their results stay in your workspace. If you ask for a completion notice and enable Discord updates below, pebble can post a short notice without the private result. Messages that need your approval appear in Review & send.</p>
  {error&&<p className="private-work-error" role="alert">{error}{loaded?' Previously loaded tasks are shown below.':''}</p>}
  {!loaded&&!error&&<p className="private-work-empty" role="status">Checking your private work…</p>}
  {loaded&&!tasks.length&&<p className="private-work-empty">No private tasks yet. Ask your pebble to work on a task in the background, then check back here.</p>}
  <div className="private-work-list">{tasks.map(task=><article className="private-work-task" key={task.id}>
   <header><span className={`private-work-state private-work-state-${['queued','running','completed','failed','unknown'].includes(task.state)?task.state:'unknown'}`}>{states[task.state]??'Status unavailable'}</span><time dateTime={Number.isFinite(task.updatedAt)?new Date(task.updatedAt).toISOString():undefined} title={`Started ${time(task.createdAt)}`}>{time(task.updatedAt)}</time></header>
   <h3>Your request</h3><p className="private-work-text">{task.request}</p>
   {task.result!==undefined&&<div className="private-work-result"><h3>Result</h3><MessageMarkdown text={task.result||'No result text was returned.'}/></div>}
   {task.issue&&<p className="private-work-issue">{task.issue}</p>}
   {task.state==='unknown'&&!task.issue&&<p className="private-work-issue">Work was interrupted. Review what happened before asking again.</p>}
   {task.state==='failed'&&!task.issue&&<p className="private-work-issue">This task couldn’t be completed. Review the request and your connections before trying again.</p>}
   {task.state==='completed'&&task.result===undefined&&<p className="private-work-issue">This task is marked completed, but its result isn’t available.</p>}
  </article>)}</div>
 </section>;
}
