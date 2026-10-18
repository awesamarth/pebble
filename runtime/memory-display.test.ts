import {test,expect} from 'bun:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {memoryConnectionSummary,readMemoryDisplay,writeMemoryDisplay} from './memory-display';
test('memory display excludes credentials and rejects metadata from a different owner',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pebble-memory-display-'));const config={host:'127.0.0.1',port:7380,graph:'synthetic',tls:false,username:'demo',password:'synthetic-password-must-stay-private'};
 try{await writeFile(join(directory,'owner.lock'),'1234');await writeMemoryDisplay(directory,config,1234);const raw=await readFile(join(directory,'memory-display.json'),'utf8');expect(raw).not.toContain(config.password);expect(memoryConnectionSummary(config)).toEqual({host:'127.0.0.1',port:7380,graph:'synthetic',tls:false,username:'demo',saved:false,passwordRequired:true});expect((await readMemoryDisplay(directory))?.port).toBe(7380);await writeFile(join(directory,'owner.lock'),'1235');expect(await readMemoryDisplay(directory)).toBeUndefined();}finally{await rm(directory,{recursive:true,force:true});}
});
