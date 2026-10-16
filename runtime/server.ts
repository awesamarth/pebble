import { mkdir, open, readFile, unlink, writeFile, chmod } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {DeviceCredentials} from './credentials';
import {AccountModelCatalog} from './provider-models';
import { Engine } from './engine';
import {runtimeHandler} from './http';
// Separate long-running process: Next handlers NEVER open the Harness or SQLite.
const directory=resolve('.pebble');await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const lock=join(directory,'owner.lock');
try{const f=await open(lock,'wx',0o600);await f.writeFile(String(process.pid));await f.close();}catch{
 const pid=Number(await readFile(lock,'utf8'));let alive=true;try{process.kill(pid,0);}catch{alive=false;}
 if(alive)throw new Error('A Pebble runtime already owns this storage. Reuse it.');
 await unlink(lock);const f=await open(lock,'wx',0o600);await f.writeFile(String(process.pid));await f.close();
}
const token=randomBytes(32).toString('hex');await writeFile(join(directory,'owner.token'),token,{mode:0o600});await chmod(join(directory,'owner.token'),0o600);
let engine:Engine;try{engine=await Engine.open(directory,undefined,undefined,undefined,new DeviceCredentials(directory),new AccountModelCatalog());}catch{await unlink(lock);throw new Error('Pebble runtime could not open durable storage.');}
const server=Bun.serve({hostname:'127.0.0.1',port:7342,idleTimeout:0,fetch:runtimeHandler(engine,token)});
console.log('Pebble durable owner listening on http://127.0.0.1:7342 (Bun SQLite; no provider connected)');
let closing=false;async function shutdown(){if(closing)return;closing=true;server.stop(true);await engine.close();await unlink(lock).catch(()=>{});process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
