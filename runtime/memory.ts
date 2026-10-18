import {localSentenceEmbedder,type SentenceEmbedder} from './embeddings';
import { createHash } from 'node:crypto';
import { createClient } from 'redis';
import { pushQueryArguments } from 'falkordb/dist/src/commands';

export type GraphMemoryConfig = { host: string; port: number; username?: string; password?: string; tls: boolean; graph: string };
export type MessageSource = { id: string; conversationId: string; role: string; text: string };
export type RememberFact = { id: string; text: string; sourceId: string; person?: string; project?: string };
export type MemoryFact = { id: string; text: string; sourceId: string; sourceText: string; conversationId: string; role: string; person: string | null; project: string | null; relatedTo?: string; retrieval?:{kind:'lexical'|'semantic'|'hybrid'|'graph';score?:number;depth:number;path?:{factId:string;sourceId:string;entity:string}[]} };
export type MemoryHealth = { status: 'ready' | 'unavailable' | 'setup_required'; message: string };
type Params = Record<string, string | number | boolean | null | number[]>;
export interface GraphConnection {
  run(query: string, params: Params, readOnly: boolean): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}
export type GraphConnectionFactory = (config: GraphMemoryConfig) => Promise<GraphConnection>;
export class MemoryUnavailableError extends Error { constructor() { super('Graph memory is unavailable. Check FalkorDB configuration and connectivity.'); this.name = 'MemoryUnavailableError'; } }
const timeoutMs = 5000;
function validConfig(config: GraphMemoryConfig): boolean {
  return Boolean(config.host?.trim() && !/[\s/@]/.test(config.host) && Number.isInteger(config.port) && config.port > 0 && config.port <= 65535 && typeof config.tls === 'boolean' && config.graph?.trim() && config.graph.length <= 128);
}

