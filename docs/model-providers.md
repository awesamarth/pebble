# Supported model connections

ChatGPT OAuth is a separate connection from API keys. BYOK supports these installed Pi adapters:

| Connection | SDK provider / API | Compatible choices in this checkout |
| --- | --- | --- |
| ChatGPT sign-in | openai / Responses, account-filtered | Depends on the signed-in account |
| OpenAI API key | openai / Responses, account-filtered after connection | 41 installed chat choices |
| Anthropic API key | anthropic / Messages | 17 installed Claude choices |
| Google AI API key | google / Generative AI | 15 installed Gemini choices |
| OpenRouter API key | openrouter / Completions or Messages | 79 installed tool-compatible family choices |

Counts describe this SDK snapshot, not a promise of account access or quota. Anthropic, Google and OpenRouter use the installed compatibility catalog; inference confirms actual access. OpenAI additionally intersects its authenticated account listing. Catalog errors are explicit and never switch provider/model. No API key is reused for another provider. Choosing a provider in the form does not activate it: select a model/reasoning level and save, or explicitly use a saved connection.

The catalog excludes unsupported realtime/live, audio, transcription, image-generation, classifier/embedding, computer-use and batch routes. OpenRouter is limited to tool-capable Claude, GPT/o-series and Gemini families because this SDK has no general per-model tool-support flag. Custom endpoints, local runtimes, arbitrary model IDs and the SDK's other providers are not implemented in this UI.

## Credentials and routing

The existing project-scoped Keychain `openai` slot is retained for ChatGPT and legacy state. OpenAI API keys use a separate `openai_api` slot; Anthropic, Google and OpenRouter each have their own slot. A legacy OpenAI API key is preserved to the API slot through the application's normal secure-store interface before a ChatGPT sign-in can replace the legacy slot. No token is exported, printed or written to plaintext for this operation. SDK reads and refresh writes route to the correct selected slot; OAuth login writes to its own slot without redirecting active API reads.

Connection and model/reasoning selections persist independently per connection in app.sqlite. Returning to a saved provider is explicit. Signing out deletes only the active connection's credential, preserving other saved credentials and selections. Unsupported IDs and non-OpenAI OAuth are rejected. macOS Keychain is the only implemented persistent credential backend; other platforms do not receive a plaintext fallback.

Private web, scoped Discord and private work all use the selected provider/model. Each model's installed reasoning/image metadata controls the UI and validation; incompatible combinations reject before inference. Existing sourced-memory and audience boundaries apply to all providers. Switching connections interrupts outstanding private/channel work; there is no cross-provider retry or silent fallback.

## Verification

Live local app checks confirmed that the activated `/providers` route loads all four lists, the selector changes the correct key fields/catalogs, ChatGPT remains separate, and desktop/mobile heading spacing is 24px without overflow. These checks blocked all browser writes and did not use real provider keys.

Synthetic actual-Harness tests verify all four provider/key/model routes, model identity, distinct OAuth/API storage, explicit saved selection, restart restoration, isolated sign-out and incompatible-provider rejection. Native adapter serialization checks intercept HTTP for Anthropic, Gemini and OpenRouter and verify the expected endpoints and authentication headers. No live inference success is asserted for providers whose credentials were not supplied.
