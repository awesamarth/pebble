import {access,mkdtemp,readFile,rm,writeFile,stat} from 'node:fs/promises';
import {constants} from 'node:fs';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const execute=promisify(execFile);
export const voiceBodyLimit=3_000_000;
export class VoiceError extends Error{}
function fail(text:string):never{throw new VoiceError(text);}
export class LocalVoice{
 private active=false;private settling?:Promise<void>;private lifetime=new AbortController();
 private binary=process.env.PEBBLE_WHISPER_BIN??resolve('../x402-media-studio/.runtime/whisper.cpp-1.9.4/build/bin/whisper-cli');
 private model=process.env.PEBBLE_WHISPER_MODEL??resolve('../x402-media-studio/.runtime/models/ggml-small.bin');
 private ffmpeg=process.env.PEBBLE_FFMPEG_BIN??'/usr/local/bin/ffmpeg';
 async status(){const available=await Promise.all([this.binary,this.model,this.ffmpeg,'/usr/bin/say'].map(path=>access(path,path===this.model?constants.R_OK:constants.X_OK).then(()=>true,()=>false)));const ready=process.platform==='darwin'&&available.every(Boolean);return {ready,maxSeconds:30,localAudio:true,...(!ready?{issue:'Local speech tools are unavailable. Configure Whisper, its model, FFmpeg and macOS speech on this Mac.'}:{})};}
 async close(){this.lifetime.abort();await this.settling;}
 private async task<T>(signal:AbortSignal|undefined,operation:(directory:string,signal:AbortSignal)=>Promise<T>):Promise<T>{
  if(signal?.aborted||this.lifetime.signal.aborted)fail('Voice processing stopped.');if(this.active)fail('A voice turn is already processing. Wait or end the call.');if(!(await this.status()).ready)fail('Local speech tools are unavailable. Check voice setup.');if(this.active)fail('A voice turn is already processing.');this.active=true;let settled!:()=>void;this.settling=new Promise(resolve=>{settled=resolve;});let directory:string|undefined;
  try{const combined=AbortSignal.any([this.lifetime.signal,AbortSignal.timeout(120000),...(signal?[signal]:[])]);combined.throwIfAborted();directory=await mkdtemp(join(tmpdir(),'pebble-voice-'));return await operation(directory,combined);}catch(error){if(error instanceof VoiceError)throw error;if(signal?.aborted||this.lifetime.signal.aborted)fail('Voice processing stopped.');return fail('Local voice processing could not finish. Try a shorter, clearer recording.');}finally{if(directory)await rm(directory,{recursive:true,force:true}).catch(()=>{});this.active=false;this.settling=undefined;settled();}
 }
 async transcribe(input:unknown,signal?:AbortSignal){
  const value=input as {audio?:unknown;mimeType?:unknown};const mime=typeof value?.mimeType==='string'?value.mimeType.split(';')[0]:'';const format=({'audio/webm':'matroska','audio/ogg':'ogg','audio/wav':'wav'} as Record<string,string>)[mime];
  if(!format||typeof value?.audio!=='string'||!value.audio.length||value.audio.length>2_800_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.audio))fail('Record up to 30 seconds of WebM, Ogg or WAV audio.');
  const bytes=Buffer.from(value.audio as string,'base64');if(bytes.length>2_000_000||bytes.toString('base64')!==value.audio)fail('The recording is invalid or too large.');
  return this.task(signal,async(directory,abort)=>{
   const source=join(directory,'input.audio'),wav=join(directory,'recording.wav'),output=join(directory,'transcript');await writeFile(source,bytes,{mode:0o600});
   await execute(this.ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y','-protocol_whitelist','file,pipe','-f',format,'-i',source,'-vn','-t','31','-ac','1','-ar','16000','-c:a','pcm_s16le',wav],{signal:abort,timeout:20000,maxBuffer:262144});
   if((await stat(wav)).size>30.5*32000+100)fail('Recordings are limited to 30 seconds.');
   const decoded=await readFile(wav);let offset=12,hasSamples=false;while(offset+8<=decoded.length){const length=decoded.readUInt32LE(offset+4);if(decoded.toString('ascii',offset,offset+4)==='data'){hasSamples=decoded.subarray(offset+8,Math.min(decoded.length,offset+8+length)).some(byte=>byte!==0);break;}offset+=8+length+(length%2);}if(!hasSamples)fail('No speech was recognized. Try speaking clearly for a few seconds.');
   await execute(this.binary,['-m',this.model,'-f',wav,'-l','auto','-t','2','-ng','-nt','-otxt','-of',output],{signal:abort,timeout:90000,maxBuffer:1048576});
   const text=(await readFile(output+'.txt','utf8')).trim().slice(0,16000);if(!text||/^\[(?:blank_audio|silence|music)\]$/i.test(text))fail('No speech was recognized. Try speaking clearly for a few seconds.');return {text};
  });
 }
 async speech(input:unknown,signal?:AbortSignal){
  const raw=(input as {text?:unknown})?.text;if(typeof raw!=='string'||!raw.trim()||raw.length>20000)fail('Choose a completed reply to speak.');
  const text=raw.replace(/```[\s\S]*?```/g,' Code is shown in the conversation. ').replace(/\[([^\]]+)\]\(https?:[^)]+\)/g,'$1').replace(/(?:discord|gmail):[a-f0-9]{64}|\b\d+:\d+:\d+\b/g,'saved source').replace(/^[#>*-]+\s*/gm,'').replace(/[`*_~]/g,'').slice(0,3000).trim();
  return this.task(signal,async(directory,abort)=>{const aiff=join(directory,'reply.aiff'),wav=join(directory,'reply.wav');await execute('/usr/bin/say',['-o',aiff,'--',text],{signal:abort,timeout:30000,maxBuffer:262144});await execute(this.ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y','-i',aiff,'-t','90','-ac','1','-ar','22050',wav],{signal:abort,timeout:20000,maxBuffer:262144});const audio=await readFile(wav);if(audio.length<1000)fail('Local speech produced no audio. Check the installed Mac voice and try again.');if(audio.length>4_000_000)fail('The spoken reply is too long. Ask for a shorter answer.');return {audio:audio.toString('base64'),mimeType:'audio/wav',truncated:raw.length>3000||audio.length>=90*44100};});
 }
}
