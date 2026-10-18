# Local hands-free voice alpha

Open Conversation → Voice call. Opening the panel checks dependencies without microphone access. **Start call** explicitly requests microphone consent and keeps capture active until **End call** or navigation. Sustained speech starts a turn; roughly 1.1 seconds of quiet finalizes it, or **Send now** can finalize it manually. Idle capture is recycled locally and never transcribed. A spoken turn is bounded to approximately 30 seconds including the short detection buffer.

Recognition uses local batch Whisper after each pause, so there is a transcription delay before the ordinary Pi conversation begins. This is a hands-free alpha using batch STT and generated speech, not true streaming speech-to-speech. The existing selected model, conversation, tools and permissions are reused. Recognized text is saved in chat and sent to that model as normal. Microphone audio and generated WAV files are processed on this Mac; request files are temporary and browser Blob URLs are released after playback or cancellation.

## Completed message contract

Installed `@earendil-works/pi-durable` 1.2.0 emits `message_end` when an entry is appended (see its installed `dist/harness/events.js`). Engine.accept reads these committed `ConversationView.entries[].model` messages into `RuntimeView.messages`, using stable `root:entry:index` IDs and only text blocks. The existing watch/SSE view updates during tool work. Voice consumes newly committed assistant IDs from this view while busy, including pre-tool commentary and a later answer; it never consumes `partial`, reasoning or tool results. No sentence splitting or speculative provider `text_end` event is used.

At Start, all existing IDs become the baseline. Each new ID is consumed once, so duplicate SSE snapshots and reconnects do not replay history. Failed and empty entries are skipped. macOS `say` generates each completed message as a WAV, and the browser plays the messages automatically in order. Speech remains bounded to 3,000 characters / 90 seconds per message; full text stays in chat. One later completed message is synthesized ahead while the current message plays, so preparation can overlap playback. Only one synthesis request runs at a time; cancellation clears both current playback and that prefetched message.

Microphone energy detection remains active during playback and model work. Sustained speech stops the current audio, cancels pending synthesis, drops queued audio, and requests the current conversation to abort. Output arriving from that interrupted turn is suppressed through the next send baseline. The new recording waits for the abort request before transcription/send. A stale synthesis response cannot play after cancellation. End/unmount stops capture, closes the AudioContext, aborts requests, releases Blob URLs and asks an outstanding model turn to stop. If a send confirms after End, it also requests abort. End cannot undo completed tool actions.

The energy detector is intentionally simple: use headphones, a quiet space, and keep the call tab active. Speaker echo, soft speech, background noise, and browser background throttling need real acoustic testing. It is not a semantic speech detector. Permission denial, processing failures and blocked autoplay show a paused/error state; **Resume call** resumes listening without replaying consumed messages. End and Start allow a fresh permission attempt. A failed send is not automatically repeated because acceptance may be uncertain.

## Install on a fresh Mac

Voice is optional; text chat, graph memory and browser tools do not need these audio dependencies. The recipe below uses upstream whisper.cpp **v1.9.4**, matching the implementation's tested API. It was checked against the runtime and upstream build options, but has **not** been executed on a fresh Mac. Other Whisper releases, Intel Macs and different macOS versions may need compatibility work.

First install Apple's [Command Line Tools](https://developer.apple.com/xcode/resources/) with `xcode-select --install` and complete the system dialog. Check `xcrun --find clang++` and `xcrun --find swiftc`. Install [Homebrew](https://brew.sh/) if needed, then [CMake](https://formulae.brew.sh/formula/cmake) and [FFmpeg](https://formulae.brew.sh/formula/ffmpeg):

```sh
brew install cmake ffmpeg
```

From the pebble repository root, build the optional tools **outside the checkout**. The model download needs internet and approximately 466 MiB for `small`, plus source/build space. Nothing here grants folder access to the assistant.

```sh
pebble_repo="$PWD"
pebble_voice_root="$HOME/.local/share/pebble-voice"
mkdir -p "$pebble_voice_root"
git clone --branch v1.9.4 --depth 1 https://github.com/ggml-org/whisper.cpp.git "$pebble_voice_root/whisper.cpp-1.9.4"
cd "$pebble_voice_root/whisper.cpp-1.9.4"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=OFF -DGGML_OPENMP=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
cmake --build build --config Release -j 4
sh ./models/download-ggml-model.sh small
cd "$pebble_repo"
```

