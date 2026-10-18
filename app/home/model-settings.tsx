'use client';
import {useEffect,useState} from 'react';
import type {ModelChoice,GenerationSettings} from '../../runtime/model-settings';
type SettingsView=GenerationSettings&{choices:ModelChoice[];verified:boolean;busy:boolean;provider?:string;catalogSource?:'account'|'installed';method?:'api_key'|'oauth'|null;issue?:string;selectionIssue?:string};
const labels:Record<string,string>={off:'Off',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Maximum'};
export default function ModelSettings({authenticated,method,current,provider}:{authenticated:boolean;provider?:string;catalogSource?:'account'|'installed';method?:'api_key'|'oauth'|null;current?:Partial<GenerationSettings>}){
 const [saved,setSaved]=useState<SettingsView>();const [model,setModel]=useState(current?.model??'');const [reasoning,setReasoning]=useState(current?.reasoning??'');const [pending,setPending]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!authenticated){setSaved(undefined);return;}
  let alive=true;setLoading(true);setError('');
  // Keep the current authenticated selection visible while the catalog loads.
  const initial:SettingsView={model:current?.model??'',reasoning:current?.reasoning??'off',choices:[],verified:false,busy:false};
  setSaved(initial);setModel(initial.model);setReasoning(initial.reasoning);
  void (async()=>{
   let value=initial;let problem='';
   try{const response=await fetch('/api/runtime/model-settings');if(!response.ok)throw new Error();const result=await response.json() as SettingsView;if(typeof result.model!=='string'||typeof result.reasoning!=='string'||!Array.isArray(result.choices))throw new Error();value=result;}
   catch{problem='Couldn’t load model settings. Try again.';}
   if(!value.choices.length){
    try{const response=await fetch('/api/runtime/models');if(!response.ok)throw new Error();const choices=await response.json() as ModelChoice[];if(!Array.isArray(choices)||!choices.length)throw new Error();value={...value,choices};}
    catch{problem=problem||'Couldn’t load available models. Your current settings are shown below.';}
   }
   if(alive){setSaved(value);setModel(value.model);setReasoning(value.reasoning);setError(problem);setLoading(false);}
  })();
  return()=>{alive=false;};
 },[authenticated,method,current?.model,current?.reasoning,provider,retry]);
 const choice=saved?.choices.find(c=>c.id===model);const valid=!!choice&&choice.reasoningLevels.includes(reasoning as GenerationSettings['reasoning']);const changed=model!==saved?.model||reasoning!==saved?.reasoning;
 const levels=choice?.reasoningLevels??(reasoning?[reasoning]:[]);
 async function save(){setPending(true);setError('');setNotice('');try{const response=await fetch('/api/runtime/model-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,reasoning,...(provider?{provider}:{})})});const value=await response.json();if(!response.ok)throw new Error(value.error??'Couldn’t save your model settings. Try again.');setSaved(value);setModel(value.model);setReasoning(value.reasoning);setNotice('Settings saved for your next message.');}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 if(!authenticated)return null;
 return <section className="ws-model-settings" aria-label="Model preferences"><h3>Model & reasoning</h3><p>{method==='oauth'?'Models for your ChatGPT connection.':`Models for your ${{openai:'OpenAI',anthropic:'Anthropic',google:'Gemini',openrouter:'OpenRouter'}[provider??'openai']??provider??'connected'} API key.`} Changes apply to your next message.</p>
 {loading&&<p role="status">Loading available models…</p>}
 {saved?.issue&&<p role="alert">{saved.issue}</p>}{saved?.selectionIssue&&<p role="status">{saved.selectionIssue}</p>}
 <form aria-busy={pending||loading} onSubmit={e=>{e.preventDefault();void save();}}>
 <label>Chat model<select aria-label="Chat model" value={model} onChange={e=>{const next=e.target.value;setModel(next);setNotice('');const supported=saved?.choices.find(c=>c.id===next)?.reasoningLevels??[];if(!supported.includes(reasoning as GenerationSettings['reasoning']))setReasoning(supported.length===1?supported[0]:'');}} disabled={pending||loading}>{!choice&&<option value={model}>{model||'Loading current model…'}{saved?.choices.length?' · not in the current list':''}</option>}{saved?.choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {!(choice?.reasoningLevels.length===1&&choice.reasoningLevels[0]==='off')&&<label>Reasoning level<select aria-label="Reasoning level" value={reasoning} onChange={e=>{setReasoning(e.target.value);setNotice('');}} disabled={pending||loading} aria-describedby="model-settings-help">{!levels.includes(reasoning)&&<option value="">Choose a supported level</option>}{levels.map(level=><option key={level} value={level}>{labels[level]??level}</option>)}</select></label>}
 <small>{choice?.reasoningLevels.some(level=>level!=='off')?'Higher reasoning can take longer and use more of your allowance. ':''}{choice?(choice.supportsImages?'This model can receive screenshots.':'Screenshots aren’t supported by this model.'):'Loading model capabilities…'}</small>
 <small>{saved?.catalogSource==='account'?'Models available to your account are shown.':'Choose a model supported by pebble.'} Access depends on your account. pebble won’t switch models automatically.</small>
 <button className="ws-secondary" disabled={pending||loading||!valid||!changed} aria-describedby="model-settings-help">{pending?'Saving…':'Save model settings'}</button>
 <small id="model-settings-help" aria-live="polite">{loading?'Loading model settings…':!choice?'Refresh available models before changing settings.':!valid?'Choose a reasoning level supported by this model.':changed?'Save to use these settings for your next message.':`Saved: ${choice.name} · ${labels[reasoning]??reasoning}.`}</small>
 <small>{saved?.verified?'This connection has responded successfully.':'Send a message to check this connection.'}</small></form>
 {error&&<p role="alert">{error}</p>}{(error||saved?.issue)&&<button type="button" className="ws-text-button" disabled={loading||pending} onClick={()=>setRetry(n=>n+1)}>Refresh models</button>}{notice&&<p role="status">{notice}</p>}</section>;
}
