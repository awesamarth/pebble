import {test,expect} from 'bun:test';import {createClient} from 'redis';import {GraphMemory} from './memory';
const enabled=process.env.PEBBLE_REAL_MEMORY==='1'&&process.platform==='darwin';
test.skipIf(!enabled)('real local semantic backfill, scoped recall, multi-step traversal and persisted index',async()=>{
 const graph='pebble_synthetic_'+crypto.randomUUID().replaceAll('-',''),config={host:'127.0.0.1',port:7380,tls:false,graph};let memory=new GraphMemory(config,undefined,{embedder:false});const cleanup=createClient({socket:{host:config.host,port:config.port,reconnectStrategy:false}});cleanup.on('error',()=>{});
 const fixtures=[
  {id:'a-bike',text:'The bicycle needs repair.'},
  {id:'b-root',text:'Liora leads project CobaltRelay.',person:'Liora',project:'CobaltRelay'},
  {id:'c-bridge',text:'Liora coordinates project BirchLedger.',person:'Liora',project:'BirchLedger'},
  {id:'d-reviewer',text:'Noor reviews project BirchLedger.',person:'Noor',project:'BirchLedger'},
  {id:'e-preference',text:'Noor is available for reviews after lunch.',person:'Noor'},
  {id:'z-unrelated',text:'The office printer uses blue paper.'},
 ];
 try{await memory.initialize('synthetic-hybrid');for(const [i,fact] of fixtures.entries()){const sourceId=`900:${100+i}:0`;await memory.recordMessageSource({id:sourceId,conversationId:'owner-a',role:'user',text:fact.text});await memory.rememberFact({...fact,sourceId});}
  await memory.recordMessageSource({id:'900:200:0',conversationId:'owner-b',role:'user',text:'Noor keeps a private journal.'});await memory.rememberFact({id:'other-owner',sourceId:'900:200:0',text:'Noor keeps a private journal.',person:'Noor'});
  await memory.close();memory=new GraphMemory(config);const cold=performance.now();expect(await memory.backfill()).toBe(7);expect(memory.retrievalStatus().semantic).toBe('ready');expect(memory.retrievalStatus().vectorIndex).toBe(true);
  const paraphrase=await memory.recall('A broken cycle requires maintenance.','owner-a');expect(paraphrase.some(f=>f.id==='a-bike'&&f.retrieval?.kind==='semantic'&&f.retrieval.score!>0.5)).toBe(true);expect(paraphrase.some(f=>f.id==='z-unrelated'||f.id==='other-owner')).toBe(false);console.log(JSON.stringify({case:'semantic',durationMs:memory.retrievalStatus().last?.durationMs,matches:paraphrase.map(f=>({id:f.id,kind:f.retrieval?.kind,score:f.retrieval?.score})),coldBackfillMs:Math.round(performance.now()-cold)}));
  const chain=await memory.recall('CobaltRelay','owner-a');const endpoint=chain.find(f=>f.id==='e-preference');console.log(JSON.stringify({chainEvidence:chain.map(f=>({id:f.id,retrieval:f.retrieval}))}));expect(endpoint?.retrieval?.depth).toBeGreaterThanOrEqual(2);expect(endpoint?.relatedTo).toContain('BirchLedger → Noor');expect(endpoint?.retrieval?.path?.at(-1)?.sourceId).toBe('900:103:0');expect((await memory.source(endpoint!.sourceId))?.text).toBe(endpoint?.text);expect(chain.some(f=>f.id==='z-unrelated'||f.id==='other-owner')).toBe(false);console.log(JSON.stringify({case:'multi_hop',durationMs:memory.retrievalStatus().last?.durationMs,matches:chain.map(f=>({id:f.id,depth:f.retrieval?.depth})),endpointPath:endpoint?.relatedTo}));
  const anchored=new GraphMemory(config,undefined,{embedder:false,maxDepth:3});const anchoredChain=await anchored.recall('CobaltRelay','owner-a');expect(anchoredChain.find(f=>f.id==='e-preference')?.retrieval?.depth).toBe(3);await anchored.close();const oldBound=new GraphMemory(config,undefined,{embedder:false,maxDepth:1});expect((await oldBound.recall('CobaltRelay','owner-a')).some(f=>f.id==='e-preference')).toBe(false);await oldBound.close();
  const noMatch=await memory.recall('How are nebulae produced in interstellar space?','owner-a');expect(noMatch).toEqual([]);
  await memory.close();memory=new GraphMemory(config);expect(await memory.backfill()).toBe(0);expect((await memory.recall('A broken cycle requires maintenance.','owner-a')).some(f=>f.id==='a-bike')).toBe(true);
  await memory.updateFact({id:'a-bike',sourceId:'900:100:0',expectedText:'The bicycle needs repair.',text:'The bicycle is fully repaired.'});expect((await memory.source('900:100:0'))?.text).toBe('The bicycle needs repair.');
 }finally{await memory.close();await cleanup.connect();await cleanup.sendCommand(['GRAPH.DELETE',graph]).catch(()=>{});await cleanup.quit();}
},60000);