/** Cloud uses TLS by default. Plain TCP is allowed only through explicit tls:false configuration. */
export function graphMemoryConfig(env: Record<string, string | undefined> = process.env): GraphMemoryConfig | null {
  if (!env.FALKORDB_HOST?.trim()) return null;
  const port = Number(env.FALKORDB_PORT || 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FalkorDB port.');
  return { host: env.FALKORDB_HOST.trim(), port, username: env.FALKORDB_USERNAME || undefined, password: env.FALKORDB_PASSWORD || undefined, tls: env.FALKORDB_TLS !== 'false', graph: env.FALKORDB_GRAPH || 'pebble' };
}
export function memoryEntityId(kind: 'person' | 'project', name: string) {
  return `${kind}:${createHash('sha256').update(name.trim().toLowerCase()).digest('hex')}`;
}

// The public FalkorDB.connect API forwards connection errors before consumers can
// attach a listener. Use its official serializer with a Redis client whose error
// listener is installed BEFORE connect. No raw network/auth error reaches logs/UI.
/** Decode scalar columns in FalkorDB's explicit compact protocol. Nodes are never returned by these queries. */
export function parseGraphScalars(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const headers = raw[0] as [number,string][];
  const scalar=(cell: unknown): unknown => {
    if(!Array.isArray(cell)) throw new MemoryUnavailableError();
    const [type,value]=cell;
    if(type===1)return null;
    if(type===2||type===3)return value;
    if(type===4)return value==='true'||value===true;
    if(type===5)return Number(value);
    throw new MemoryUnavailableError();
  };
  return (raw[1] as unknown[][]).map(row=>Object.fromEntries(headers.map((header,i)=>[String(header[1]),scalar(row[i])])));
}
const connectRealGraph: GraphConnectionFactory = async (config) => {
  const socket = { host: config.host, port: config.port, connectTimeout: timeoutMs, reconnectStrategy: false as const, ...(config.tls ? { tls: true as const, servername: config.host } : {}) };
  const client = createClient({ socket, username: config.username, password: config.password, disableOfflineQueue: true });
  client.on('error', () => {});
  try { await client.connect(); } catch { client.destroy(); throw new MemoryUnavailableError(); }
  return {
    async run(query, params, readOnly) {
      const args = pushQueryArguments([readOnly ? 'GRAPH.RO_QUERY' : 'GRAPH.QUERY'], config.graph, query, { params, TIMEOUT: 4000 }, true);
      const raw = await client.sendCommand(args, { timeout: timeoutMs }) as unknown;
      return parseGraphScalars(raw);
    },
    async close() { if (client.isOpen) client.destroy(); },
  };
};

export type RecallOptions={embedder?:SentenceEmbedder|false;maxDepth?:number;maxVisited?:number;maxResults?:number;minSimilarity?:number};
const bounded=(value:unknown,fallback:number,min:number,max:number)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.floor(Number(value)))):fallback;
export class GraphMemory {
  private connection?: Promise<GraphConnection>;
  private closed = false;
  private embedder?:SentenceEmbedder;private indexing?:Promise<number>;private indexTimer?:ReturnType<typeof setTimeout>;private background=false;private model?:string;private vectorIndex=false;private indexed=0;private semantic:'warming'|'ready'|'unavailable'|'disabled'='warming';private issue?:string;
  private last?:{durationMs:number;semanticSeeds:number;lexicalSeeds:number;maxDepth:number;visited:number;truncated:boolean};
  readonly maxDepth:number;private maxVisited:number;private maxResults:number;private minSimilarity:number;
  constructor(private readonly config: GraphMemoryConfig | null, private readonly factory: GraphConnectionFactory = connectRealGraph,options:RecallOptions={}) {
   this.embedder=options.embedder===false?undefined:options.embedder??(factory===connectRealGraph?localSentenceEmbedder:undefined);if(!this.embedder)this.semantic='disabled';
   this.maxDepth=bounded(options.maxDepth??process.env.PEBBLE_MEMORY_HOPS,3,1,6);this.maxVisited=bounded(options.maxVisited??process.env.PEBBLE_MEMORY_VISITED,80,8,160);this.maxResults=bounded(options.maxResults??process.env.PEBBLE_MEMORY_RESULTS,24,4,40);const similarity=Number(options.minSimilarity??process.env.PEBBLE_MEMORY_SIMILARITY??0.36);this.minSimilarity=Number.isFinite(similarity)?Math.max(0.25,Math.min(0.9,similarity)):0.36;
  }
  retrievalStatus(){return {semantic:this.semantic,indexing:!!this.indexing,model:this.model,vectorIndex:this.vectorIndex,indexed:this.indexed,maxDepth:this.maxDepth,...(this.issue?{issue:this.issue}:{}),...(this.last?{last:this.last}:{})};}
  startBackfill(){if(!this.embedder||this.closed||this.background)return;this.background=true;const run=async()=>{try{const count=await this.backfill(256);if(count>=256&&!this.closed){this.indexTimer=setTimeout(()=>void run(),100);this.indexTimer.unref();}else this.background=false;}catch{this.background=false;}};void run();}
  async backfill(limit=256):Promise<number>{
   if(!this.embedder||this.closed)return 0;if(this.indexing)return this.indexing;
   this.indexing=(async()=>{try{const info=await this.embedder!.embed([]);this.model=info.model;if(!this.vectorIndex){const indexes=await this.run("CALL db.indexes() YIELD label,properties WHERE label='Fact' AND 'embedding' IN properties RETURN count(*) AS existing",{},true);if(!Number(indexes[0]?.existing))await this.run("CREATE VECTOR INDEX FOR (f:Fact) ON (f.embedding) OPTIONS {dimension:512, similarityFunction:'cosine'}");this.vectorIndex=true;}let count=0;
    while(count<limit&&!this.closed){const rows=await this.run('MATCH (f:Fact)-[:SUPPORTED_BY]->(:Source) WHERE f.embeddingModel IS NULL OR f.embeddingModel <> $model OR f.embeddingText IS NULL OR f.embeddingText <> f.text RETURN DISTINCT f.id AS id,f.text AS text ORDER BY f.id LIMIT 32',{model:info.model},true);if(!rows.length)break;
     const batch=await this.embedder!.embed(rows.map(row=>String(row.text)));for(let i=0;i<rows.length;i++){const row=rows[i],vector=batch.vectors[i];await this.run('MATCH (f:Fact {id:$id}) WHERE f.text = $text SET f.embeddingModel=$model,f.embeddingText=$text'+(vector?',f.embedding=vecf32($vector)':' REMOVE f.embedding')+' RETURN f.id AS id',{id:String(row.id),text:String(row.text),model:batch.model,...(vector?{vector}:{})});count++;this.indexed++;}
    }this.semantic='ready';this.issue=undefined;return count;
   }catch{this.semantic='unavailable';this.issue='Local semantic indexing is unavailable. Text and relationship recall still work.';return 0;}})();try{return await this.indexing;}finally{this.indexing=undefined;}
  }
  private async indexFact(){if(this.embedder){const count=await this.backfill(32);if(count>=32)this.startBackfill();}}

