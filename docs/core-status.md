# Core app implementation audit

## Context and memory

The installed Pi Durable harness (1.2.0) enables automatic compaction by default. Its current defaults reserve 16,384 tokens, keep 20,000 recent tokens, and begin background compaction with 32,768 tokens of headroom. The engine uses these defaults. Summaries are appended as compaction entries; earlier original entries remain in durable storage. Provider conversation identity survives compaction and reopening. Context-overflow recovery compacts and retries once.

pebble now forwards sanitized compaction progress, retry and failure state through history/events and shows it in the conversation. Raw provider errors, summary prompts and task details are not exposed. The harness also supports a manual compact operation; pebble has no manual compact UI or HTTP action. Graph memory is separate, sourced long-term memory; it is not a substitute for context compaction.

## Saved sources and incoming feed

The core Markdown renderer recognizes saved source references and opens an authenticated source inspector. It shows saved plain text on demand, with identifiers in expandable details. Missing sources and disconnected memory have explicit errors. Code and ordinary links remain unchanged. Sentence punctuation and lowercase source labels are accepted, so references such as Source: 1:7:0. become inspectable buttons.

The incoming feed currently lists imported external messages. Discord ignores bot-authored incoming events; successful own replies are recorded separately in its delivery receipts and graph sources. The web conversation is a separate conversation. The feed therefore does not mirror both sides of Discord conversations. No Discord behavior or saved setup was changed in this milestone.

## Voice

Current code has no microphone capture, audio playback/session transport, WebRTC or realtime voice implementation. The landing-page call preview is a product concept. Ordinary chat model selection explicitly excludes audio, transcription and realtime models.

The next concrete dependency is a selected audio-capable provider/authentication path and transport, followed by an explicit microphone-permission flow, capture/playback UI, session cancellation and a bridge to existing owner tools and memory. The existing ChatGPT text OAuth integration does not implement audio transport. Phone and SMS are outside scope.

## Email verification boundary

Search/read, summarize and draft chat handoffs, reviewed draft actions, Gmail watch/history intake, signed push and local Pub/Sub pull are implemented. Local pull avoids requiring a publicly hosted webhook. Google project/OAuth and Pub/Sub setup are still required; see gmail-setup.md. Integration tests use isolated transports. No real mailbox connection, delivery or send is claimed without owner configuration and live verification.


## Focused continuity verification (2026-10-18)

The real installed Pi harness automatically compacted a synthetic conversation under its default compaction policy (a test model used a smaller context window). App snapshots reported blocking summary progress, and both original user entries remained visible after Engine reopen. This tests the built-in integration rather than adding a second summarizer or changing production thresholds.

A separate actual Engine reopen check used a disposable real FalkorDB graph. The saved passwordless graph configuration reconnected automatically, a Lantern query retrieved the related Mira preference, and exact saved-source lookup still worked. No live account, private data, personal graph or model request was used. The graph and temporary storage were deleted. Headless Chrome with intercepted APIs verified background/blocking/retry/failure messages, source dialog behavior and existing desktop/mobile Markdown safety.

## Smallest calling implementation, pending owner choices

1. Select the audio transport/authentication path supported by the owner's chosen provider. Do not assume the current text OAuth grant includes audio endpoints or introduce a paid provider/key implicitly.
2. Add an explicit in-app start-call action and microphone permission, connection/error/end states, capture, playback and reliable stop/mute cleanup. These browser capabilities do not require a desktop package.
3. Bridge recognized speech into the existing Pi owner conversation and speak the completed response. Reuse its tools, scoped access, sourced memory and durable text history; do not build a parallel agent. External actions keep their existing review controls.
4. Verify permission denial, interrupted capture, end-call cleanup and one public/synthetic tool task before calling it working. Continuous interruption/realtime transport can follow only after the chosen provider path is verified.

No microphone permission has been requested, audio credential stored, paid service added or calling UI claimed functional. The concrete first blocker is the owner's selected audio authentication/provider path; the existing dependencies implement no capture/audio transport.
