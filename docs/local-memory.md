# Local FalkorDB for pebble

The project-local `compose.falkordb.yml` uses the official server-only image, pinned by digest. The database runs in `pebble-falkordb` and binds only `127.0.0.1:7380`. It does not start a browser UI or publish port3000. The named volume `pebble-falkordb-data` mounts at the image’s observed data directory `/var/lib/falkordb/data`; AOF is enabled with every-second sync. The container restart policy is no: start it explicitly when needed. No login item or system startup setting was added.

```sh
docker compose -f compose.falkordb.yml up -d
docker compose -f compose.falkordb.yml stop
```

Do not remove the named volume. No private data has been connected or imported. Health checks verified PONG, the graph module, empty GRAPH.LIST, actual persistence directory/settings and the localhost-only port mapping. No graph or fixture data was created.

When the user explicitly wants to connect and sync data, enter these in Setup & connections → Connect memory:

- Host: 127.0.0.1
- Port: 7380
- Database name: pebble
- Username and password: blank for this local-only development setup
- Encrypted connection: off (the connection stays on loopback)
- Create a pebble workspace in this database: select for first setup

Connecting the owner triggers its existing source-sync queue. That can copy already-saved conversations and Discord messages into the database, so database preparation has deliberately stopped before that step. Get the user’s explicit go-ahead to connect/sync; initializing an empty workspace alone does not make that source import optional. Other local processes can access this unauthenticated local development service. Adding database authentication requires a separate credential configuration step; no credentials were generated or read.

Official references: [Docker deployment](https://docs.falkordb.com/operations/docker), [persistence](https://docs.falkordb.com/operations/durability/persistence). The current server-only image’s observed data directory was checked rather than assuming the documentation’s /data example.


## Current graph behavior

The owner now uses the selected FalkorDB graph for source-backed facts connected to named Person and Project entities. Entity labels must occur in both fact and original source. Chat recall fuses wording with native local sentence-vector matches, then performs configurable multi-step traversal through shared entities; related facts carry `relatedTo`, depth and source-attributed paths. Legacy facts are backfilled into the native vector index; source scope is enforced before semantic ranking and at every traversal step. See [actual queries, settings and measurements](graph-memory.md). This association supplies context, not an invented factual relationship. Both ends of traversal are conversation-scoped for channel memory. The Memory inspector shows source → fact → person/project and explains a connected search result. Corrections remove obsolete ABOUT edges; stale edits are rejected and source text stays intact.

Successful passwordless connection settings are saved locally and rechecked on owner restart; database passwords are never saved in ordinary settings and remain session-only. Graph data itself persists in FalkorDB's existing volume. Current owner setup is connected; the earlier preparation-only notes above describe the original provisioning step, not a current connection blocker.

Verification: `bun run runtime/memory-real-smoke.ts` creates and deletes a uniquely named synthetic graph. It proves shared-person retrieval across two different facts, source provenance, channel isolation, corrections, stale edit rejection, reconnect persistence and deletion against the real database. A separate bounded three-turn real gpt-6-sol test through normal Engine/SDK/secure sign-in saved synthetic Mira/Lantern facts, retrieved the meeting preference through shared Mira, and answered a later Lantern meeting question with source citations. Its disposable conversation directory and graph were deleted afterward; the personal graph was untouched. This is live model+graph evidence, not merely a connection badge.
