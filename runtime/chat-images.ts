import {createHash} from 'node:crypto';
import type {ChatImageInput} from './contracts';
export const chatBodyLimit=3_000_000;
export function validateChatImages(input:unknown):ChatImageInput[]{
 if(input===undefined)return [];if(!Array.isArray(input)||input.length>2)throw new Error('Attach up to two images.');
 return input.map(value=>{if(!value||typeof value!=='object')throw new Error('Choose a valid image.');const {name,mimeType,data}=value as ChatImageInput;
 if(typeof name!=='string'||!name.trim()||name.length>120||/[\x00-\x1f]/.test(name)||!['image/png','image/jpeg','image/webp'].includes(mimeType)||typeof data!=='string'||!data.length||data.length>1_398_104||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error('Use PNG, JPEG or WebP images up to 1 MiB each.');
 const bytes=Buffer.from(data,'base64');if(!bytes.length||bytes.length>1_048_576||bytes.toString('base64')!==data)throw new Error('The image data is invalid or too large.');
 const valid=mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid)throw new Error('The image format does not match its file type.');
 return {name:name.trim(),mimeType,data};});
}
export function chatRequestIdentity(content:string,images:ChatImageInput[]){return images.length?`images:${createHash('sha256').update(JSON.stringify([content,images])).digest('hex')}`:content;}
