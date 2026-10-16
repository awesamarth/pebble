# Per-request execution identity

## Installed Pi behavior verified

This checkout uses Pi Durable 1.2.0. Its `dist/harness/generation.js` resolves `agent.model` and `agent.thinkingLevel` during `prepare`, renders registered prompt sections with that same resolved agent, and freezes model/thinking level in the request checkpoint. Reasoning is passed separately to the model API (`off` omits the Harness reasoning option). Durable retries return to preparation. `dist/harness/prompt.js` appends positional section changes; prior assistant messages retain their actual provider/model identifiers.

The installed Pi AI OpenAI Responses adapter (`dist/api/openai-responses.js`) clamps supported thinking levels and maps them through `thinkingLevelMap` to the declared reasoning effort. This is execution configuration, not evidence of hidden provider routing or internal thought. No built-in section describing current execution identity was found in the installed Pi Durable/Pi AI request prompt path. Pi's supported section mechanism is reused rather than adding a competing request wrapper or enabling reasoning through prompt text.

## Application section

`runtime/execution-identity.ts` registers one `runtime_execution` prompt section. It reads the resolved per-conversation agent and installed model metadata, never frontend preferences, user text, credentials, account identifiers or bearer tokens. It reports provider, exact configured model ID, requested reasoning, supported/unsupported/not-reported capability, SDK-effective client level and the known OpenAI Responses adapter effort mapping.

`unsupported`, `not_reported`, `not_sent` and explicit `off` are distinct. The text explains that it describes application/request configuration and cannot expose hidden routing or chain-of-thought. It does not configure or enable API reasoning.

The extension is selected for web turns and resume, channel conversations and private task conversations. Settings changes are read by Pi's normal preparation boundary. Retried requests render from their resolved execution settings. Historical assistant identity is not rewritten.

## Recovery guards

Installed Pi catches and reports ordinary prompt-section errors and ordinary hook errors. Throwing alone is not a provider-call gate. Inactive private/channel `beforeRequest` hooks now ask the host to abort the exact numeric conversation ID asynchronously and wait for the invocation's abort signal. They do not await the abort join from inside their own hook. An actual aborted invocation propagates cancellation and cannot reach the provider. If host cancellation cannot complete, the hook stays parked rather than proceeding. Tool callbacks retain their independent active-scope checks.

## Evidence

Synthetic actual-Harness tests compare the trusted section with the provider's resolved model and reasoning options across model switches, a durable retry, resume and current web/Discord/private execution paths. They verify historical response identity, unsupported/not-reported distinctions, no credential inclusion and zero provider requests from inactive private/channel conversations.

Source is implemented and tested; the live runtime remains unchanged until a coordinated authorized restart.
