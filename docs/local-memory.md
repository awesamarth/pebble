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