This clone command expects a new destination; reuse an existing v1.9.4 checkout rather than cloning over it. The CPU/static build is intentional: pebble's warm recognition helper links `build/examples/libcommon.a`, `build/src/libwhisper.a` and the three `build/ggml/src/libggml*.a` libraries directly with Apple's Accelerate framework. Keep this source/build layout and disable OpenMP to avoid an extra OpenMP linker dependency. The helper uses CPU inference; this recipe makes no Metal/Core ML acceleration claim. See the official [Whisper quick start](https://github.com/ggml-org/whisper.cpp/tree/v1.9.4#quick-start), [build options](https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/CMakeLists.txt) and [model downloader](https://github.com/ggml-org/whisper.cpp/blob/v1.9.4/models/download-ggml-model.sh).

In the terminal that will run pebble's owner, from the pebble repository root:

```sh
export PEBBLE_WHISPER_BIN="$HOME/.local/share/pebble-voice/whisper.cpp-1.9.4/build/bin/whisper-cli"
export PEBBLE_WHISPER_MODEL="$HOME/.local/share/pebble-voice/whisper.cpp-1.9.4/models/ggml-small.bin"
export PEBBLE_FFMPEG_BIN="$(command -v ffmpeg)"
test -x "$PEBBLE_WHISPER_BIN" && test -r "$PEBBLE_WHISPER_MODEL" && test -x "$PEBBLE_FFMPEG_BIN" && test -x /usr/bin/say
bun run runtime
```

Export these variables again whenever opening a new runtime terminal, or store them in your own local shell configuration. They are filesystem paths, not API keys. The explicit FFmpeg path works with either Apple Silicon or Intel Homebrew prefixes. Runtime defaults still reference the development machine's older paths; **set all three overrides** for this independent installation. No sibling repository is required.

Start the frontend separately as described in the [README](../README.md#run-locally). Open Conversation → Voice call: the dependency check must succeed before Start call. Starting asks for microphone permission; headphones and a quiet room are recommended. macOS `/usr/bin/say` and an installed system voice provide speech output. No paid audio API or automatic runtime download is used. Installing these tools alone does not verify microphone capture, speaker playback or latency.

Owner-authenticated status/transcribe/speech endpoints retain upload bounds, forced demuxers, cancellation, single-operation exclusion, subprocess timeouts and temporary-file cleanup. Empty synthesized audio is rejected explicitly.

## Persistent local recognition

The development-machine whisper.cpp 1.9.4 build used CPU static libraries with `GGML_METAL=OFF`. The independent recipe above follows that compatibility path. Removing `-ng` cannot enable an absent GPU backend.

On the first transcription, pebble compiles its small `runtime/voice-whisper-worker.cpp` helper with the installed `/usr/bin/clang++`, linking those existing libraries into a private temporary directory. It uses a stdin/stdout pipe, with no sockets, network service or microphone access. One model remains loaded across successful utterances; inference uses up to four CPU threads and `no_context=true`, preserving automatic language detection without carrying the previous utterance into a new transcript. The helper is owned by the voice runtime and exits on runtime close. Cancelling an in-flight transcription kills it; the next turn starts a fresh model process using the already built helper. End while idle retains the warm model until runtime shutdown. Temporary source audio is still removed after each request.

The running app performs no dependency downloads or package installs. If the local compiler/static libraries are unavailable, compilation falls back to the existing CLI for that runtime lifetime. First use includes compile/load overhead; interruption requires reloading the model but not recompiling. Generated executables stay outside Git and are removed on orderly close. A crash can leave a temporary build directory for ordinary OS temporary-directory cleanup.

A same-audio synthetic benchmark on this Mac measured the previous two-thread CLI path at **6,526 / 6,099 / 6,324 ms** per turn (mean 6,316 ms). The persistent four-thread path measured **6,331 ms** on first use including compile/load, then **3,496 / 3,875 / 3,478 ms** (warm mean 3,616 ms, about 43% lower). All runs transcribed the same generated sentence, “The lantern project starts on Monday.” These are local transcription timings, not end-to-end call latency; they combine model reuse and the thread-count change and do not establish a general speedup for arbitrary speech or machine load. The default macOS TTS voice, batch STT, silence timeout, selected Pi model and durable message boundaries remain the same.

## Verification and owner check

Focused Bun tests cover history baselining, completion order, reconnect deduplication, interrupted-turn suppression, failed/empty messages, noise rejection and silence finalization. Existing real local macOS speech → WAV → Whisper synthetic round-trip, warmed reuse, active cancellation and subsequent worker recovery tests passed outside the sandbox (the sandbox itself produces an empty `say` file). TypeScript passes with incremental output disabled to avoid changing the live preview's files.

An isolated headless Chrome fixture with mocked capture, energy, playback and endpoints passed: no microphone before Start; automatic silence finalization; commentary playback while busy; ordered later answer; next-message synthesis requested before current playback ends; interruption/abort; stale queue suppression; cancellation during delayed synthesis; End track cleanup; restart without history replay; zero browser page errors. No owner tabs, live model calls, real microphone or speaker playback were used.

Remaining owner test: in the running app, explicitly Start call and grant the microphone; with headphones say a short question, pause, and verify recognition and automatic audible reply. Ask a question requiring a tool and verify commentary then answer. Speak during playback and during tool work; verify old audio stops and the new utterance is recognized. End and confirm the browser microphone indicator disappears. Repeat once with speakers to assess echo. Measure the actual pause-to-transcript and transcript-to-first-audio delay; no realtime latency claim is made yet. New voice environment settings take effect when the runtime starts. Before restarting an existing workspace, account for any session-only connections; a restart may require sign-in again. These checks do not establish performance on a fresh installation.
