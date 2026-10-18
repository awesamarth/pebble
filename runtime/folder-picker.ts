import {execFile} from 'node:child_process';
import {lstat,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename,dirname,isAbsolute,join,resolve,sep} from 'node:path';
export class FolderPickerError extends Error{constructor(message:string,public status=409){super(message);}}
export type FolderSelection={cancelled:true}|{cancelled:false;path:string};
const secretName=/(?:^\.|^(?:credentials?|secrets?|passwords?|tokens?)(?:[._-]|$)|^id_(?:rsa|ed25519|ecdsa|dsa)|^(?:auth|oauth|service[-_]account)(?:[._-]|$)|\.(?:pem|p12|pfx|key|keychain|sqlite|db)(?:-|$))/i;
const skipped=new Set(['node_modules','vendor','Library','__pycache__']);
const inside=(root:string,path:string)=>path===root||path.startsWith(root+sep);
export async function validateSelectedFolder(input:string){
 if(!input||input.length>1500||input.includes('\0')||!isAbsolute(input))throw new FolderPickerError('Choose an existing folder.');
 const path=resolve(input);
 if(['/','/Users','/Volumes','/private','/private/var','/var','/tmp'].includes(path)||path===homedir()||path===dirname(homedir())||['/System','/Library','/usr','/bin','/sbin','/etc','/private/etc','/dev','/proc'].some(root=>inside(root,path))||path.split(sep).some(part=>secretName.test(part)||skipped.has(part)))throw new FolderPickerError('Choose a work folder outside system, hidden and credential folders.');
 try{let ancestor:string=sep;for(const part of path.split(sep).filter(Boolean)){ancestor=join(ancestor,part);if((await lstat(ancestor)).isSymbolicLink())throw new FolderPickerError('Choose the original folder, rather than a shortcut.');}if(!(await lstat(path)).isDirectory()||await realpath(path)!==path)throw new FolderPickerError('Choose an existing folder, rather than a file or shortcut.');}catch(error){if(error instanceof FolderPickerError)throw error;throw new FolderPickerError('That folder could not be opened. Choose another folder.');}
 return path;
}
export function isFolderPickerRequest(request:Request){const host=request.headers.get('host');return ['127.0.0.1:7341','localhost:7341'].includes(host??'')&&request.headers.get('origin')===`http://${host}`&&request.headers.get('x-pebble-user-action')==='choose-folder'&&(!request.headers.get('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin');}
const script='activate\nreturn POSIX path of (choose folder with prompt "Choose a folder for pebble")';
function nativeSelection(signal?:AbortSignal):Promise<string|null>{return new Promise((accept,reject)=>{execFile('/usr/bin/osascript',['-e',script],{encoding:'utf8',timeout:120000,maxBuffer:4096,signal},(error,stdout,stderr)=>{if(error){if(signal?.aborted||/\(-128\)/.test(stderr)){accept(null);return;}reject(new FolderPickerError(error.killed?'Folder selection timed out. Try again.':'The folder picker couldn’t open. You can still enter a folder path.',error.killed?408:503));return;}accept(stdout.replace(/\r?\n$/,''));});});}
const globals=globalThis as typeof globalThis&{__pebbleFolderPicker?:{busy:boolean}};
const state=globals.__pebbleFolderPicker??={busy:false};
/** Returns a path only. Existing LocalAccess.grant remains the sole grant/validation authority. */
export async function chooseLocalFolder(signal?:AbortSignal,select:(signal?:AbortSignal)=>Promise<string|null>=nativeSelection):Promise<FolderSelection>{
 if(process.platform!=='darwin')throw new FolderPickerError('The folder picker is available on macOS. Enter a folder path instead.',503);
 if(state.busy)throw new FolderPickerError('A folder picker is already open. Choose a folder or cancel it.');
 state.busy=true;try{const selected=await select(signal);if(selected===null||signal?.aborted)return {cancelled:true};return {cancelled:false,path:await validateSelectedFolder(selected)};}finally{state.busy=false;}
}
