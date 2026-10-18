import { describe, expect, test } from 'bun:test';
import { GraphMemory, parseGraphScalars, graphMemoryConfig, memoryEntityId, type GraphConnection } from './memory';

const config = { host: 'test.invalid', port: 6379, tls: true, graph: 'isolated_test' };
/** Deterministic isolated test double; never connects to a graph or returns model output. */
function isolatedGraphDouble() {
  const calls: { query: string; params: Record<string, unknown>; readOnly: boolean }[] = [];
  let rows: Record<string, unknown>[] = [{ ok: 1 }];
  let fail = false;
  let closes = 0;
  const connection: GraphConnection = {
    async run(query, params, readOnly) { calls.push({ query, params, readOnly }); if (fail) throw new Error('password=DO_NOT_LEAK'); return rows; },
    async close() { closes++; },
  };
  return { calls, connection, setRows: (value: typeof rows) => { rows = value; }, setFail: (value: boolean) => { fail = value; }, closes: () => closes };
}
describe('FalkorDB adapter with isolated deterministic client', () => {
  test('TLS cloud defaults and explicit self-host configuration', () => {
    expect(graphMemoryConfig({})).toBeNull();
    expect(graphMemoryConfig({ FALKORDB_HOST: 'cloud.example' })?.tls).toBe(true);
    expect(graphMemoryConfig({ FALKORDB_HOST: '127.0.0.1', FALKORDB_TLS: 'false' })?.tls).toBe(false);
    expect(() => graphMemoryConfig({ FALKORDB_HOST: 'example', FALKORDB_PORT: 'NaN' })).toThrow('Invalid FalkorDB port');
  });
  test('health verifies graph module via read-only query and hides errors', async () => {
    const fake = isolatedGraphDouble();
    const memory = new GraphMemory(config, async () => fake.connection);
    expect((await memory.health()).status).toBe('ready');
    expect(fake.calls[0]).toEqual({ query: 'RETURN 1 AS ok', params: {}, readOnly: true });
    fake.setFail(true);
    const status = await memory.health();
    expect(status.status).toBe('unavailable');
    expect(JSON.stringify(status)).not.toContain('DO_NOT_LEAK');
    expect(fake.closes()).toBe(1);
    expect((await new GraphMemory(null).health()).status).toBe('setup_required');
    expect((await new GraphMemory({ ...config, port: 0 }).health()).status).toBe('setup_required');
  });
  test('source and fact MERGEs are parameterized with deterministic person/project identities', async () => {
    const fake = isolatedGraphDouble();
    const memory = new GraphMemory(config, async () => fake.connection);
    const source = { id: 'source:1', conversationId: 'conversation:1', role: 'user', text: 'quoted " text' };
    await memory.recordMessageSource(source);
    await memory.recordMessageSource(source);
    expect(fake.calls[0]).toEqual(fake.calls[1]);
    expect(fake.calls[0].query).not.toContain(source.text);
    fake.setRows([{ id: 'fact:1' }]);
    await memory.rememberFact({ id: 'fact:1', text: 'Sam builds Pebble', sourceId: source.id, person: 'Sam', project: 'Pebble' });
    const call = fake.calls[2];
    expect(call.query).toContain('MATCH (s:Source');
    expect(call.query).toContain('SUPPORTED_BY');
    expect(call.query).toContain('p:Person');
    expect(call.query).toContain('j:Project');
    expect(call.params.personId).toBe(memoryEntityId('person', ' sam '));
    expect(call.query).not.toContain('Sam builds Pebble');
    fake.setRows([]);
    expect(memory.rememberFact({ id: 'orphan', text: 'No source', sourceId: 'missing' })).rejects.toThrow('source must be recorded');
  });
  test('recall returns source provenance, bounds search and reconnects only next operation', async () => {
    const fake = isolatedGraphDouble();
    let connects = 0;
    const memory = new GraphMemory(config, async () => { connects++; return fake.connection; });
    fake.setFail(true);
    await expect(memory.recall('test')).rejects.toThrow('Graph memory is unavailable');
    expect(connects).toBe(1);
    fake.setFail(false);
    const row = { id: 'f', text: 'fact', sourceId: 's', sourceText: 'source', conversationId: 'c', role: 'user', person: null, project: 'Pebble' };
    fake.setRows([row]);
    expect(await memory.recall('x'.repeat(3000))).toMatchObject([row]);
    expect(connects).toBe(2);
    expect(fake.calls[1].params.query).toHaveLength(2000);
    expect(fake.calls[1].readOnly).toBe(true);
    await memory.recall('fact','discord:bot:guild:channel:owner');expect(fake.calls.at(-1)?.params.conversationId).toBe('discord:bot:guild:channel:owner');expect(fake.calls.at(-1)?.query).toContain('s.conversationId = $conversationId');
    await memory.close();
    await expect(memory.recall('test')).rejects.toThrow('Graph memory is unavailable');
  });
});

test('real wire scalar decoder handles compact integer/string/null replies',()=>{
 expect(parseGraphScalars([[[1,'ok']],[[[3,1]]],[]])).toEqual([{ok:1}]);
 expect(parseGraphScalars([[[1,'text'],[1,'person']],[[[2,'quoted text'],[1,null]]],[]])).toEqual([{text:'quoted text',person:null}]);
 expect(parseGraphScalars([['Nodes created: 1']])).toEqual([]);
});

test('new graph initialization is explicit and idempotent',async()=>{
 const calls:string[]=[];const m=new GraphMemory(config,async()=>({run:async q=>{calls.push(q);return [{id:'workspace'}];},close:async()=>{}}));
 expect(calls).toHaveLength(0);await m.initialize('workspace');expect(calls[0]).toContain('MERGE (w:PebbleWorkspace');await m.close();
});

test('real connection failure returns unavailable, with no invented graph fallback',async()=>{
 const memory=new GraphMemory({host:'127.0.0.1',port:1,tls:false,graph:'isolated_unavailable_test'});
 try{expect((await memory.health()).status).toBe('unavailable');await expect(memory.recall('anything')).rejects.toThrow('unavailable');}finally{await memory.close();}
},12000);


test('entity labels cannot introduce names absent from a grounded fact',async()=>{
 const fake=isolatedGraphDouble();const memory=new GraphMemory(config,async()=>fake.connection);
 await expect(memory.rememberFact({id:'f',sourceId:'s',text:'Mira prefers quiet mornings.',person:'Invented'})).rejects.toThrow('Entity names');
 expect(fake.calls).toHaveLength(0);
});


test('saved source lookup is bounded, read only and parameterized',async()=>{
 const fake=isolatedGraphDouble();const memory=new GraphMemory(config,async()=>fake.connection);const id='gmail:'+ 'a'.repeat(64);
 fake.setRows([{id,conversationId:'mail',role:'gmail',text:'x'.repeat(17000)}]);
 expect((await memory.source(id))?.text).toHaveLength(16000);expect(fake.calls.at(-1)?.params).toEqual({id});expect(fake.calls.at(-1)?.readOnly).toBe(true);expect(fake.calls.at(-1)?.query).not.toContain(id);
 fake.setRows([]);expect(await memory.source('missing')).toBeNull();await expect(memory.source('')).rejects.toThrow('valid saved source');await memory.close();
});
