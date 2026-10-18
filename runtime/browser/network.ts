import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type Resolver = (hostname: string) => Promise<readonly { address: string }[]>;
export interface BrowserNetworkPolicyOptions {
  timeoutMs?: number;
  /** Only accepted under NODE_ENV=test; never populate from a request or runtime config. */
  testOnly?: { enabled: true; fixtureOrigin?: string; resolve?: Resolver };
}

function publicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
}

/** Conservative global-unicast allowlist; mapped/translated/tunnel address ranges fail closed. */
export function isPublicBrowserAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const family = isIP(ip);
  if (family === 4) return publicIPv4(ip);
  if (family !== 6 || ip.includes("%") || ip.includes(".")) return false;
  const halves = ip.toLowerCase().split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const words = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right].map(w => parseInt(w, 16));
  const [a, b] = words;
  return a >= 0x2000 && a <= 0x3fff &&
    !(a === 0x2001 && (b < 0x0200 || b === 0x0db8)) &&
    a !== 0x2002 && !(a === 0x3fff && b <= 0x0fff);
}

export class BrowserNetworkPolicy {
  private readonly resolve: Resolver;
  private readonly fixtureOrigin?: string;
  private readonly timeoutMs: number;
  constructor(options: BrowserNetworkPolicyOptions = {}) {
    if (options.testOnly && process.env.NODE_ENV !== "test") throw new Error("Browser fixture allowances are test-only");
    this.timeoutMs = Math.min(10_000, Math.max(10, options.timeoutMs ?? 3000));
    this.resolve = options.testOnly?.resolve ?? (hostname => lookup(hostname, { all: true, verbatim: true }));
    if (options.testOnly?.fixtureOrigin) {
      const fixture = new URL(options.testOnly.fixtureOrigin);
      if (fixture.protocol !== "http:" || fixture.hostname !== "127.0.0.1" || !/^7\d{3}$/.test(fixture.port) || fixture.username || fixture.password || fixture.pathname !== "/" || fixture.search || fixture.hash) throw new Error("Fixture must be an exact loopback HTTP origin on port 7000–7999");
      this.fixtureOrigin = fixture.origin;
    }
  }

  /** Apply to every request/redirect/subresource, plus WebSockets with websocket:true.
   * DNS is checked here, but Chromium resolves independently: this is not DNS pinning or VM isolation.
   */
  async check(input: string, options: { websocket?: boolean } = {}): Promise<URL> {
    let url: URL;
    try { url = new URL(input); } catch { throw new Error("Browser destination is not a valid absolute URL"); }
    const allowed = options.websocket ? ["ws:", "wss:"] : ["http:", "https:"];
    if (!allowed.includes(url.protocol) || url.username || url.password) throw new Error("Browser destination scheme or credentials are not allowed");
    if (!options.websocket && this.fixtureOrigin && url.origin === this.fixtureOrigin) return url;
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    if (!host || !host.includes(".") && !isIP(host) || /(?:^|\.)(?:localhost|local|internal|home|lan|invalid|test|example|onion)$/.test(host) || host === "metadata.google.internal" || host === "instance-data.ec2.internal") throw new Error("Browser destination is not a public hostname");
    if (isIP(host)) {
      if (!isPublicBrowserAddress(host)) throw new Error("Browser destination address is not public");
      return url;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const addresses = await Promise.race([
        this.resolve(host),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Browser DNS lookup timed out")), this.timeoutMs); }),
      ]);
      if (!addresses.length || addresses.some(({ address }) => !isPublicBrowserAddress(address))) throw new Error("Browser DNS resolved to a non-public address");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Browser")) throw error;
      throw new Error("Browser DNS lookup failed");
    } finally { if (timer) clearTimeout(timer); }
    return url;
  }
}

/** Navigation syntax only. Query names/values and account paths are not permission boundaries. */
export function browserDestination(input:string):URL{
 const url=new URL(input);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Browser destination scheme or credentials are not allowed');
 return url;
}
/** Explicit bearer credentials are never accepted from model-generated URLs. OAuth flows stay manual. */
export function assertNoBrowserCredentials(input:string):URL{
 const url=browserDestination(input);
 for(const key of url.searchParams.keys())if(/^(?:access_token|refresh_token|id_token|api_key|apikey|password|passwd|client_secret|authorization)$/i.test(key))throw new Error('Credential URLs require manual navigation.');
 return url;
}
// Compatibility exports for retained callers; no anonymous/research classification remains.
export const assertPublicResearchUrl=(input:string,_resource=false)=>assertNoBrowserCredentials(input);
export const publicResearchDestination=assertNoBrowserCredentials;
