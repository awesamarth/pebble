import type {ChatImageInput} from '../../runtime/contracts';
export const maxChatImages=2;
export const maxChatImageBytes=1024*1024;
const supported=new Set(['image/png','image/jpeg','image/webp']);
export function imageDataUrl(image:ChatImageInput){return `data:${image.mimeType};base64,${image.data}`;}
/** Browser-only decoding rejects corrupt files even if their extension/MIME appears valid. */
export async function readChatImage(file:File):Promise<ChatImageInput>{
 if(!supported.has(file.type))throw new Error('Choose a PNG, JPEG or WebP image.');
 if(!file.size||file.size>maxChatImageBytes)throw new Error('Each image must be smaller than 1 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const valid=file.type==='image/png'?bytes.length>8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!valid)throw new Error('This file does not match its image type.');
 const url=URL.createObjectURL(file);
 try{await new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>{if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40_000_000)reject(new Error('Choose an image with smaller dimensions.'));else resolve();};image.onerror=()=>reject(new Error('This image could not be opened. Try another file.'));image.src=url;});}finally{URL.revokeObjectURL(url);}
 let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
 return {name:file.name.replace(/[\x00-\x1f]/g,'').slice(0,120)||'Attached image',mimeType:file.type as ChatImageInput['mimeType'],data:btoa(binary)};
}
