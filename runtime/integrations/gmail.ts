import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const READ = 'https://www.googleapis.com/auth/gmail.readonly';
const PUBSUB = 'https://www.googleapis.com/auth/pubsub';
const SEND = 'https://www.googleapis.com/auth/gmail.send';
const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
export type GmailConfig = { clientId: string; clientSecret: string; deliveryMode?: 'manual' | 'pull' | 'push'; redirectUri?: string; allowSend?: boolean; allowFullContent?: boolean; ingestEnabled?: boolean; topicName?: string; pushAudience?: string; pushServiceAccount?: string; subscription?: string };
export type GmailEvent = { id: string; kind: 'message'; source: 'gmail'; message: Record<string, unknown>; contentMode: 'metadata' | 'full' };
export type GmailHooks = { schedule?: (callback: () => void, delay: number) => (() => void); fetch?: typeof fetch; verifyPush?: (token: string, audience: string) => Promise<JWTPayload>; onEvent: (event: GmailEvent) => Promise<void>; onCursor?: (historyId: string, email?: string) => Promise<void>; loadCursor?: (email: string) => Promise<string | undefined>; deliverySeen?: (key: string) => Promise<boolean>; onDelivery?: (key: string) => Promise<void> };
export class GmailError extends Error { constructor(public code: string) { super(code); } }
const cursor = (id: unknown): string => { if (typeof id !== 'string' || !/^\d+$/.test(id)) throw new GmailError('invalid_history_id'); return id; };
const maxCursor = (a: string, b: string) => BigInt(a) > BigInt(b) ? a : b;
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** One instance per local session. Tokens are never serialized by status(). */
export class GmailIntegration {
  private config?: GmailConfig;
  private token?: { access: string; refresh?: string; expires: number; scopes: string[] };
  private pending?: { state: string; verifier: string; expires: number };
  private email?: string;
  private historyId?: string;
  private watchExpires?: number;
  private timer?: () => void;
  private renewalAttempts = 0;
  private watchEpoch = 0;
  private pullTimer?:()=>void;private pullEpoch=0;private pullAbort=new AbortController();private pulling?:Promise<{received:number;acknowledged:number}>;private pullState:'stopped'|'running'|'error'='stopped';private pullError?:string;private pullFailures=0;
  private refreshing?: Promise<NonNullable<GmailIntegration['token']>>;
  private recovery = false;
  private error?: string;
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private fetcher: typeof fetch;
  private abort = new AbortController();
  private syncQueue: Promise<unknown> = Promise.resolve();
  constructor(private hooks: GmailHooks) { this.fetcher = hooks.fetch ?? fetch; }
  configure(config: GmailConfig) {
    if (!config||typeof config.clientId!=='string'||typeof config.clientSecret!=='string'||!config.clientId.trim() || !config.clientSecret.trim()) throw new GmailError('oauth_configuration_required');
    const redirectUri = config.redirectUri ?? 'http://127.0.0.1:7341/api/integrations/gmail/callback';
    if (redirectUri !== 'http://127.0.0.1:7341/api/integrations/gmail/callback') throw new GmailError('invalid_redirect_uri');
    if(config.deliveryMode&&!['manual','pull','push'].includes(config.deliveryMode))throw new GmailError('invalid_delivery_mode');
    if(config.subscription&&!/^projects\/[A-Za-z0-9][A-Za-z0-9._~-]*\/subscriptions\/[A-Za-z0-9_-][A-Za-z0-9._~-]*$/.test(config.subscription))throw new GmailError('invalid_pubsub_subscription');
    this.disconnect();this.abort = new AbortController();
    this.config = { ...config, redirectUri };
  }
  status() { return { deliveryMode:this.config?.deliveryMode??'manual',pullState:this.pullState,pullError:this.pullError, configured: !!this.config, connected: !!this.token, email: this.email, allowSend: !!this.config?.allowSend && !!this.token?.scopes.includes(SEND), ingestEnabled: !!this.config?.ingestEnabled, contentMode: this.config?.allowFullContent ? 'full' : 'metadata', historyId: this.historyId, watchExpires: this.watchExpires, renewalAttempts: this.renewalAttempts, needsResyncConsent: this.recovery, error: this.error }; }
  async beginOAuth() {
    const c = this.requiredConfig();const generation=this.generation;
    const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url');
    const state = crypto.randomUUID();
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    if(generation!==this.generation)throw new GmailError('session_disconnected');
    this.pending = { state, verifier, expires: Date.now() + 600_000 };
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.redirectUri!, response_type: 'code', scope: [READ, ...(c.allowSend ? [SEND] : []),...(c.deliveryMode==='pull'?[PUBSUB]:[])].join(' '), access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    return { url: url.toString(), state };
  }
  async completeOAuth(code: string, state: string) {
    const pending = this.pending; this.pending = undefined;
    if (!pending || pending.state !== state || pending.expires < Date.now() || !code) throw new GmailError('invalid_oauth_state');
    const c = this.requiredConfig(); const generation = this.generation;
    const data = await this.tokenRequest({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri!, code_verifier: pending.verifier, grant_type: 'authorization_code' });
    if (generation !== this.generation) throw new GmailError('session_disconnected');
    const scopes = String(data.scope ?? '').split(' ');
    if (!scopes.includes(READ)) throw new GmailError('readonly_scope_required');
    this.token = { access: String(data.access_token), refresh: typeof data.refresh_token === 'string' ? data.refresh_token : undefined, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000, scopes };
    try { const profile = await this.api('/profile'); if (generation !== this.generation) throw new GmailError('session_disconnected'); if(typeof profile.emailAddress!=='string'||!profile.emailAddress.includes('@'))throw new GmailError('invalid_mail_profile');this.email = profile.emailAddress; const restored = await this.hooks.loadCursor?.(this.email);if(generation!==this.generation)throw new GmailError('session_disconnected'); this.historyId = cursor(restored ?? profile.historyId); await this.hooks.onCursor?.(this.historyId, this.email); } catch (e) { if(generation===this.generation)this.token = undefined; throw e; }
    return this.status();
  }
  /** On-demand reads never call onEvent or change the saved history cursor. */
  async searchMessages(query: string, max = 5) {
    this.requireRead();
    if (typeof query !== 'string' || !query.trim() || query.length > 500 || !Number.isInteger(max) || max < 1 || max > 10) throw new GmailError('invalid_mail_search');
    const generation = this.generation;
    const params = new URLSearchParams({ q: query.trim(), maxResults: String(max), includeSpamTrash: 'false' });
    const result = await this.api(`/messages?${params}`);
    if (generation !== this.generation) throw new GmailError('session_disconnected');
    const ids = Array.isArray(result.messages) ? result.messages.slice(0, max).map(m => (m as {id?: unknown}).id).filter((id): id is string => typeof id === 'string') : [];
    const messages = [];
    for (const id of ids) {
      try { messages.push(await this.readMessage(id)); }
      catch (error) { if (!(error instanceof GmailError && error.code === 'gmail_http_404')) throw error; }
      if (generation !== this.generation) throw new GmailError('session_disconnected');
    }
    return { account: this.email!, messages, hasMore: typeof result.nextPageToken === 'string', persisted: false as const, untrusted: true as const };
  }
  async readMessage(id: string) {
    this.requireRead();
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new GmailError('invalid_message_id');
    const generation = this.generation;
    const mode = this.config?.allowFullContent ? 'full' : 'metadata';
    const message = await this.api(`/messages/${encodeURIComponent(id)}?format=${mode}${mode === 'metadata' ? '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date' : ''}`);
    if (generation !== this.generation) throw new GmailError('session_disconnected');
    type Part = {mimeType?: string; filename?: string; body?: {data?: string}; parts?: Part[]; headers?: {name?: string; value?: string}[]};
    const payload = message.payload as Part | undefined;
    const headers = (payload?.headers ?? []).filter(h => ['from','to','subject','date'].includes(String(h.name).toLowerCase())).slice(0, 10).map(h => ({name: String(h.name).slice(0,20), value: String(h.value ?? '').slice(0,2000)}));
    let text = ''; let visited = 0;
    const collect = (part: Part, depth = 0) => {
      if (depth > 8 || ++visited > 100 || text.length >= 20_000 || part.filename || part.headers?.some(h => String(h.name).toLowerCase() === 'content-disposition' && /^attachment/i.test(String(h.value)))) return;
      if (part.mimeType === 'text/plain' && typeof part.body?.data === 'string') text += Buffer.from(part.body.data.slice(0, 40_000), 'base64url').toString('utf8').slice(0, 20_000 - text.length) + '\n';
      for (const child of part.parts?.slice(0, 20) ?? []) collect(child, depth + 1);
    };
    if (mode === 'full' && payload) collect(payload);
    return { id, threadId: typeof message.threadId === 'string' ? message.threadId : undefined, account: this.email!, reference: `gmail:${this.email}:${id}`, persisted: false as const, untrusted: true as const, contentMode: mode, headers, ...(mode === 'full' ? {text: text.slice(0,20_000), textMayBeIncomplete: true, attachmentsIncluded: false} : {}) };
  }
  private requireRead() {
    if (!this.token || !this.email) throw new GmailError('gmail_connection_required');
    if (!this.token.scopes.includes(READ)) throw new GmailError('readonly_scope_required');
  }
  async startWatch() {
    const epoch = ++this.watchEpoch; this.timer?.(); this.timer = undefined; this.renewalAttempts = 0;
    return this.watch(epoch);
  }
  private async watch(epoch: number) {
    if (!this.config?.ingestEnabled) throw new GmailError('ingestion_consent_required');
    const c = this.requiredConfig();
    if (!c.topicName || !/^projects\/[^/]+\/topics\/[^/]+$/.test(c.topicName)) throw new GmailError('pubsub_topic_required');
    const generation = this.generation;
    const data = await this.api('/watch', { method: 'POST', body: JSON.stringify({ topicName: c.topicName, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }) });
    if (generation !== this.generation || epoch !== this.watchEpoch) throw new GmailError('session_disconnected');
    // Never replace an existing cursor on renewal: changes during downtime still need replay.
    if (!this.historyId) { this.historyId = cursor(data.historyId); await this.hooks.onCursor?.(this.historyId, this.email); }
    this.watchExpires = Number(data.expiration);
    if (!Number.isFinite(this.watchExpires) || this.watchExpires <= Date.now()) throw new GmailError('invalid_watch_expiration');
    this.timer?.(); this.error = undefined; this.renewalAttempts = 0;
    this.timer = this.schedule(() => { void this.renewWatch(generation, epoch); }, Math.max(1000, Math.min(86_400_000, this.watchExpires - Date.now() - 3_600_000)));
    return this.status();
  }
  private schedule(callback: () => void, delay: number) {
    if (this.hooks.schedule) return this.hooks.schedule(callback, delay);
    const timer = setTimeout(callback, delay); timer.unref?.(); return () => clearTimeout(timer);
  }
  private async renewWatch(generation: number, epoch: number) {
    if (generation !== this.generation || epoch !== this.watchEpoch || !this.token) return;
    try { await this.watch(epoch); }
    catch {
      if (generation !== this.generation || epoch !== this.watchEpoch || !this.token) return;
      const delays = [1000, 5000, 30000, 120000, 300000];
      const delay = delays[this.renewalAttempts++];
      this.error = delay === undefined ? 'watch_renewal_failed_manual_retry_required' : 'watch_renewal_failed_retry_scheduled';
      if (delay !== undefined) this.timer = this.schedule(() => { void this.renewWatch(generation, epoch); }, delay);
      return;
    }
    try { await this.syncHistory(); } catch { if (generation === this.generation && epoch === this.watchEpoch && !this.recovery) this.error = 'history_sync_failed_manual_retry_required'; }
  }

