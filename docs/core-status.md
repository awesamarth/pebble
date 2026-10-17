# Core app implementation audit

## Context and memory

The installed Pi Durable harness (1.2.0) enables automatic compaction by default. Its current defaults reserve 16,384 tokens, keep 20,000 recent tokens, and begin background compaction with 32,768 tokens of headroom. The engine uses these defaults. Summaries are appended as compaction entries; earlier original entries remain in durable storage. Provider conversation identity survives compaction and reopening. Context-overflow recovery compacts and retries once.

The harness exposes compaction progress/failure and a manual compact operation, but pebble currently does not expose them in its UI or HTTP API. Graph memory is separate, sourced long-term memory; it is not a substitute for context compaction.

## Saved sources and incoming feed

The core Markdown renderer recognizes saved source references and opens an authenticated source inspector. It shows saved plain text on demand, with identifiers in expandable details. Missing sources and disconnected memory have explicit errors. Code and ordinary links remain unchanged.

The incoming feed currently lists imported external messages. Discord ignores bot-authored incoming events; successful own replies are recorded separately in its delivery receipts and graph sources. The web conversation is a separate conversation. The feed therefore does not mirror both sides of Discord conversations. No Discord behavior or saved setup was changed in this milestone.

## Voice

Current code has no microphone capture, audio playback/session transport, WebRTC or realtime voice implementation. The landing-page call preview is a product concept. Ordinary chat model selection explicitly excludes audio, transcription and realtime models.

The next concrete dependency is a selected audio-capable provider/authentication path and transport, followed by an explicit microphone-permission flow, capture/playback UI, session cancellation and a bridge to existing owner tools and memory. The existing ChatGPT text OAuth integration does not implement audio transport. Phone and SMS are outside scope.

## Email verification boundary

Search/read, summarize and draft chat handoffs, reviewed draft actions, Gmail watch/history intake, signed push and local Pub/Sub pull are implemented. Local pull avoids requiring a publicly hosted webhook. Google project/OAuth and Pub/Sub setup are still required; see gmail-setup.md. Integration tests use isolated transports. No real mailbox connection, delivery or send is claimed without owner configuration and live verification.
