# Core app implementation audit

## Context and memory

The installed Pi Durable harness (1.2.0) enables automatic compaction by default. Its current defaults reserve 16,384 tokens, keep 20,000 recent tokens, and begin background compaction with 32,768 tokens of headroom. The engine uses these defaults. Summaries are appended as compaction entries; earlier original entries remain in durable storage. Provider conversation identity survives compaction and reopening. Context-overflow recovery compacts and retries once.

pebble now forwards sanitized compaction progress, retry and failure state through history/events and shows it in the conversation. Raw provider errors, summary prompts and task details are not exposed. The harness also supports a manual compact operation; pebble has no manual compact UI or HTTP action. Graph memory is separate, sourced long-term memory; it is not a substitute for context compaction.

## Saved sources and incoming feed

The core Markdown renderer recognizes saved source references and opens an authenticated source inspector. It shows saved plain text on demand, with identifiers in expandable details. Missing sources and disconnected memory have explicit errors. Code and ordinary links remain unchanged. Sentence punctuation and lowercase source labels are accepted, so references such as Source: 1:7:0. become inspectable buttons.

The incoming feed currently lists imported external messages. Discord ignores bot-authored incoming events; successful own replies are recorded separately in its delivery receipts and graph sources. The web conversation is a separate conversation. The feed therefore does not mirror both sides of Discord conversations. No Discord behavior or saved setup was changed in this milestone.

## Voice

Local turn-based voice is implemented in Conversation → Voice call. Explicit Record requests microphone permission; Stop & send uses local Whisper and submits recognized text into the existing Pi conversation. macOS speech generates a reply file silently; playback requires user action. No external audio provider or new subscription is used. See local-voice.md for tools, limits, verification and the remaining owner microphone/playback check. Phone/SMS and continuous realtime interruption remain outside this implementation.

## Email verification boundary

Search/read, summarize and draft chat handoffs, reviewed draft actions, Gmail watch/history intake, signed push and local Pub/Sub pull are implemented. Local pull avoids requiring a publicly hosted webhook. Google project/OAuth and Pub/Sub setup are still required; see gmail-setup.md. Integration tests use isolated transports. No real mailbox connection, delivery or send is claimed without owner configuration and live verification.


## Focused continuity verification (2026-10-18)

The real installed Pi harness automatically compacted a synthetic conversation under its default compaction policy (a test model used a smaller context window). App snapshots reported blocking summary progress, and both original user entries remained visible after Engine reopen. This tests the built-in integration rather than adding a second summarizer or changing production thresholds.

A separate actual Engine reopen check used a disposable real FalkorDB graph. The saved passwordless graph configuration reconnected automatically, a Lantern query retrieved the related Mira preference, and exact saved-source lookup still worked. No live account, private data, personal graph or model request was used. The graph and temporary storage were deleted. Headless Chrome with intercepted APIs verified background/blocking/retry/failure messages, source dialog behavior and existing desktop/mobile Markdown safety.

## Calling implementation decision

The local path is implemented using the existing read-only Media Studio Whisper binary/model, FFmpeg and macOS speech. It reuses current ChatGPT/BYOK text transport, Pi tools, scoped access, memory and durable history. No assumption of audio support in the current OAuth grant is needed. No paid-provider choice is required for this local implementation. Real browser microphone consent and acoustic/playback verification remain owner actions; automated verification uses synthetic audio and fake media devices only.