  async handlePush(authorization: string | null, body: unknown) {
    const c = this.requiredConfig();const generation=this.generation;
    if (!c.pushAudience || !c.pushServiceAccount || !c.subscription) throw new GmailError('push_configuration_required');
    if (!authorization?.startsWith('Bearer ')) throw new GmailError('invalid_push_auth');
    const claims = await (this.hooks.verifyPush ?? (async (token, audience) => (await jwtVerify(token, jwks, { audience, issuer: ['https://accounts.google.com', 'accounts.google.com'], algorithms: ['RS256'], maxTokenAge: '1h' })).payload))(authorization.slice(7), c.pushAudience);
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(String(claims.iss)) || claims.email !== c.pushServiceAccount || claims.email_verified !== true || !claims.exp || claims.exp * 1000 <= Date.now() || !(claims.aud === c.pushAudience || Array.isArray(claims.aud) && claims.aud.includes(c.pushAudience))) throw new GmailError('invalid_push_identity');
    if(generation!==this.generation)throw new GmailError('session_disconnected');return this.notification(body,c,generation);
  }
  private async notification(body:unknown,c:GmailConfig,generation:number){
    const envelope = body as { subscription?: string; message?: { data?: string; messageId?: string } };
    if (envelope?.subscription !== c.subscription || !envelope.message?.messageId || typeof envelope.message.data !== 'string' || envelope.message.data.length > 8192) throw new GmailError('invalid_push_payload');
    let payload: { emailAddress?: string; historyId?: string };
    try { payload = JSON.parse(Buffer.from(envelope.message.data, 'base64url').toString('utf8')); } catch { throw new GmailError('invalid_push_payload'); }
    if (!this.email || payload.emailAddress?.toLowerCase() !== this.email.toLowerCase()) throw new GmailError('push_account_mismatch');
    const target = cursor(payload.historyId);
    // Serialized cursor advancement handles duplicate/out-of-order notifications, including concurrent deliveries.
    const deliveryKey = `gmail-push:${c.subscription}:${envelope.message.messageId}`;
    const task = this.queue.then(async () => { if(generation!==this.generation)throw new GmailError('session_disconnected');if (await this.hooks.deliverySeen?.(deliveryKey)) return { duplicate: true }; if (this.historyId && BigInt(target) <= BigInt(this.historyId)) return { duplicate: true }; await this.syncHistory();if(generation!==this.generation)throw new GmailError('session_disconnected'); await this.hooks.onDelivery?.(deliveryKey); return { duplicate: false }; });
    this.queue = task.catch(() => {}); return task;
  }
  /** Pull receives Google Pub/Sub notifications locally; it does not periodically scan the mailbox. */
  async startPull(){
    const c=this.requiredConfig();if(c.deliveryMode!=='pull')throw new GmailError('pull_mode_required');if(!c.subscription)throw new GmailError('pubsub_subscription_required');if(!c.ingestEnabled)throw new GmailError('ingestion_consent_required');
    if(!this.token?.scopes.includes(PUBSUB))throw new GmailError('pubsub_scope_reconnect_required');
    this.stopPull();const epoch=this.pullEpoch;await this.startWatch();
    if(epoch!==this.pullEpoch)throw new GmailError('session_disconnected');this.pullState='running';this.pullFailures=0;this.pullError=undefined;this.pullTimer=this.schedule(()=>{void this.pullLoop(epoch);},1);
    return this.status();
  }
  stopPull(){this.pullEpoch++;this.pullTimer?.();this.pullTimer=undefined;this.pullAbort.abort();this.pullAbort=new AbortController();this.pullState='stopped';this.pullError=undefined;this.pullFailures=0;return this.status();}
  async pullOnce():Promise<{received:number;acknowledged:number}>{
    if(this.pulling)return this.pulling;
    const c=this.requiredConfig();this.requireRead();if(c.deliveryMode!=='pull')throw new GmailError('pull_mode_required');if(!c.ingestEnabled)throw new GmailError('ingestion_consent_required');
    if(!c.subscription)throw new GmailError('pubsub_subscription_required');if(!this.token?.scopes.includes(PUBSUB))throw new GmailError('pubsub_scope_reconnect_required');
    const generation=this.generation,epoch=this.pullEpoch,signal=this.pullAbort.signal;
    const operation=(async()=>{
      const result=await this.api(`/${c.subscription}:pull`,{method:'POST',body:JSON.stringify({maxMessages:10}),signal},'https://pubsub.googleapis.com/v1');
      if(generation!==this.generation||epoch!==this.pullEpoch)throw new GmailError('session_disconnected');
      const messages=Array.isArray(result.receivedMessages)?result.receivedMessages.slice(0,10):[];let acknowledged=0;
      for(const received of messages as {ackId?:unknown;message?:unknown}[]){
        if(typeof received.ackId!=='string'||!received.ackId||received.ackId.length>4096)throw new GmailError('invalid_pubsub_delivery');
        await this.notification({subscription:c.subscription,message:received.message},c,generation);
        if(generation!==this.generation||epoch!==this.pullEpoch)throw new GmailError('session_disconnected');
        await this.api(`/${c.subscription}:acknowledge`,{method:'POST',body:JSON.stringify({ackIds:[received.ackId]}),signal},'https://pubsub.googleapis.com/v1');acknowledged++;
      }
      return {received:messages.length,acknowledged};
    })();this.pulling=operation;
    try{return await operation;}finally{if(this.pulling===operation)this.pulling=undefined;}
  }
  private async pullLoop(epoch:number){
    if(epoch!==this.pullEpoch||this.pullState!=='running')return;let delay=1000;
    try{await this.pullOnce();if(epoch!==this.pullEpoch)return;this.pullFailures=0;this.pullError=undefined;}
    catch(error){if(epoch!==this.pullEpoch)return;this.pullError=error instanceof GmailError?error.code:'pubsub_pull_failed';delay=Math.min(60000,1000*2**++this.pullFailures);if(this.pullFailures>=6){this.pullState='error';return;}}
    this.pullTimer=this.schedule(()=>{void this.pullLoop(epoch);},delay);
  }
  async syncHistory() {
    const task = this.syncQueue.then(() => this.syncHistoryInternal()); this.syncQueue = task.catch(() => {}); return task;
  }
  private async syncHistoryInternal() {
    if (!this.config?.ingestEnabled) throw new GmailError('ingestion_consent_required');
    if (this.recovery) throw new GmailError('resync_consent_required');
    if (!this.historyId) throw new GmailError('history_cursor_required');
    const start = this.historyId; const generation = this.generation; let latest = start; let page: string | undefined; const seen = new Set<string>();
    try { do {
      const params = new URLSearchParams({ startHistoryId: start, historyTypes: 'messageAdded', labelId: 'INBOX', maxResults: '100' }); if (page) params.set('pageToken', page);
      const data = await this.api(`/history?${params}`);
      for (const item of (data.history ?? []) as { id: string; messagesAdded?: { message: { id: string } }[] }[]) {
        latest = maxCursor(latest, cursor(item.id));
        for (const added of item.messagesAdded ?? []) { const id = added.message.id; if (seen.has(id)) continue; seen.add(id);
          const mode = this.config?.allowFullContent ? 'full' : 'metadata';
          let message: Record<string, unknown>;
          try { message = await this.api(`/messages/${encodeURIComponent(id)}?format=${mode}${mode === 'metadata' ? '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date' : ''}`); } catch (e) { if (e instanceof GmailError && e.code === 'gmail_http_404') continue; throw e; }
          if (generation !== this.generation) throw new GmailError('session_disconnected');
          message=this.boundedImport(message,mode);
          await this.hooks.onEvent({ id: `gmail:${this.email}:${id}`, kind: 'message', source: 'gmail', message, contentMode: mode });
        }
      }
      latest = maxCursor(latest, cursor(data.historyId)); page = typeof data.nextPageToken === 'string' ? data.nextPageToken : undefined;
    } while (page);
    if (generation !== this.generation) throw new GmailError('session_disconnected');
    await this.hooks.onCursor?.(latest, this.email); if(generation!==this.generation)throw new GmailError('session_disconnected');this.historyId = latest;
    } catch (e) { if (e instanceof GmailError && e.code === 'gmail_http_404') { this.recovery = true; this.error = 'history_expired_resync_consent_required'; } throw e; }
    return this.status();
  }
  /** Imported mail is bounded plain text; never fetch attachments, HTML resources or remote images. */
  private boundedImport(message:Record<string,unknown>,mode:'metadata'|'full'){
    type Part={mimeType?:string;filename?:string;body?:{data?:string};headers?:{name?:string;value?:string}[];parts?:Part[]};
    const payload=message.payload as Part|undefined;
    const headers=(payload?.headers??[]).filter(h=>['from','to','subject','date'].includes(String(h.name).toLowerCase())).slice(0,10).map(h=>({name:String(h.name).slice(0,20),value:String(h.value??'').slice(0,2000)}));
    let text='',visited=0;
    const collect=(part:Part,depth=0)=>{if(depth>8||++visited>100||text.length>=20000||part.filename||part.headers?.some(h=>String(h.name).toLowerCase()==='content-disposition'&&/^attachment/i.test(String(h.value))))return;if(part.mimeType==='text/plain'&&typeof part.body?.data==='string')text+=Buffer.from(part.body.data.slice(0,40000),'base64url').toString('utf8').slice(0,20000-text.length)+'\n';for(const child of part.parts?.slice(0,20)??[])collect(child,depth+1);};
    if(mode==='full'&&payload)collect(payload);
    return {id:message.id,threadId:message.threadId,labelIds:message.labelIds,internalDate:message.internalDate,payload:{headers,...(mode==='full'?{mimeType:'text/plain',body:{data:Buffer.from(text.slice(0,20000)).toString('base64url')}}:{})}};
  }
  /** Explicit recovery skips the inaccessible gap, never imports the full mailbox. */
  async resumeFromNow(consent: boolean) { if (!consent) throw new GmailError('resync_consent_required');const generation=this.generation; const data = await this.api('/profile');if(generation!==this.generation)throw new GmailError('session_disconnected'); const id = cursor(data.historyId); await this.hooks.onCursor?.(id, this.email);if(generation!==this.generation)throw new GmailError('session_disconnected'); this.historyId = id; this.recovery = false; this.error = undefined; return this.status(); }
  /** Caller must execute this exclusively inside its durable one-shot approval gate. */
  async sendApproved(raw: string, approval: { execute: <T>(operation: () => Promise<T>) => Promise<T> }) {
    if (!this.status().allowSend) throw new GmailError('send_scope_required');
    if (!approval || typeof approval.execute !== 'function') throw new GmailError('approval_required');
    if (!raw || raw.length > 10_000_000 || !/^[A-Za-z0-9_-]+={0,2}$/.test(raw)) throw new GmailError('invalid_message');
    const generation=this.generation;
    return approval.execute(() => { if(generation!==this.generation)throw new GmailError('session_disconnected'); return this.api('/messages/send', { method: 'POST', body: JSON.stringify({ raw }) }); });
  }
  async stopWatch() { this.stopPull();this.watchEpoch++; this.timer?.(); await this.api('/stop',{method:'POST'}); this.timer=undefined; this.watchExpires=undefined; }
  disconnect() { this.stopPull();this.abort.abort(); this.generation++; this.watchEpoch++; this.timer?.(); this.timer = undefined; this.refreshing = undefined; this.renewalAttempts = 0; this.token = undefined; this.pending = undefined; this.config = undefined; this.email = undefined; this.historyId = undefined; this.watchExpires = undefined; this.recovery = false; this.error = undefined; }
  private requiredConfig() { if (!this.config) throw new GmailError('oauth_configuration_required'); return this.config; }
  private async tokenRequest(fields: Record<string, string>): Promise<Record<string, unknown>> { const response = await this.fetcher('https://oauth2.googleapis.com/token', { method: 'POST', redirect:'error',signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(15_000)]), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }); if (!response.ok) throw new GmailError('oauth_exchange_failed'); const data = await response.json(); if (typeof data.access_token !== 'string' || !data.access_token) throw new GmailError('oauth_exchange_failed'); return data; }
  private async api(path: string, init: RequestInit = {},base=BASE): Promise<Record<string, unknown>> {
    let token = this.token; if (!token) throw new GmailError('gmail_connection_required'); const generation = this.generation;
    if (token.expires < Date.now() + 60_000) {
      if (!this.refreshing) {
        if (!token.refresh) throw new GmailError('gmail_reconnect_required');
        const c = this.requiredConfig(); const previous = token;
        const refresh = (async () => { const data = await this.tokenRequest({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: previous.refresh!, grant_type: 'refresh_token' }); if (generation !== this.generation) throw new GmailError('session_disconnected'); return this.token = { ...previous, access: String(data.access_token), refresh: typeof data.refresh_token === 'string' ? data.refresh_token : previous.refresh, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000 }; })();
        this.refreshing = refresh;
        void refresh.finally(() => { if (this.refreshing === refresh) this.refreshing = undefined; }).catch(() => {});
      }
      token = await this.refreshing;
    }
    const response = await this.fetcher(`${base}${path}`, { ...init, redirect:'error',signal: AbortSignal.any([this.abort.signal,...(init.signal?[init.signal]:[]), AbortSignal.timeout(base===BASE?30_000:95_000)]), headers: { Authorization: `Bearer ${token.access}`, 'Content-Type': 'application/json' } });
    if (!response.ok) throw new GmailError(`${base===BASE?'gmail':'pubsub'}_http_${response.status}`);
    return response.status === 204 ? {} : response.json();
  }
}
