'use client';
import {useId,useRef,useState} from 'react';
import type {ChatImageInput} from '../../runtime/contracts';
import {imageDataUrl,maxChatImages,readChatImage} from './chat-image-input';
export function ChatImagePicker({images,onChange,disabled,visionSupported}:{images:ChatImageInput[];onChange:(images:ChatImageInput[])=>void;disabled?:boolean;visionSupported:boolean}){
 const id=useId(),input=useRef<HTMLInputElement>(null);const [error,setError]=useState(''),[reading,setReading]=useState(false);
 async function add(files:FileList|null){if(!files?.length)return;setError('');if(images.length+files.length>maxChatImages){setError('You can attach up to two images.');if(input.current)input.current.value='';return;}setReading(true);try{const added=[];for(const file of Array.from(files))added.push(await readChatImage(file));onChange([...images,...added]);}catch(e){setError(e instanceof Error?e.message:'The image could not be opened.');}finally{setReading(false);if(input.current)input.current.value='';}}
 return <div className="chat-images" style={{padding:'8px 0'}}>
  <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={disabled||reading||!visionSupported||images.length>=2} onChange={e=>void add(e.target.files)}/>
  <button type="button" onClick={()=>input.current?.click()} disabled={disabled||reading||!visionSupported||images.length>=2} aria-describedby={`${id}-help`}>{reading?'Opening image…':'Attach image'}</button>
  <small id={`${id}-help`} style={{display:'block',marginTop:5}}>{visionSupported?'Up to two images, 1 MB each. Sending shares them with your model and saves them in this chat.':'Choose a model that supports images to attach a picture.'}</small>
  {images.length>0&&<ul aria-label="Attached images" style={{display:'flex',gap:12,listStyle:'none',padding:0,flexWrap:'wrap'}}>{images.map((image,index)=><li key={`${index}-${image.name}`} style={{maxWidth:150}}><img src={imageDataUrl(image)} alt={image.name} style={{width:100,height:80,objectFit:'cover',borderRadius:12,display:'block'}}/><span style={{display:'block',overflowWrap:'anywhere',fontSize:12}}>{image.name}</span><button type="button" disabled={disabled||reading} onClick={()=>{setError('');onChange(images.filter((_,i)=>i!==index));}} aria-label={`Remove ${image.name}`}>Remove</button></li>)}</ul>}
  {error&&<p role="alert" style={{color:'#8b3434',margin:'6px 0'}}>{error}</p>}
 </div>;
}
