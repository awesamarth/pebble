# pebble

A local personal assistant with a character you name, durable conversations, source-backed graph memory, tools and turn-based voice. Built with Next.js, TypeScript, Bun, **Pi Durable Harness 1.2.0** and **FalkorDB**. The original character playground is at `/`; the functional workspace is at `/home`.

## Run locally

The alpha targets **macOS**. Development checks used Bun **1.3.14**; other hosts and a clean Mac install have not been verified. Install [Apple Command Line Tools](https://developer.apple.com/xcode/resources/) (`xcode-select --install`) for Git, Swift sentence embeddings and optional native voice builds. Install [Bun](https://bun.com/docs/installation), then open a new terminal and check `bun --version`. To reproduce the tested Bun version, the official installer accepts `curl -fsSL https://bun.com/install | bash -s "bun-v1.3.14"`.

For a local graph, install [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) and start it; `docker info` and `docker compose version` should succeed. A reachable FalkorDB Cloud/server can replace Docker. A model account/API key and internet access are needed for chat; optional voice has separate [local setup](docs/local-voice.md#install-on-a-fresh-mac).

```sh
git clone https://github.com/awesamarth/pebble.git
cd pebble
bun install --frozen-lockfile
# Required for browser tools; installs Playwright's matching Chromium.
bunx playwright install chromium
# Optional local FalkorDB; alternatively configure your own Cloud/server graph.
docker compose -f compose.falkordb.yml up -d
# Terminal one: one process owns durable storage
bun run runtime
# Terminal two: open another terminal and cd into the same pebble clone
bun run dev --port 7341
```

Open http://127.0.0.1:7341/home. The owner binds only `127.0.0.1:7342`; the proxy accepts `localhost:7341` / `127.0.0.1:7341`. Check ports first; do not kill unrelated listeners. Port 3000 is not used. Keep both terminals running. Stop each with Ctrl-C when finished; start them again from the repository root. If configuring optional voice, export its three tool-path variables in terminal one **before** starting the runtime. Reconnecting a session-only account can be necessary after a runtime restart.

1. Save your character.
2. Sign in with ChatGPT, or configure your own OpenAI, Anthropic, Google/Gemini or supported OpenRouter API key/model. API inference may incur the selected provider's charges. ChatGPT uses a fresh app-specific device UUID, not imported Codex credentials; its callback uses port 1455.
3. Connect FalkorDB. For the provided local container: host `127.0.0.1`, port `7380`, graph `pebble`, blank username/password, TLS off. Explicitly initialize the graph on first setup. Cloud uses your own settings and TLS. Connecting syncs saved eligible conversation sources into that graph.
4. Send a message. Optional app connections, folder grants and microphone consent remain yours to configure; a fresh clone contains no account credentials or private data.

On macOS, supported provider credentials use the OS Keychain. Discord token persistence is opt-in. Passwordless graph configuration restores on restart; database passwords remain session-only. Gmail setup and sign-in are session-only unless you opt into macOS Keychain storage. Character, conversation/task storage and source-sync outbox live under ignored `.pebble/`. Never publish that directory. See [provider persistence](docs/provider-persistence.md), [Gmail setup](docs/gmail-setup.md) and [local database setup](docs/local-memory.md).

## Implemented and verified

| Capability | Working behavior and evidence boundary |
| --- | --- |
| Assistant execution | Real Pi Durable Harness; streamed committed replies, SQLite history, abort/resume, task persistence, native tools and automatic compaction. Compaction status is visible; a real Harness test verifies original history after compaction/reopen. |
| FalkorDB memory | Source-backed facts, Person/Project links, hybrid local semantic/lexical retrieval and configurable multi-hop context. Inspect sources, edit/delete facts, reject stale edits and reconnect across sessions. Real database and real-model synthetic-data checks passed. **[Graph model, actual queries and decision evidence](docs/graph-memory.md).** |
| Local files and private work | Explicit folder grants; Pi-native read/create/edit, file/text search and bounded private background tasks. Real-model synthetic file read/edit/create checks passed. Optional commands require exact review and run in disposable copies. No folders are granted by default. |
| Browser | One dedicated persistent Chromium profile for searches, navigation, tabs, ordinary clicks/forms and authorized signed-in browsing. Hidden execution and a user-controlled window share that profile; consequential changes retain action-specific reviews. Isolated real-browser/model checks passed, including YouTube trailer search; this does not prove every website works. [Controls and limits](docs/browser.md). |
| In-app voice | Hands-free alpha: Start call requests microphone access; speech/silence detection submits local Whisper transcripts to the existing Pi conversation. Completed replies play automatically; speaking can interrupt. End stops capture/playback. Batch transcription adds delay; this is not streaming speech-to-speech. Synthetic pipeline and mocked interaction checks passed; real acoustic testing remains pending. [Install and limits](docs/local-voice.md). |
| Discord | Owner-scoped mentions, channel memory/history, ordinary replies, private-work handoff and opt-in requested reminders/completion notices. A saved bot connection is operational on the development Mac; fresh clones require their own bot setup. Delivery/notification regressions use isolated transports. No private channel IDs or tokens are included. |
| Gmail | OAuth, bounded mailbox search/read, summary/reply context handoff, reviewable outbound messages and incremental intake via manual checks, local Pub/Sub pull or authenticated hosted push. Google OAuth and Gmail profile connection verified on the development Mac, with approved read/send scopes. Mailbox content search/read and sending remain unverified live; fixture checks cover them. Fresh setups require Google consent. |
| Character and chat UI | Original parameterized SVG customizer, accessible controls, local persistence, safe Markdown, code highlighting/copy, tables, source inspection and bounded image inputs. Desktop/mobile checks passed. |

Voice uses local batch recognition with hands-free turn detection and interruption; it is not phone/SMS or streaming realtime speech-to-speech. There is no multi-user hosting, recurring autonomous monitor or full desktop control. Reviews remain for consequential sends/actions; ordinary authorized reads/searches/public research do not require repeated approval. See [current status](docs/product-status.md) and [execution boundaries](docs/assistant-capabilities.md). Landing illustrations remain a design preview; the workspace is the functional application.

## Graph and verification

FalkorDB supplies remembered facts used in the model's next response; it is not just a connection badge or a transcript stored as opaque text. SQLite handles durable execution/transcripts separately. Native semantic mode currently uses the Mac’s English sentence model; unsupported hosts visibly retain wording and graph recall. The [graph explanation](docs/graph-memory.md) shows the Source/Fact/Person/Project model, native vector search, multi-step queries and synthetic paraphrase/relationship checks. A paraphrase can retrieve a bicycle repair fact without shared wording; a lookup in fictional CobaltRelay test data follows Liora → BirchLedger → Noor to an after-lunch preference. Real-model answers cited the source facts and described the indirect relationship accurately.

### The memory graph

```mermaid
flowchart LR
    Fact["Fact · saved statement; optional embedding"] -->|SUPPORTED_BY| Source["Source · original message and conversation ID"]
    Fact -->|ABOUT| Person["Person · named in the fact and source"]
    Fact -->|ABOUT| Project["Project · named in the fact and source"]
    Workspace["PebbleWorkspace · initialization marker; no relationships"]
```

These arrows are the stored edge directions. A fact can link to a person, a project, both or neither; every saved fact keeps its supporting source. Roles such as “leads” or “reviews” remain in the fact's text, rather than becoming invented relationship types.

For each owner chat request, pebble retrieves matching graph facts before generating the answer. The agent can also call `pebble_memory_search`. Retrieval combines wording and local sentence-vector matches, then follows shared Person/Project nodes to related facts, up to three expansion steps by default. Each result carries its original source and, for connected results, its traversal path. The graph therefore changes which context reaches the model; SQLite separately preserves conversation and execution history. A shared entity supplies context, not proof of a new relationship.

This representative query shows one expansion from a matched fact (`$seed0` is its ID):

```cypher
MATCH (seed:Fact {id: $seed0})-[:ABOUT]->(entity)<-[:ABOUT]-(related:Fact)
MATCH (related)-[:SUPPORTED_BY]->(source:Source)
WHERE seed.id <> related.id
RETURN DISTINCT related.text AS fact, entity.name AS connectedThrough,
                source.id AS sourceId, source.text AS sourceText
LIMIT 16
```

**Fictional demo/test data:** Liora, Noor, CobaltRelay and BirchLedger are invented names used in the tests, not real people or projects. Save separately sourced facts saying Liora leads CobaltRelay, Liora coordinates BirchLedger, Noor reviews BirchLedger, and Noor is available after lunch. A CobaltRelay lookup can follow the shared entities Liora → BirchLedger → Noor and surface the review-time preference. Show **Memory → Search saved facts → Connection path** and the original source beside the answer. Explain that Noor's connection to CobaltRelay is indirect: the graph does not assert that Noor reviews CobaltRelay. The existing synthetic graph and agent tests exercise this scenario; a same-conversation answer alone is not proof of graph retrieval.

```sh
bun run typecheck
bun run test:runtime
bun run runtime/memory-real-smoke.ts
bun run build
```

Use an isolated build directory if the preview is running: building over its `.next` can disrupt it. Runtime browser tests require installed sandbox-capable Chromium. The real voice test runs only when local speech tools are available; it generates files silently, never microphone capture or speaker playback. The memory smoke check requires the local database at port 7380 and creates/deletes a uniquely named synthetic graph. It never selects the personal graph.

Checks include isolated model/provider transports and actual local Chromium/FalkorDB. Separate bounded real ChatGPT/Pi checks verified public research, synthetic file actions, graph-grounded answers and the local voice pipeline; temporary test app data and graphs were removed. New BYOK provider inference and a live Gmail account are not claimed without credentials. Older UI scripts that assume disconnected setup must not target a connected owner; see [copy verification guidance](docs/ui-copy.md).

## Assets and project scope

Original SVG/design; Lucide icons (ISC); DM Sans/Manrope (SIL Open Font License) with system/Georgia fallbacks. No paid assets or hosted audio provider are needed. This is a local single-owner application, not a public multi-user service. Follow [project workflow](AGENTS.md) and [UI copy guidance](docs/ui-copy.md).

## AI-assisted development

pebble was developed with AI assistance using OpenAI Codex for implementation, debugging, tests, documentation and research. The repository contains AI-assisted code and writing. Verification results and remaining limitations are described above; AI assistance is not evidence that an untested flow works.
