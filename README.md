# Pebble

A local Next.js + strict TypeScript app using Bun. The original landing page and character playground remain at `/`; the functional workspace starts at `/home`.

## Run locally

```sh
bun install
# Terminal one: one process owns durable storage
bun run runtime
# Terminal two: user-facing app
bun run dev --port 7341
```

Open http://127.0.0.1:7341/home. The owner listens only on `127.0.0.1:7342`. Check ports before launching; never kill unrelated listeners. The local proxy currently allows only `localhost:7341` / `127.0.0.1:7341`. Port 3000 is not used.

## Functional first milestone

- Character onboarding with the same original parameterized SVG, eight colors, eye styles, glasses and expressions. Saved on the Mac in SQLite; browser playground settings are imported only as an initial suggestion.
- Explicit OpenAI BYOK setup and the actual Pi AI official **Sign in with ChatGPT** flow. A new app-specific UUID is persisted for ChatGPT's device ID. Callback port is `localhost:1455`, with manual redirect handling if necessary. Existing Codex credentials, global credential files and environment API keys are never imported.
- Real `@earendil-works/pi-durable@1.2.0` **Harness** in a separate long-running owner process. `pi-ai@1.2.0` provides models; this is not a substitution with pi-agent or plain Pi.
- SQLite transcript and task persistence; committed in-flight partials delivered via SSE, reconnect snapshots, abort, safe same-request retries, and an explicit resume control for interrupted work after setup is reconnected.
- Real FalkorDB adapter: Cloud TLS default, optional explicit self-host settings, bounded health/query checks, parameterized MERGEs, facts linked to conversation sources, Person/Project relationships, inspection and context supplied to chat. Up to 20 source-backed facts are included as untrusted context per turn.
- A persistent source-sync outbox retries idempotent graph writes on reconnection. The transcript stays safe in SQLite if graph sync fails. No pretend graph fallback.
- Local owner token, same-origin proxy checks, bounded browser tools and explicit per-action review; optional integration send permissions require setup.

## Live setup still required

1. Save your character in the workspace.
2. Either authorize a **fresh ChatGPT login** (port1455 must be free), or enter **your own OpenAI API key** and select a model. Saving a key makes no model call. The first successful chat response marks the provider verified. API messages may incur provider charges.
3. Enter your **FalkorDB host, port, graph name, username/password, and TLS setting**. Use TLS for Cloud. Use an existing graph with read/write access, or explicitly select **Initialize this graph for Pebble** to create a workspace node. Health checks are read-only unless you opt into initialization.
4. Open Conversation and send a message yourself.

Provider keys, OAuth tokens and graph secrets currently live **only in owner-process memory**. They are never sent back to the browser after entry, logged, stored in localStorage or written to SQLite. Reconnect after owner restart. Secure persistent secret-vault integration is a later milestone. Character settings, installation UUID, chat, tasks and graph outbox remain under ignored `.pebble/` (directory mode0700; owner token0600). Do not sync or publish that directory.

The UI stays setup-required until the real provider configuration and FalkorDB connection exist. Tests use isolated deterministic model/graph doubles, never a user-facing mock responder. No paid API calls, live authorization or cloud-account provisioning were performed while building.

## Bun compatibility

The published Pi package declares Node>=22.19.0. This Mac has Node22.17.0. Bun1.3.14 cannot import Pi's `node:sqlite` adapter. Instead `runtime/sqlite.ts` implements Pi's supported portable `SqliteDatabase` interface using `bun:sqlite`, serializing async transactions and invalidating expired handles. The actual Harness and the full upstream storage conformance suite pass on Bun. No global Node changes or runtime-manager substitution were made. The upstream package remains experimental and is pinned exactly.

## Checks

```sh
bun run typecheck
bun run build
bun run test:runtime
bun verification/check.mjs
bun verification/hero.mjs
bun verification/workspace.mjs
bun verification/integrations.mjs
bun verification/browser-panel.mjs
```

Runtime tests exercise actual durable storage, streaming partial commits, reopen/history, idempotency, setup gating, HTTP/SSE auth, fresh-device OAuth orchestration and graph protocol/health behavior. Model and graph doubles are clearly labeled and isolated under temporary test directories. Browser scripts use the Chromium cached on this Mac; adjust `executablePath` elsewhere. Screenshots are in `verification/`.

## Local browser milestone

Browser control opens a dedicated visible Chromium profile on this Mac. Manual login/takeover, observation, masked screenshot, bounded scrolling and review-gated navigation/click/fill/key/tab operations share the actual Pi Durable loop. No native computer-use API or full desktop control. See [setup, verification and network limitations](docs/browser.md) and [actual adapter contract](docs/browser-provider-contract.md). No live browser model calls or logins were performed.

## Next milestones

Gmail/Discord adapters and the Apps & actions setup/intake/review UI are implemented. Both remain disconnected until explicit user configuration. No live grants, mailbox ingestion, bot sessions or real sends have occurred. Immutable, expiring approvals and durable deduplication protect outbound actions. See [integration setup and limits](docs/integrations.md). Voice, background/proactive work, full memory edit/forget/export and account/multi-user support remain later work. This milestone is local-only and must not be published as a multi-user service.

## Original landing interactions and assets

The original landing customizer, localStorage, section navigation, illustrative conversation tabs, hero gaze/happy click/solid drag, keyboard activation and reduced-motion handling are preserved. The landing's future integrations remain labeled concepts.

Original SVG/design; Lucide icons (ISC). DM Sans/Manrope via Google Fonts (SIL Open Font License), with system/Georgia fallbacks. No paid assets or services.

## Product copy

Follow [UI copy guidelines](docs/ui-copy.md) for user-facing text, consent and connection states.

For copy-only verification of a connected workspace, build a secret-free copy in a separate directory, start it on unused port7351, and run `bun verification/ui-copy.mjs`. The script mocks every API and blocks outside requests. Run `bun test app/home/copy.test.ts` for field validation. The older workspace/integration/browser scripts assume a disconnected test instance and must not be run against a live connected owner.

Model settings and activation: [model/reasoning behavior](docs/model-settings.md). Local database setup and explicit sync step: [local FalkorDB](docs/local-memory.md).

Local checkpoint cadence and focused verification are recorded in [project workflow](AGENTS.md).
