import { describe, expect, test } from 'bun:test';
import { GmailIntegration, type GmailConfig } from './gmail';
const READ = 'https://www.googleapis.com/auth/gmail.readonly';
const config: GmailConfig = { clientId: 'test-id', clientSecret: 'test-secret', ingestEnabled: true, topicName: 'projects/test/topics/mail', pushAudience: 'https://example.test/push', pushServiceAccount: 'push@test.iam.gserviceaccount.com', subscription: 'projects/test/subscriptions/mail' };
function fixture(options: { expired?: boolean; send?: boolean; consent?: boolean } = {}) {
  const calls: string[] = []; const events: unknown[] = []; const cursors: string[] = []; let historyCalls = 0;
  const adapter = new GmailIntegration({ onEvent: async e => { events.push(e); }, onCursor: async id => { cursors.push(id); }, verifyPush: async () => ({ iss: 'https://accounts.google.com', aud: config.pushAudience, email: config.pushServiceAccount, email_verified: true, exp: Math.floor(Date.now()/1000)+300 }), fetch: (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url); calls.push(path);
    if (path.includes('/token')) return Response.json({ access_token: 'secret-token', refresh_token: 'secret-refresh', expires_in: 3600, scope: READ + (options.send ? ' https://www.googleapis.com/auth/gmail.send' : '') });
    if (path.endsWith('/profile')) return Response.json({ emailAddress: 'me@test.com', historyId: '90071992547409930' });
    if (path.includes('/history?')) { historyCalls++; if(options.expired) return new Response('', {status:404}); return Response.json({ historyId: '90071992547409932', history: [{id:'90071992547409931',messagesAdded:[{message:{id:'m1'}},{message:{id:'m1'}}]}] }); }
    if (path.includes('/messages/m1')) return Response.json({id:'m1',payload:{headers:[{name:'Subject',value:'Test'}]}});
    if (path.endsWith('/watch')) return Response.json({ historyId: '90071992547409999', expiration: String(Date.now()+86_400_000) });
    if (path.endsWith('/messages/send')) return Response.json({id:'sent'});
    throw new Error('unexpected test request');
  }) as typeof fetch });
  adapter.configure({...config,allowSend:options.send,ingestEnabled:options.consent??true});
  const connect = async () => { const {url,state}=await adapter.beginOAuth(); await adapter.completeOAuth('fake-code',state); return url; };
  const push = (id='90071992547409932') => ({subscription:config.subscription,message:{messageId:'push1',data:Buffer.from(JSON.stringify({emailAddress:'me@test.com',historyId:id})).toString('base64url')}});
  return {adapter,calls,events,cursors,connect,push,get historyCalls(){return historyCalls;}};
}
describe('Gmail adapter (isolated injected transport; no live Gmail)',()=>{
 test('OAuth uses PKCE/state, default readonly, one-use callback; status hides secrets',async()=>{const f=fixture();const url=new URL(await f.connect());expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('scope')).toBe(READ);expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:7341/api/integrations/gmail/callback');await expect(f.adapter.completeOAuth('x',url.searchParams.get('state')!)).rejects.toThrow('invalid_oauth_state');expect(JSON.stringify(f.adapter.status())).not.toContain('secret');f.adapter.disconnect();});
 test('invalid state never exchanges token',async()=>{const f=fixture();await f.adapter.beginOAuth();await expect(f.adapter.completeOAuth('x','wrong')).rejects.toThrow('invalid_oauth_state');expect(f.calls).toHaveLength(0);});
 test('authenticated push sync uses BigInt cursors and metadata; concurrent replay dedups',async()=>{const f=fixture();await f.connect();await Promise.all([f.adapter.handlePush('Bearer jwt',f.push()),f.adapter.handlePush('Bearer jwt',f.push())]);expect(f.events).toHaveLength(1);expect(f.historyCalls).toBe(1);expect(f.cursors).toEqual(['90071992547409930','90071992547409932']);expect(f.calls.find(x=>x.includes('/messages/m1'))).toContain('format=metadata');});
 test('push rejects missing auth, mismatched subscription/account and malformed history',async()=>{const f=fixture();await f.connect();await expect(f.adapter.handlePush(null,f.push())).rejects.toThrow('invalid_push_auth');await expect(f.adapter.handlePush('Bearer jwt',{...f.push(),subscription:'wrong'})).rejects.toThrow('invalid_push_payload');await expect(f.adapter.handlePush('Bearer jwt',f.push('NaN'))).rejects.toThrow('invalid_history_id');expect(f.events).toHaveLength(0);});
 test('expired history requires explicit recovery consent, never lists mailbox',async()=>{const f=fixture({expired:true});await f.connect();await expect(f.adapter.syncHistory()).rejects.toThrow('gmail_http_404');expect(f.adapter.status().needsResyncConsent).toBe(true);await expect(f.adapter.resumeFromNow(false)).rejects.toThrow('resync_consent_required');await f.adapter.resumeFromNow(true);expect(f.adapter.status().needsResyncConsent).toBe(false);expect(f.calls.some(x=>x.includes('/messages?'))).toBe(false);});
 test('watch renewal preserves old replay cursor, disconnect clears safe state',async()=>{const f=fixture();await f.connect();await f.adapter.startWatch();expect(f.adapter.status().historyId).toBe('90071992547409930');f.adapter.disconnect();expect(f.adapter.status().connected).toBe(false);expect(f.adapter.status().watchExpires).toBeUndefined();});
 test('ingestion requires separate consent even with OAuth',async()=>{const f=fixture({consent:false});await f.connect();await expect(f.adapter.syncHistory()).rejects.toThrow('ingestion_consent_required');expect(f.events).toHaveLength(0);});
 test('send requires scope and approval gate; denial makes zero send requests',async()=>{const f=fixture();await f.connect();await expect(f.adapter.sendApproved('SGVsbG8',{execute:async op=>op()})).rejects.toThrow('send_scope_required');const g=fixture({send:true});await g.connect();await expect(g.adapter.sendApproved('SGVsbG8',{execute:async()=>{throw new Error('approval denied');}})).rejects.toThrow('approval denied');expect(g.calls.filter(x=>x.endsWith('/messages/send'))).toHaveLength(0);});
});

test('invalid signed identity is rejected before body parsing',async()=>{
 let touched=false;
 const a=new GmailIntegration({onEvent:async()=>{},verifyPush:async()=>({iss:'https://accounts.google.com',aud:config.pushAudience,email:'attacker@test.com',email_verified:true,exp:Math.floor(Date.now()/1000)+300})});a.configure(config);
 const body={get subscription(){touched=true;throw new Error('must not read');}};
 await expect(a.handlePush('Bearer jwt',body)).rejects.toThrow('invalid_push_identity');expect(touched).toBe(false);a.disconnect();
});
test('restores cursor only after connected account is known; durable push delivery acknowledged after events',async()=>{
 const order:string[]=[];let sends=0;
 const a=new GmailIntegration({loadCursor:async email=>{order.push(email);return '100';},onCursor:async id=>{order.push(id);},onEvent:async()=>{order.push('event');},deliverySeen:async()=>false,onDelivery:async()=>{order.push('delivery');},verifyPush:async()=>({iss:'accounts.google.com',aud:config.pushAudience,email:config.pushServiceAccount,email_verified:true,exp:Math.floor(Date.now()/1000)+300}),fetch:(async url=>{
 const p=String(url);if(p.includes('/token'))return Response.json({access_token:'test',expires_in:3600,scope:READ});if(p.endsWith('/profile'))return Response.json({emailAddress:'me@test.com',historyId:'200'});if(p.includes('/history?')){sends++;return Response.json({historyId:'201',history:[{id:'201',messagesAdded:[{message:{id:'m'}}]}]});}return Response.json({id:'m',snippet:'private body must not escape',payload:{headers:[]}});
 }) as typeof fetch});a.configure(config);const {state}=await a.beginOAuth();await a.completeOAuth('x',state);expect(a.status().historyId).toBe('100');await a.handlePush('Bearer test',{subscription:config.subscription,message:{messageId:'x',data:Buffer.from(JSON.stringify({emailAddress:'me@test.com',historyId:'201'})).toString('base64url')}});expect(order).toEqual(['me@test.com','100','event','201','delivery']);expect(sends).toBe(1);a.disconnect();
});

test('renewal retries are bounded, observable, manually recoverable and stop on disconnect',async()=>{
 const jobs:{callback:()=>void;delay:number;cancelled:boolean}[]=[];let watches=0;let fail=false;
 const a=new GmailIntegration({onEvent:async()=>{},schedule:(callback,delay)=>{const j={callback,delay,cancelled:false};jobs.push(j);return()=>{j.cancelled=true;};},fetch:(async url=>{
 const p=String(url);if(p.includes('/token'))return Response.json({access_token:'test',expires_in:3600,scope:READ});if(p.endsWith('/profile'))return Response.json({emailAddress:'me@test.com',historyId:'100'});if(p.endsWith('/watch')){watches++;return fail?new Response('',{status:503}):Response.json({historyId:'100',expiration:String(Date.now()+86_400_000)});}if(p.includes('/history?'))return Response.json({historyId:'100'});if(p.endsWith('/stop'))return new Response(null,{status:204});throw new Error('unexpected');
 }) as typeof fetch});a.configure(config);const {state}=await a.beginOAuth();await a.completeOAuth('x',state);await a.startWatch();fail=true;
 const tick=async()=>{const job=jobs.shift()!;expect(job.cancelled).toBe(false);job.callback();await new Promise(r=>setTimeout(r,0));};
 await tick();expect(a.status().error).toBe('watch_renewal_failed_retry_scheduled');expect(jobs[0].delay).toBe(1000);
 for(let i=0;i<5;i++)await tick();expect(jobs).toHaveLength(0);expect(watches).toBe(7);expect(a.status().error).toBe('watch_renewal_failed_manual_retry_required');
 fail=false;await a.startWatch();expect(a.status().error).toBeUndefined();expect(a.status().renewalAttempts).toBe(0);const before=watches;const stale=jobs[0];a.disconnect();expect(stale.cancelled).toBe(true);stale.callback();await new Promise(r=>setTimeout(r,0));expect(watches).toBe(before);
});

test('concurrent API calls share refresh and preserve rotated refresh token',async()=>{
 let exchanges=0;let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});let held=false;const used:string[]=[];
 const a=new GmailIntegration({onEvent:async()=>{},fetch:(async(url,init)=>{const p=String(url);if(p.includes('/token')){exchanges++;if(exchanges>1){used.push(String(new URLSearchParams(String(init?.body)).get('refresh_token')));if(held)await gate;}return Response.json({access_token:`token${exchanges}`,refresh_token:`refresh${exchanges}`,expires_in:exchanges===1?3600:0,scope:READ});}if(p.endsWith('/profile'))return Response.json({emailAddress:'me@test.com',historyId:'100'});if(p.endsWith('/stop'))return new Response(null,{status:204});throw new Error('unexpected');}) as typeof fetch});a.configure(config);const {state}=await a.beginOAuth();await a.completeOAuth('x',state);
 // Expiry is controlled on the isolated instance, without advancing real time.
 const internal=a as unknown as {token:{expires:number}};internal.token.expires=0;held=true;
 const one=a.stopWatch();const two=a.stopWatch();await new Promise(r=>setTimeout(r,0));expect(exchanges).toBe(2);release();await Promise.all([one,two]);held=false;await a.stopWatch();expect(used).toEqual(['refresh1','refresh2']);a.disconnect();
});

