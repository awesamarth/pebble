# Local FalkorDB for pebble

The project-local `compose.falkordb.yml` uses the official server-only image, pinned by digest. The database runs in `pebble-falkordb` and binds only `127.0.0.1:7380`. It does not start a browser UI or publish port3000. The named volume `pebble-falkordb-data` mounts at the image’s observed data directory `/var/lib/falkordb/data`; AOF is enabled with every-second sync. The container restart policy is no: start it explicitly when needed. No login item or system startup setting was added.

```sh
docker compose -f compose.falkordb.yml up -d
docker compose -f compose.falkordb.yml stop
```

Install and start [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) first. From the pebble repository root, `docker info` and `docker compose version` should succeed before running the commands above. Use `docker compose -f compose.falkordb.yml ps` to inspect container health. The first start downloads the pinned image. Do not remove the named volume if you want to retain your saved graph.

When the user explicitly wants to connect and sync data, enter these in Setup & connections → Connect memory:

- Host: 127.0.0.1
- Port: 7380
- Database name: pebble
- Username and password: blank for this local-only development setup
- Encrypted connection: off (the connection stays on loopback)
- Create a pebble workspace in this database: select for first setup

Choosing Connect & check memory triggers the source-sync queue and can copy eligible saved conversations and selected app messages into this database. Starting the container alone does not connect the application or import sources. Other local processes can access this unauthenticated loopback development service. Use your own authenticated server settings for a different deployment; authentication is not configured by this compose file.

Official references: [Docker deployment](https://docs.falkordb.com/operations/docker), [persistence](https://docs.falkordb.com/operations/durability/persistence). The current server-only image’s observed data directory was checked rather than assuming the documentation’s /data example.


## Current graph behavior

The owner now uses the selected FalkorDB graph for source-backed facts connected to named Person and Project entities. Entity labels must occur in both fact and original source. Chat recall fuses wording with native local sentence-vector matches, then performs configurable multi-step traversal through shared entities; related facts carry `relatedTo`, depth and source-attributed paths. Legacy facts are backfilled into the native vector index; source scope is enforced before semantic ranking and at every traversal step. See [actual queries, settings and measurements](graph-memory.md). This association supplies context, not an invented factual relationship. Both ends of traversal are conversation-scoped for channel memory. The Memory inspector shows source → fact → person/project and explains a connected search result. Corrections remove obsolete ABOUT edges; stale edits are rejected and source text stays intact.

Successful passwordless connection settings are saved locally and rechecked on owner restart; database passwords are never saved in ordinary settings and remain session-only. Graph data itself persists in FalkorDB's existing volume. Current owner setup is connected; the earlier preparation-only notes above describe the original provisioning step, not a current connection blocker.

Verification: `bun run runtime/memory-real-smoke.ts` creates and deletes a uniquely named synthetic graph. It proves shared-person retrieval across two different facts, source provenance, channel isolation, corrections, stale edit rejection, reconnect persistence and deletion against the real database. A separate bounded three-turn real gpt-6-sol test through normal Engine/SDK/secure sign-in saved synthetic Mira/Lantern facts, retrieved the meeting preference through shared Mira, and answered a later Lantern meeting question with source citations. Its disposable conversation directory and graph were deleted afterward; the personal graph was untouched. This is live model+graph evidence, not merely a connection badge.
