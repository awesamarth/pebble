import { Database } from 'bun:sqlite';
import type { SqliteDatabase, SqliteExecutor, SqliteValue } from '@earendil-works/pi-durable/storage/sqlite';

/** Pi's portable SQLite interface, backed by Bun, with serialized async transactions. */
export class BunSqlite implements SqliteDatabase {
 private db: Database; private tail:Promise<unknown>=Promise.resolve(); private closed=false;
 constructor(path:string){this.db=new Database(path,{create:true});this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');}
 private queued<T>(fn:()=>Promise<T>|T):Promise<T>{const p=this.tail.then(()=>{if(this.closed)throw new Error('Database closed');return fn();});this.tail=p.catch(()=>{});return p;}
 private executor(active:()=>boolean):SqliteExecutor {
  const check=()=>{if(!active())throw new Error('Transaction handle expired');};
  return {exec:async sql=>{check();this.db.exec(sql);},run:async(sql,...p)=>{check();this.db.query(sql).run(...p);},get:async<T extends object>(sql:string,...p:SqliteValue[])=>{check();return (this.db.query(sql).get(...p)??undefined) as T|undefined;},all:async<T extends object>(sql:string,...p:SqliteValue[])=>{check();return this.db.query(sql).all(...p) as T[];}};
 }
 exec(sql:string){return this.queued(()=>this.executor(()=>true).exec(sql));}
 run(sql:string,...p:SqliteValue[]){return this.queued(()=>this.executor(()=>true).run(sql,...p));}
 get<T extends object>(sql:string,...p:SqliteValue[]){return this.queued(()=>this.executor(()=>true).get<T>(sql,...p));}
 all<T extends object>(sql:string,...p:SqliteValue[]){return this.queued(()=>this.executor(()=>true).all<T>(sql,...p));}
 transaction<T>(fn:(tx:SqliteExecutor)=>Promise<T>):Promise<T>{return this.queued(async()=>{let active=true;this.db.exec('BEGIN IMMEDIATE');try{const result=await fn(this.executor(()=>active));active=false;this.db.exec('COMMIT');return result;}catch(error){active=false;try{this.db.exec('ROLLBACK');}catch(rollback){throw new AggregateError([error,rollback],'Rollback failed');}throw error;}});}
 close(){return this.queued(()=>{this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');this.db.close();this.closed=true;});}
}
