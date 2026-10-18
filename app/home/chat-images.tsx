'use client';
import {useId,useRef,useState,type ReactNode,type ClipboardEvent} from 'react';
import type {ChatImageInput} from '../../runtime/contracts';
import {imageDataUrl,maxChatImages,readChatImage} from './chat-image-input';
export function ChatImagePicker({images,onChange,disabled,visionSupported,onReadingChange,children}:{images:ChatImageInput[];onChange:(images:ChatImageInput[])=>void;disabled?:boolean;visionSupported:boolean;onReadingChange?:(reading:boolean)=>void;children?:ReactNode}){
 const id=useId(),input=useRef<HTMLInputElement>(null),opening=useRef(false);const [error,setError]=useState(''),[reading,setReading]=useState(false);
 async function add(files:FileList|File[]|null){if(!files?.length)return;setError('');if(disabled){setError('Wait until this conversation is ready before attaching an image.');return;}if(!visionSupported){setError('Choose a model that supports images to attach a picture.');return;}if(opening.current){setError('Wait for the current images to open, then paste again.');return;}if(images.length+files.length>maxChatImages){setError('You can attach up to two images.');if(input.current)input.current.value='';return;}opening.current=true;setReading(true);onReadingChange?.(true);try{const added=[];for(const file of Array.from(files))added.push(await readChatImage(file));onChange([...images,...added]);}catch(e){setError(e instanceof Error?e.message:'The image could not be opened.');}finally{opening.current=false;setReading(false);onReadingChange?.(false);if(input.current)input.current.value='';}}
 function paste(event:ClipboardEvent<HTMLDivElement>){if(event.defaultPrevented)return;const files=Array.from(event.clipboardData.files);if(!files.length)return;if(!event.clipboardData.getData('text/plain'))event.preventDefault();void add(files);}

 return <div className="chat-images" style={{padding:'8px 0'}} onPaste={paste}>
  <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={disabled||reading||!visionSupported||images.length>=2} onChange={e=>void add(e.target.files)}/>
  <button type="button" onClick={()=>input.current?.click()} disabled={disabled||reading||!visionSupported||images.length>=2} aria-describedby={`${id}-help`}>{reading?'Opening image…':'Attach image'}</button>
  <small id={`${id}-help`} style={{display:'block',marginTop:5}}>{visionSupported?'Paste or attach up to two images, 1 MiB each. Sending shares them with your model and saves them in this chat.':'Choose a model that supports images to attach a picture.'}</small>
  {images.length>0&&<ul aria-label="Attached images" style={{display:'flex',gap:12,listStyle:'none',padding:0,flexWrap:'wrap'}}>{images.map((image,index)=><li key={`${index}-${image.name}`} style={{maxWidth:150}}><img src={imageDataUrl(image)} alt={image.name} style={{width:80,height:64,objectFit:'cover',borderRadius:12,display:'block'}}/><span style={{display:'block',overflowWrap:'anywhere',fontSize:12}}>{image.name}</span><button type="button" disabled={disabled||reading} onClick={()=>{setError('');onChange(images.filter((_,i)=>i!==index));}} aria-label={`Remove ${image.name}`}>Remove</button></li>)}</ul>}
  {children}
  {error&&<p role="alert" style={{color:'#8b3434',margin:'6px 0'}}>{error}</p>}
 </div>;
}
