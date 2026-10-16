import { createHash } from 'node:crypto';
import { createClient } from 'redis';
import { pushQueryArguments } from 'falkordb/dist/src/commands';

export type GraphMemoryConfig = { host: string; port: number; username?: string; password?: string; tls: boolean; graph: string };
export type MessageSource = { id: string; conversationId: string; role: string; text: string };
export type RememberFact = { id: string; text: string; sourceId: string; person?: string; project?: string };
export type MemoryFact = { id: string; text: string; sourceId: string; sourceText: string; conversationId: string; role: string; person: string | null; project: string | null; relatedTo?: string };
export type MemoryHealth = { status: 'ready' | 'unavailable' | 'setup_required'; message: string };
type Params = Record<string, string | number | boolean | null>;
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

export class GraphMemory {
  private connection?: Promise<GraphConnection>;
  private closed = false;
  constructor(private readonly config: GraphMemoryConfig | null, private readonly factory: GraphConnectionFactory = connectRealGraph) {}
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
    if (!rows.length) throw new Error('The fact source must be recorded before remembering a fact.');
  }
  async updateFact(value:{id:string;sourceId:string;expectedText:string;text:string}):Promise<void>{
    this.validateEdit(value);if(typeof value.text!=='string'||!value.text.trim()||value.text.length>2000)throw new Error('Enter a fact under 2,000 characters.');
    const rows=await this.run('MATCH (f:Fact {id: $id})-[:SUPPORTED_BY]->(s:Source {id: $sourceId}) WHERE f.text = $expectedText SET f.text = $text WITH f OPTIONAL MATCH (f)-[r:ABOUT]->(entity) WHERE NOT toLower($text) CONTAINS toLower(entity.name) DELETE r RETURN DISTINCT f.id AS id',{id:value.id,sourceId:value.sourceId,expectedText:value.expectedText,text:value.text.trim()});
    if(!rows.length)throw new Error('This fact changed or is no longer available. Refresh memory before editing again.');
  }
  async deleteFact(value:{id:string;sourceId:string;expectedText:string}):Promise<void>{
    this.validateEdit(value);
    const rows=await this.run('MATCH (f:Fact {id: $id})-[:SUPPORTED_BY]->(s:Source {id: $sourceId}) WHERE f.text = $expectedText WITH f, f.id AS id DETACH DELETE f RETURN id',{id:value.id,sourceId:value.sourceId,expectedText:value.expectedText});
    if(!rows.length)throw new Error('This fact changed or is no longer available. Refresh memory before removing it.');
  }
  private validateEdit(value:{id:string;sourceId:string;expectedText:string}){if(!value||typeof value.id!=='string'||!value.id||value.id.length>250||typeof value.sourceId!=='string'||!value.sourceId||value.sourceId.length>250||typeof value.expectedText!=='string'||!value.expectedText||value.expectedText.length>2000)throw new Error('Choose an existing fact and its source.');}
  async recall(query: string, conversationId?: string): Promise<MemoryFact[]> {
    const params: Params = { query: query.trim().slice(0, 2000), conversationId: conversationId ?? '', scoped: conversationId !== undefined };
    const columns = 'f.id AS id, f.text AS text, s.id AS sourceId, s.text AS sourceText, s.conversationId AS conversationId, s.role AS role, p.name AS person, j.name AS project';
    const rows = await this.run(`MATCH (f:Fact)-[:SUPPORTED_BY]->(s:Source) OPTIONAL MATCH (f)-[:ABOUT]->(p:Person) OPTIONAL MATCH (f)-[:ABOUT]->(j:Project) WITH f,s,p,j WHERE ($scoped = false OR s.conversationId = $conversationId) AND ($query = "" OR toLower(f.text) CONTAINS toLower($query) OR toLower($query) CONTAINS toLower(p.name) OR toLower($query) CONTAINS toLower(j.name)) RETURN DISTINCT ${columns} ORDER BY f.id, s.id LIMIT 20`, params, true);
    // One bounded graph hop supplies context that a text match alone cannot find.
    // Both ends are scoped, so a shared person/project never crosses a Discord boundary.
    if (params.query && rows.length && rows.length < 20) {
      const seedParams: Params = {...params};
      const seeds = [...new Set(rows.map(row => String(row.id)))].slice(0, 8);
      const conditions = seeds.map((id,i) => { seedParams[`seed${i}`]=id; return `seed.id = $seed${i}`; }).join(' OR ');
      const related = await this.run(`MATCH (seed:Fact)-[:SUPPORTED_BY]->(origin:Source), (seed)-[:ABOUT]->(entity)<-[:ABOUT]-(f:Fact)-[:SUPPORTED_BY]->(s:Source) WHERE (${conditions}) AND seed.id <> f.id AND ($scoped = false OR (s.conversationId = $conversationId AND origin.conversationId = $conversationId)) OPTIONAL MATCH (f)-[:ABOUT]->(p:Person) OPTIONAL MATCH (f)-[:ABOUT]->(j:Project) RETURN DISTINCT ${columns}, entity.name AS relatedTo ORDER BY f.id, s.id LIMIT 20`,seedParams,true);
      const seen=new Set(rows.map(row=>`${row.id}:${row.sourceId}`));
      for(const row of related) {const key=`${row.id}:${row.sourceId}`;if(!seen.has(key)&&rows.length<20){rows.push(row);seen.add(key);}}
    }
    return rows.map(row => ({ id: String(row.id), text: String(row.text), sourceId: String(row.sourceId), sourceText: String(row.sourceText), conversationId: String(row.conversationId), role: String(row.role), person: row.person == null ? null : String(row.person), project: row.project == null ? null : String(row.project), ...(row.relatedTo ? {relatedTo:String(row.relatedTo)} : {}) }));
  }
  async close(): Promise<void> {
    this.closed = true;
    const pending = this.connection;
    this.connection = undefined;
    try { await (await pending)?.close(); } catch { /* Never leak connection diagnostics. */ }
  }
}
