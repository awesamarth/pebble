import {access,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir,availableParallelism} from 'node:os';
import {execFile,spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
type Reply={ready?:boolean;text?:string;error?:string};

/** Private local pipe, never a network listener. A cancelled decode discards its process. */
export class WhisperWorker {
 private child?:ChildProcessWithoutNullStreams;
 private directory?:string;
 private executable?:string;
 private build?:Promise<void>;
 private pending?:{resolve:(value:Reply)=>void;reject:(error:Error)=>void};
 private buffer='';
 private disabled=false;
 readonly threads=Math.min(4,availableParallelism());
 constructor(private binary:string,private model:string){}
 private async compile(signal:AbortSignal){
  // Custom CLI installations without these libraries retain the existing CLI fallback.
  const source=resolve(dirname(this.binary),'../..'),build=join(source,'build');
  const libraries=['examples/libcommon.a','src/libwhisper.a','ggml/src/libggml.a','ggml/src/libggml-cpu.a','ggml/src/libggml-base.a'].map(path=>join(build,path));
  await Promise.all(libraries.map(path=>access(path)));
  this.directory=await mkdtemp(join(tmpdir(),'pebble-whisper-worker-'));
  this.executable=join(this.directory,'worker');
  await execute('/usr/bin/clang++',['-std=c++17','-O3','-DNDEBUG','-I'+join(source,'include'),'-I'+join(source,'ggml/include'),'-I'+join(source,'examples'),resolve('runtime/voice-whisper-worker.cpp'),...libraries,'-framework','Accelerate','-o',this.executable],{signal,timeout:30000,maxBuffer:262144});
 }
 private read(){return new Promise<Reply>((resolve,reject)=>{if(this.pending)return reject(Error('Whisper is already processing.'));this.pending={resolve,reject};});}
 private stop(){const child=this.child;this.child=undefined;this.buffer='';this.pending?.reject(Error('Whisper processing stopped.'));this.pending=undefined;child?.kill('SIGKILL');}
 async transcribe(path:string,signal:AbortSignal):Promise<string|undefined>{
  if(this.disabled)return undefined;
  if(!this.executable){try{this.build??=this.compile(signal);await this.build;}catch(error){this.executable=undefined;this.build=undefined;if(this.directory)await rm(this.directory,{recursive:true,force:true});this.directory=undefined;if(signal.aborted)throw error;this.disabled=true;return undefined;}}
  signal.throwIfAborted();
  const cancel=()=>this.stop();signal.addEventListener('abort',cancel,{once:true});
  try{
   if(!this.child){
    const ready=this.read();
    const child=spawn(this.executable!,[this.model,String(this.threads)],{stdio:['pipe','pipe','pipe']});this.child=child;
    child.stderr.resume(); // Do not retain audio paths, diagnostics or transcripts in logs.
    child.stdout.on('data',data=>{if(this.child!==child)return;this.buffer+=data.toString();let newline:number;while((newline=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,newline);this.buffer=this.buffer.slice(newline+1);const pending=this.pending;this.pending=undefined;try{pending?.resolve(JSON.parse(line));}catch{pending?.reject(Error('Invalid Whisper worker response.'));}}});
    const died=()=>{if(this.child===child)this.stop();};child.on('error',died);child.on('exit',died);child.stdin.on('error',died);child.stdout.on('error',died);
    if(!(await ready).ready)throw Error('Whisper worker could not start.');
   }
   signal.throwIfAborted();const response=this.read();this.child!.stdin.write(path+'\n');const result=await response;if(result.error||typeof result.text!=='string')throw Error('Whisper could not transcribe the recording.');return result.text;
  }catch(error){this.stop();throw error;}finally{signal.removeEventListener('abort',cancel);}
 }
 async close(){this.stop();await this.build?.catch(()=>{});if(this.directory)await rm(this.directory,{recursive:true,force:true});}
}
