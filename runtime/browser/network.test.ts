import { describe, expect, test } from "bun:test";
import { BrowserNetworkPolicy, isPublicBrowserAddress } from "./network";

const policy = (addresses = ["93.184.216.34"]) => new BrowserNetworkPolicy({ testOnly: { enabled: true, resolve: async () => addresses.map(address => ({ address })) } });
describe("browser public network boundary", () => {
  test("accepts canonical public HTTP/HTTPS and WSS destinations", async () => {
    expect((await policy().check("https://EXAMPLE.COM./path?q=hello")).protocol).toBe("https:");
    expect((await policy().check("http://93.184.216.34/")).hostname).toBe("93.184.216.34");
    expect((await policy().check("wss://publicsite.com/socket", { websocket: true })).protocol).toBe("wss:");
    expect(isPublicBrowserAddress("2606:4700:4700::1111")).toBe(true);
  });
  test("rejects internal protocols, embedded credentials, names and numeric encodings", async () => {
    for (const url of ["file:///etc/passwd", "chrome://settings", "about:blank", "data:text/html,hello", "javascript:alert(1)", "blob:https://publicsite.com/id", "https://u:p@publicsite.com", "http://localhost/", "http://a.local/", "http://a.internal/", "http://printer/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://[::ffff:7f00:1]/", "http://127.1/", "ws://publicsite.com/"]) {
      await expect(policy().check(url)).rejects.toThrow();
    }
  });
  test("fails closed for private, reserved and metadata addresses", async () => {
    for (const address of ["0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.0.1", "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "::", "::1", "::ffff:8.8.8.8", "64:ff9b::808:808", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "2002:0808:0808::1", "2001::1", "3fff::1"]) {
      expect(isPublicBrowserAddress(address)).toBe(false);
      await expect(policy([address]).check("https://publicsite.com")).rejects.toThrow();
    }
  });
  test("checks every answer and fails on empty/error/slow DNS", async () => {
    await expect(policy(["93.184.216.34", "127.0.0.1"]).check("https://publicsite.com")).rejects.toThrow();
    await expect(policy([]).check("https://publicsite.com")).rejects.toThrow();
    const slow = new BrowserNetworkPolicy({ timeoutMs: 10, testOnly: { enabled: true, resolve: () => new Promise(() => {}) } });
    await expect(slow.check("https://publicsite.com")).rejects.toThrow("timed out");
    const error = new BrowserNetworkPolicy({ testOnly: { enabled: true, resolve: async () => { throw Error("secret DNS error"); } } });
    await expect(error.check("https://publicsite.com")).rejects.toThrow("Browser DNS lookup failed");
  });
  test("fixture bypass is exact origin only and cannot permit redirects or sockets", async () => {
    const fixture = new BrowserNetworkPolicy({ testOnly: { enabled: true, fixtureOrigin: "http://127.0.0.1:7459", resolve: async () => [{ address: "127.0.0.1" }] } });
    expect((await fixture.check("http://127.0.0.1:7459/fixture")).pathname).toBe("/fixture");
    for (const url of ["http://127.0.0.1:7460/", "https://127.0.0.1:7459/", "https://redirect.publicsite.com/"]) await expect(fixture.check(url)).rejects.toThrow();
    await expect(fixture.check("ws://127.0.0.1:7459/", { websocket: true })).rejects.toThrow();
    expect(() => new BrowserNetworkPolicy({ testOnly: { enabled: true, fixtureOrigin: "http://127.0.0.1:3000" } })).toThrow();
  });
  test("production rejects test allowances", () => {
    const original = process.env.NODE_ENV;
    try {
      Object.assign(process.env, { NODE_ENV: "production" });
      expect(() => policy()).toThrow("test-only");
    } finally { Object.assign(process.env, { NODE_ENV: original }); }
  });
});
