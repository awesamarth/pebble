# Bun / Pi Durable SQLite compatibility record

Observed on this Mac: Bun1.3.14, Node22.17.0, pinned `@earendil-works/pi-durable@1.2.0`. Published package declares Node>=22.19.0.

Minimal repro:

```sh
bun verification/bun-sqlite-repro.mjs
```

Observed output from importing the Node adapter: `No such built-in module: node:sqlite`.

This is expected for that adapter's documented scope: the installed `dist/storage/sqlite/node.js` explicitly imports Node's built-in `DatabaseSync`; its type docs call it a Node-backed SQLite facade. This observation is not evidence of an upstream defect, and no issue was filed.

Pebble uses the portable `SqliteStorage` core and its public `SqliteDatabase` interface through a local `bun:sqlite` adapter in `runtime/sqlite.ts`. The actual Pi Durable Harness and the upstream storage conformance suite pass on Bun. That verifies this local path; it does not claim an upstream support guarantee for all Bun/runtime features. Node was not silently upgraded or substituted. Runtime/package pins remain in package.json and bun.lock.
