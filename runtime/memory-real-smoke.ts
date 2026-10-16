/** Explicit opt-in smoke check: disposable synthetic graph only, no application config or personal data. */
import {createClient} from 'redis';
import {GraphMemory} from './memory';
import {strict as assert} from 'node:assert';
const graph=`pebble_synthetic_${crypto.randomUUID().replaceAll('-','')}`;
const config={host:'127.0.0.1',port:7380,tls:false,graph};
let memory=new GraphMemory(config);
const cleanup=createClient({socket:{host:config.host,port:config.port,reconnectStrategy:false}});cleanup.on('error',()=>{});
try{
 await memory.initialize('synthetic-workspace');
 const source=async(id:string,text:string,conversationId='synthetic:private')=>memory.recordMessageSource({id,conversationId,role:'user',text});
 await source('s1','Mira builds project Lantern.');
 await memory.rememberFact({id:'f1',sourceId:'s1',text:'Mira builds project Lantern.',person:'Mira',project:'Lantern'});
 await source('s2','Mira prefers quiet mornings.');
 await memory.rememberFact({id:'f2',sourceId:'s2',text:'Mira prefers quiet mornings.',person:'Mira'});
 await source('s3','Mira keeps a private journal.','synthetic:other');
 await memory.rememberFact({id:'f3',sourceId:'s3',text:'Mira keeps a private journal.',person:'Mira'});
 const hits=await memory.recall('Lantern','synthetic:private');
 assert(hits.some(f=>f.id==='f1'));
 assert(hits.some(f=>f.id==='f2'&&f.relatedTo==='Mira')); // No Lantern text in f2: real graph traversal.
 assert(!hits.some(f=>f.id==='f3'));
 assert(hits.every(f=>f.sourceText&&f.sourceId));
 await assert.rejects(memory.rememberFact({id:'bad',sourceId:'s1',text:'Mira builds project Lantern.',person:'Invented'}),/Entity names/);
 await memory.updateFact({id:'f2',sourceId:'s2',expectedText:'Mira prefers quiet mornings.',text:'Quiet mornings are preferred.'});
 assert(!(await memory.recall('Lantern','synthetic:private')).some(f=>f.id==='f2'));
 assert((await memory.recall('quiet','synthetic:private')).some(f=>f.id==='f2'&&f.person===null&&f.sourceText==='Mira prefers quiet mornings.'));
 await assert.rejects(memory.updateFact({id:'f2',sourceId:'s2',expectedText:'Mira prefers quiet mornings.',text:'stale overwrite'}),/changed/);
 await memory.close();memory=new GraphMemory(config);
 assert((await memory.recall('Lantern','synthetic:private')).some(f=>f.id==='f1'&&f.project==='Lantern'));
 await memory.deleteFact({id:'f1',sourceId:'s1',expectedText:'Mira builds project Lantern.'});
 assert(!(await memory.recall('Lantern','synthetic:private')).length);
 console.log('PASS real FalkorDB: source-backed entities, shared-entity retrieval, channel boundary, correction edge cleanup, stale edit rejection, reconnect persistence, deletion.');
}finally{
 await memory.close();await cleanup.connect();await cleanup.sendCommand(['GRAPH.DELETE',graph]);await cleanup.quit();
}
