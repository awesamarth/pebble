# Local hands-free voice alpha

Open Conversation → Voice call. Opening the panel checks dependencies without microphone access. **Start call** explicitly requests microphone consent and keeps capture active until **End call** or navigation. Sustained speech starts a turn; roughly 1.1 seconds of quiet finalizes it, or **Send now** can finalize it manually. Idle capture is recycled locally and never transcribed. A spoken turn is bounded to approximately 30 seconds including the short detection buffer.

Recognition uses local batch Whisper after each pause, so there is a transcription delay before the ordinary Pi conversation begins. This is a hands-free alpha using batch STT and generated speech, not true streaming speech-to-speech. The existing selected model, conversation, tools and permissions are reused. Recognized text is saved in chat and sent to that model as normal. Microphone audio and generated WAV files are processed on this Mac; request files are temporary and browser Blob URLs are released after playback or cancellation.

## Completed message contract

Installed `@earendil-works/pi-durable` 1.2.0 emits `message_end` when an entry is appended (see its installed `dist/harness/events.js`). Engine.accept reads these committed `ConversationView.entries[].model` messages into `RuntimeView.messages`, using stable `root:entry:index` IDs and only text blocks. The existing watch/SSE view updates during tool work. Voice consumes newly committed assistant IDs from this view while busy, including pre-tool commentary and a later answer; it never consumes `partial`, reasoning or tool results. No sentence splitting or speculative provider `text_end` event is used.

At Start, all existing IDs become the baseline. Each new ID is consumed once, so duplicate SSE snapshots and reconnects do not replay history. Failed and empty entries are skipped. macOS `say` generates each completed message as a WAV, and the browser plays the messages automatically in order. Speech remains bounded to 3,000 characters / 90 seconds per message; full text stays in chat.

Microphone energy detection remains active during playback and model work. Sustained speech stops the current audio, cancels pending synthesis, drops queued audio, and requests the current conversation to abort. Output arriving from that interrupted turn is suppressed through the next send baseline. The new recording waits for the abort request before transcription/send. A stale synthesis response cannot play after cancellation. End/unmount stops capture, closes the AudioContext, aborts requests, releases Blob URLs and asks an outstanding model turn to stop. If a send confirms after End, it also requests abort. End cannot undo completed tool actions.

The energy detector is intentionally simple: use headphones, a quiet space, and keep the call tab active. Speaker echo, soft speech, background noise, and browser background throttling need real acoustic testing. It is not a semantic speech detector. Permission denial, processing failures and blocked autoplay show a paused/error state; **Resume call** resumes listening without replaying consumed messages. End and Start allow a fresh permission attempt. A failed send is not automatically repeated because acceptance may be uncertain.

## Local dependencies

The runtime reads these existing tools without modifying them:

- `../x402-media-studio/.runtime/whisper.cpp-1.9.4/build/bin/whisper-cli`
- `../x402-media-studio/.runtime/models/ggml-small.bin`
- `/usr/local/bin/ffmpeg`
- `/usr/bin/say`

Existing overrides are `PEBBLE_WHISPER_BIN`, `PEBBLE_WHISPER_MODEL`, and `PEBBLE_FFMPEG_BIN`. No downloads, new paid audio services, keys, or provider changes are introduced. Owner-authenticated status/transcribe/speech endpoints retain upload bounds, forced demuxers, cancellation, single-operation exclusion, subprocess timeouts and temporary-file cleanup. Empty synthesized audio is rejected explicitly.

## Verification and owner check

Focused Bun tests cover history baselining, completion order, reconnect deduplication, interrupted-turn suppression, failed/empty messages, noise rejection and silence finalization. Existing real local macOS speech → WAV → Whisper synthetic round-trip and cancellation tests passed outside the sandbox (the sandbox itself produces an empty `say` file). TypeScript passes with incremental output disabled to avoid changing the live preview's files.

An isolated headless Chrome fixture with mocked capture, energy, playback and endpoints passed: no microphone before Start; automatic silence finalization; commentary playback while busy; ordered later answer; interruption/abort; stale queue suppression; cancellation during delayed synthesis; End track cleanup; restart without history replay; zero browser page errors. No owner tabs, live model calls, real microphone or speaker playback were used.

Remaining owner test: in the running app, explicitly Start call and grant the microphone; with headphones say a short question, pause, and verify recognition and automatic audible reply. Ask a question requiring a tool and verify commentary then answer. Speak during playback and during tool work; verify old audio stops and the new utterance is recognized. End and confirm the browser microphone indicator disappears. Repeat once with speakers to assess echo. Measure the actual pause-to-transcript and transcript-to-first-audio delay; no realtime latency claim is made yet. The running owner service was not restarted, so deployment of any runtime speech change still requires the normal coordinated restart.