test('disconnect invalidates a Gmail send awaiting approval (isolated transport)',async()=>{
 const f=fixture({send:true});await f.connect();let release!:(value:unknown)=>void;const gate=new Promise(resolve=>{release=resolve;});
 const attempt=f.adapter.sendApproved(Buffer.from('ISOLATED MIME').toString('base64url'),{execute:async operation=>{await gate;return operation();}});
 f.adapter.disconnect();release(undefined);await expect(attempt).rejects.toThrow('session_disconnected');expect(f.calls.filter(c=>c.endsWith('/messages/send'))).toHaveLength(0);
});

test('on-demand mailbox search/read is bounded, honors content choice and never saves messages',async()=>{
 let imports=0;const requests:string[]=[];
 const a=new GmailIntegration({onEvent:async()=>{imports++;},fetch:(async url=>{
 const p=String(url);requests.push(p);
 if(p.includes('/token'))return Response.json({access_token:'synthetic',expires_in:3600,scope:READ});
 if(p.endsWith('/profile'))return Response.json({emailAddress:'fixture@example.test',historyId:'100'});
 if(p.includes('/messages?'))return Response.json({messages:[{id:'abc123'}],nextPageToken:'more'});
 return Response.json({id:'abc123',snippet:'BODY MUST NOT LEAK',payload:{mimeType:'text/plain',headers:[{name:'Subject',value:'Fixture'},{name:'X-Private',value:'omit'}],body:{data:Buffer.from('Synthetic full text').toString('base64url')}}});
 }) as typeof fetch});
 await expect(a.searchMessages('from:test')).rejects.toThrow('gmail_connection_required');
 const connect=async(full:boolean)=>{a.configure({...config,allowFullContent:full,ingestEnabled:false});const {state}=await a.beginOAuth();await a.completeOAuth('synthetic',state);};
 await connect(false);const start=a.status().historyId;
 const result=await a.searchMessages('subject:Fixture',1);
 expect(result.messages).toHaveLength(1);expect(result.hasMore).toBe(true);expect(result.messages[0].reference).toBe('gmail:fixture@example.test:abc123');expect(result.persisted).toBe(false);
 expect(JSON.stringify(result)).not.toContain('BODY');expect(JSON.stringify(result)).not.toContain('Synthetic full text');expect(JSON.stringify(result)).not.toContain('X-Private');
 await expect(a.searchMessages('x',11)).rejects.toThrow('invalid_mail_search');await expect(a.readMessage('../profile')).rejects.toThrow('invalid_message_id');
 expect(a.status().historyId).toBe(start);expect(imports).toBe(0);
 await connect(true);const message=await a.readMessage('abc123');expect(message.text).toContain('Synthetic full text');expect(message.attachmentsIncluded).toBe(false);expect(requests.some(p=>p.includes('format=full'))).toBe(true);expect(imports).toBe(0);a.disconnect();
});
