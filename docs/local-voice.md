# Local turn-based voice

Open Conversation → Voice call at http://127.0.0.1:7341/home. The panel checks tool availability without requesting a microphone. **Record a turn** explicitly requests browser microphone consent. **Stop & send** transcribes locally and submits recognized text through the existing chat endpoint. At 30 seconds, recording stops and sends automatically; the panel explains this before recording.

The existing Pi owner conversation, selected ChatGPT/BYOK model, tools, access scopes and sourced memory handle the turn. It is not a separate voice agent. The recognized text and written answer persist in ordinary conversation history. Raw recordings and generated reply audio do not enter FalkorDB or conversation storage. Text goes to the selected AI provider as with normal chat; raw audio is handled on this Mac.

Reply speech is generated silently into a temporary file with macOS `say`, converted to WAV, then held as a browser Blob. It plays only through the visible audio controls after user action. **End call** cancels recording/requests, releases microphone tracks and discards audio; during the model turn it also asks the existing conversation to stop. Navigating away releases microphone/request/audio resources. If browser permission resolves after End call, those tracks are immediately stopped rather than recorded. Ending the call cannot undo a previously completed tool action.

This is turn-based voice, not a continuous interruptible realtime call, phone/SMS integration or background listening. Current capture supports WebM/Ogg browsers such as Chrome/Brave. Whisper language detection is automatic; actual verification covered English. Speech uses the Mac's installed default voice. Spoken answers are bounded to 3,000 characters / 90 seconds; full text remains in chat. No new cloud audio provider or subscription is used.

## Local dependencies

The runtime reuses the sibling Media Studio installation read-only:

- `../x402-media-studio/.runtime/whisper.cpp-1.9.4/build/bin/whisper-cli`
- `../x402-media-studio/.runtime/models/ggml-small.bin`
- `/usr/local/bin/ffmpeg`
- `/usr/bin/say`

Operators may set `PEBBLE_WHISPER_BIN`, `PEBBLE_WHISPER_MODEL` and `PEBBLE_FFMPEG_BIN` before starting the runtime when these tools are elsewhere. No model download/install runs automatically. Media Studio files, environment and services are not modified. Only its binary/model are read.

Owner-authenticated endpoints: GET `/voice/status`, POST `/voice/transcribe`, POST `/voice/speech`, proxied through the existing same-origin local route. Audio uploads are bounded; only forced WebM/Ogg/WAV demuxers are accepted. Conversion limits recordings to 30 seconds; Whisper uses two CPU threads with GPU disabled. Requests are cancellable, single-operation and time-limited, with temporary per-request directories removed on completion/failure. Raw subprocess errors are not returned. Digital silence is rejected before inference.

## Verification and remaining check

Actual local macOS speech → WAV → Whisper recognized a synthetic sentence. Actual synthetic spoken question → Whisper → saved ChatGPT/Pi turn → reply WAV completed, and both text messages remained after Engine reopen. These checks used disposable app/graph storage, no private data, no microphone and no speaker playback.

Headless Chrome with fake media devices and intercepted endpoints verified no microphone request before Record, permission denial, recording/stop/transcription/chat/reply states, zero autoplay, track cleanup, late permission resolution after End, cancellation, desktop/mobile layout and zero page errors. HTTP tests verify owner authentication and upload bounds. A real microphone/acoustic quality test and user-initiated playback remain for the owner; they were intentionally not performed while the owner slept.