  private async run(query: string, params: Params = {}, readOnly = false) {
    if (!this.config || !validConfig(this.config) || this.closed) throw new MemoryUnavailableError();
    let connection: GraphConnection | undefined;
    try {
      this.connection ??= this.factory(this.config);
      connection = await this.connection;
      return await connection.run(query, params, readOnly);
    } catch {
      // Retry only on the NEXT operation: never replay a write after an ambiguous
      // network result. MERGE identities make explicit caller retries idempotent.
      this.connection = undefined;
      await connection?.close().catch(() => {});
      throw new MemoryUnavailableError();
    }
  }
  async initialize(workspaceId:string): Promise<void> {
    await this.run('MERGE (w:PebbleWorkspace {id: $id}) RETURN w.id AS id', {id:workspaceId});
  }
  async health(): Promise<MemoryHealth> {
    if (!this.config || !validConfig(this.config)) return { status: 'setup_required', message: 'Configure FalkorDB to enable source-backed memory.' };
    try {
      const rows = await this.run('RETURN 1 AS ok', {}, true);
      if (Number(rows[0]?.ok) !== 1) throw new MemoryUnavailableError();
      return { status: 'ready', message: 'FalkorDB graph memory is connected.' };
    } catch { return { status: 'unavailable', message: 'FalkorDB could not be verified. Check connection settings.' }; }
  }
  async recordMessageSource(source: MessageSource): Promise<void> {
    if (!source.id.trim() || !source.conversationId.trim() || !source.text.trim()) throw new Error('A source needs an id, conversation and text.');
    await this.run('MERGE (s:Source {id: $id}) SET s.conversationId = $conversationId, s.role = $role, s.text = $text, s.kind = "chat_message"', { ...source });
  }
  async rememberFact(fact: RememberFact): Promise<void> {
    if (!fact.id.trim() || !fact.text.trim() || !fact.sourceId.trim()) throw new Error('A fact needs an id, text and source.');
    for (const entity of [fact.person, fact.project]) {
      if (entity && (entity.trim().length > 150 || !fact.text.toLowerCase().includes(entity.trim().toLowerCase()))) throw new Error('Entity names must appear in the remembered fact.');
    }
    const params: Params = { id: fact.id, text: fact.text, sourceId: fact.sourceId, personName: fact.person?.trim().toLowerCase() ?? '', projectName: fact.project?.trim().toLowerCase() ?? '' };
    let query = 'MATCH (s:Source {id: $sourceId}) WHERE ($personName = "" OR toLower(s.text) CONTAINS $personName) AND ($projectName = "" OR toLower(s.text) CONTAINS $projectName) MERGE (f:Fact {id: $id}) SET f.text = $text WITH f,s OPTIONAL MATCH (f)-[old:ABOUT]->() DELETE old WITH DISTINCT f,s MERGE (f)-[:SUPPORTED_BY]->(s)';
    if (fact.person?.trim()) { params.person = fact.person.trim(); params.personId = memoryEntityId('person', fact.person); query += ' MERGE (p:Person {id: $personId}) SET p.name = $person MERGE (f)-[:ABOUT]->(p)'; }
    if (fact.project?.trim()) { params.project = fact.project.trim(); params.projectId = memoryEntityId('project', fact.project); query += ' MERGE (j:Project {id: $projectId}) SET j.name = $project MERGE (f)-[:ABOUT]->(j)'; }
    query += ' RETURN f.id AS id';
    const rows = await this.run(query, params);
    if (!rows.length) throw new Error('The fact source must be recorded before remembering a fact.');await this.indexFact();
  }
  async updateFact(value:{id:string;sourceId:string;expectedText:string;text:string}):Promise<void>{
    this.validateEdit(value);if(typeof value.text!=='string'||!value.text.trim()||value.text.length>2000)throw new Error('Enter a fact under 2,000 characters.');
    const rows=await this.run('MATCH (f:Fact {id: $id})-[:SUPPORTED_BY]->(s:Source {id: $sourceId}) WHERE f.text = $expectedText SET f.text = $text REMOVE f.embedding,f.embeddingModel,f.embeddingText WITH f OPTIONAL MATCH (f)-[r:ABOUT]->(entity) WHERE NOT toLower($text) CONTAINS toLower(entity.name) DELETE r RETURN DISTINCT f.id AS id',{id:value.id,sourceId:value.sourceId,expectedText:value.expectedText,text:value.text.trim()});
    if(!rows.length)throw new Error('This fact changed or is no longer available. Refresh memory before editing again.');await this.indexFact();
  }
  async deleteFact(value:{id:string;sourceId:string;expectedText:string}):Promise<void>{
    this.validateEdit(value);
    const rows=await this.run('MATCH (f:Fact {id: $id})-[:SUPPORTED_BY]->(s:Source {id: $sourceId}) WHERE f.text = $expectedText WITH f, f.id AS id DETACH DELETE f RETURN id',{id:value.id,sourceId:value.sourceId,expectedText:value.expectedText});
    if(!rows.length)throw new Error('This fact changed or is no longer available. Refresh memory before removing it.');
  }
  private validateEdit(value:{id:string;sourceId:string;expectedText:string}){if(!value||typeof value.id!=='string'||!value.id||value.id.length>250||typeof value.sourceId!=='string'||!value.sourceId||value.sourceId.length>250||typeof value.expectedText!=='string'||!value.expectedText||value.expectedText.length>2000)throw new Error('Choose an existing fact and its source.');}
  async source(id:string):Promise<MessageSource|null>{
    if(typeof id!=='string'||!id||id.length>250)throw new Error('Choose a valid saved source.');
    const rows=await this.run('MATCH (s:Source {id: $id}) RETURN s.id AS id,s.conversationId AS conversationId,s.role AS role,s.text AS text LIMIT 1',{id},true);
    const row=rows[0];return row?{id:String(row.id),conversationId:String(row.conversationId),role:String(row.role),text:String(row.text).slice(0,16000)}:null;
  }
  async recall(query: string, conversationId?: string): Promise<MemoryFact[]> {
    const started=performance.now();const params:Params={query:query.trim().slice(0,2000),conversationId:conversationId??'',scoped:conversationId!==undefined};
    const columns='f.id AS id, f.text AS text, s.id AS sourceId, s.text AS sourceText, s.conversationId AS conversationId, s.role AS role, p.name AS person, j.name AS project';
    const lexical=await this.run(`MATCH (f:Fact)-[:SUPPORTED_BY]->(s:Source) OPTIONAL MATCH (f)-[:ABOUT]->(p:Person) OPTIONAL MATCH (f)-[:ABOUT]->(j:Project) WITH f,s,p,j WHERE ($scoped = false OR s.conversationId = $conversationId) AND ($query = "" OR toLower(f.text) CONTAINS toLower($query) OR toLower($query) CONTAINS toLower(p.name) OR toLower($query) CONTAINS toLower(j.name)) RETURN DISTINCT ${columns} ORDER BY f.id, s.id LIMIT ${this.maxResults}`,params,true);
    const convert=(row:Record<string,unknown>):MemoryFact=>({id:String(row.id),text:String(row.text),sourceId:String(row.sourceId),sourceText:String(row.sourceText),conversationId:String(row.conversationId),role:String(row.role),person:row.person==null?null:String(row.person),project:row.project==null?null:String(row.project)});
    if(!params.query){this.last={durationMs:Math.round(performance.now()-started),semanticSeeds:0,lexicalSeeds:0,maxDepth:0,visited:0,truncated:false};return lexical.map(convert);}
    const found=new Map<string,MemoryFact>(),ranks=new Map<string,number>();let semanticSeeds=0;
    for(const [index,row] of lexical.entries()){const f=convert(row),key=f.id+':'+f.sourceId;found.set(key,{...f,retrieval:{kind:'lexical',depth:0}});ranks.set(key,1/(60+index));}
    if(params.query&&this.embedder){await this.backfill(64);try{const batch=await this.embedder.embed([String(params.query)]);const vector=batch.vectors[0];if(vector){
     // Scope BEFORE ranking: another channel's similar facts cannot starve this channel's search.
     const prefix=conversationId!==undefined||!this.vectorIndex?`MATCH (f:Fact)-[:SUPPORTED_BY]->(s:Source) WHERE ($scoped = false OR s.conversationId = $conversationId) AND f.embeddingModel = $model AND f.embeddingText = f.text AND f.embedding IS NOT NULL WITH f,s,1.0-vec.cosineDistance(f.embedding,vecf32($vector)) AS similarity`:`CALL db.idx.vector.queryNodes('Fact','embedding',64,vecf32($vector)) YIELD node,score WITH node AS f,1.0-score AS similarity MATCH (f)-[:SUPPORTED_BY]->(s:Source) WHERE f.embeddingModel=$model AND f.embeddingText=f.text WITH f,s,similarity`;
     const rows=await this.run(`${prefix} WHERE similarity >= $minimum OPTIONAL MATCH (f)-[:ABOUT]->(p:Person) OPTIONAL MATCH (f)-[:ABOUT]->(j:Project) RETURN DISTINCT ${columns},similarity ORDER BY similarity DESC,f.id LIMIT 8`,{...params,model:batch.model,vector,minimum:this.minSimilarity},true);
     const best=Number(rows[0]?.similarity??0);for(const [index,row] of rows.entries()){if(Number(row.similarity)<best-0.08)continue;const f=convert(row),key=f.id+':'+f.sourceId,existing=found.get(key);found.set(key,{...f,retrieval:{kind:existing?'hybrid':'semantic',score:Number(row.similarity),depth:0}});ranks.set(key,(ranks.get(key)??0)+1/(60+index));semanticSeeds++;}
    }}catch{this.semantic='unavailable';this.issue='Local semantic search is unavailable. Text and relationship recall still work.';}}
    const seeds=[...found.values()].sort((a,b)=>(ranks.get(b.id+':'+b.sourceId)??0)-(ranks.get(a.id+':'+a.sourceId)??0)).slice(0,Math.min(8,Math.max(1,Math.floor(this.maxResults/2))));found.clear();for(const seed of seeds)found.set(seed.id+':'+seed.sourceId,seed);let frontier=seeds;const visited=new Set(seeds.map(f=>f.id));let deepest=0,truncated=false;const traversalStarted=performance.now();
    for(let depth=1;params.query&&frontier.length&&depth<=this.maxDepth;depth++){
     if(visited.size>=this.maxVisited||performance.now()-traversalStarted>1500){truncated=true;break;}const next:MemoryFact[]=[];if(frontier.length>16)truncated=true;
     for(const origin of frontier.slice(0,16)){
      if(visited.size>=this.maxVisited||performance.now()-traversalStarted>1500){truncated=true;break;}
      const rows=await this.run(`MATCH (seed:Fact {id:$seed0})-[:SUPPORTED_BY]->(origin:Source), (seed)-[:ABOUT]->(entity)<-[:ABOUT]-(f:Fact)-[:SUPPORTED_BY]->(s:Source) WHERE seed.id <> f.id AND ($scoped = false OR (s.conversationId = $conversationId AND origin.conversationId = $conversationId)) OPTIONAL MATCH (f)-[:ABOUT]->(p:Person) OPTIONAL MATCH (f)-[:ABOUT]->(j:Project) RETURN DISTINCT ${columns},entity.name AS relatedTo ORDER BY f.id,s.id LIMIT 16`,{...params,seed0:origin.id},true);
      if(rows.length===16)truncated=true;for(const row of rows){const f=convert(row),key=f.id+':'+f.sourceId;if(found.has(key))continue;const entity=String(row.relatedTo);const path=[...(origin.retrieval?.path??[]),{factId:origin.id,sourceId:origin.sourceId,entity}];const item:MemoryFact={...f,relatedTo:path.map(step=>step.entity).join(' → '),retrieval:{kind:'graph',depth,path}};found.set(key,item);deepest=depth;if(!visited.has(f.id)){visited.add(f.id);next.push(item);}if(visited.size>=this.maxVisited){truncated=true;break;}}
     }frontier=next;
    }
    const groups=Array.from({length:this.maxDepth+1},()=>[] as MemoryFact[]);for(const f of found.values())groups[f.retrieval?.depth??0].push(f);const results=[...groups[0]];while(results.length<this.maxResults&&groups.slice(1).some(group=>group.length)){for(const group of groups.slice(1)){const f=group.shift();if(f&&results.length<this.maxResults)results.push(f);}}this.last={durationMs:Math.round(performance.now()-started),semanticSeeds:seeds.filter(f=>f.retrieval?.kind==='semantic'||f.retrieval?.kind==='hybrid').length,lexicalSeeds:seeds.filter(f=>f.retrieval?.kind==='lexical'||f.retrieval?.kind==='hybrid').length,maxDepth:deepest,visited:visited.size,truncated:truncated||found.size>this.maxResults};return results;
  }
  async close(): Promise<void> {
    this.closed = true;if(this.indexTimer)clearTimeout(this.indexTimer);await this.indexing;
    const pending = this.connection;
    this.connection = undefined;
    try { await (await pending)?.close(); } catch { /* Never leak connection diagnostics. */ }
  }
}
