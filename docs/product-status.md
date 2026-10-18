# Product implementation status

This audit distinguishes source implementation, isolated verification and live account evidence. Code presence is not proof of a successful provider exchange. The approved landing page is unchanged.

| Area | Implemented | Remaining / evidence limit |
| --- | --- | --- |
| Private web chat | Pi Durable Harness, selected model/reasoning, streaming, local history, graph recall, natural current-owner sourced facts and bounded private tasks | Real three-turn gpt-6-sol + isolated FalkorDB test verified grounded facts, relationship recall and cited use in a subsequent answer. Synthetic graph/conversation removed; personal graph unchanged. |
| Discord | Owner mentions in selected bot/server/channel scope, same Harness, isolated conversation, actual scoped memory/history tools, private work handoff, ordinary direct reply and durable deduplication | Synthetic full Engine/Gateway/model/send path passes. The saved owner-scoped bot connection is operational on the development Mac. Fresh installs need their own setup; delivery/notification regressions use isolated transports. |
| Gmail | OAuth PKCE, signed push intake, manual incremental sync, on-demand mailbox search/read in private agent and UI, review-only drafts/sends | User OAuth setup/grant remains needed. Manual checks need no Pub/Sub; local automatic pull needs a topic/subscription and IAM setup, while hosted push needs authenticated public ingress. No live mailbox or delivery proof. Metadata/full-text choice respected; on-demand reads do not import sources. |
| Browser | Dedicated sandboxed hidden Chromium, bounded text/image observations, explicit mutation reviews, manual window handoff | Handoff reloads tabs and may reset forms. Screenshot is not interactive remote desktop. Anonymous public research supports direct public navigation/link following without repeated review; account mutations retain reviews. Real-model public research checks passed. |
| Chat images | Two bounded PNG/JPEG/WebP attachments, previews/removal, typed Harness image input, capability gate, durable transcript | Isolated fake-provider test verifies transport/history, not real visual understanding. No image generation. Image bytes excluded from graph memory. |
| Voice calling | Local turn-based capture/transcription → existing Pi conversation/tools/memory → local reply speech, explicit Record/Stop/End and user-controlled playback | Real synthetic audio through local Whisper, ChatGPT/Pi and reply WAV passed; text history restored after reopen. Owner microphone/acoustic/playback check remains pending. No continuous realtime/phone integration. See local-voice.md. |
| Customization | Name, colors, eyes, glasses, expression, live SVG previews, local persistence | Local functional/UI checks; no generated mascot assets required. |
| Approvals | Exact account/destination/body binding, expiring one-use actions, uncertain sends never auto-retry | Synthetic provider checks; no live consequential actions exercised here. |
| Editable memory | Sourced relation inspector, bounded search, explicit fact text edit/delete, provenance, person/project links and scoped Discord facts | Relationship-aware recall and correction edge cleanup verified against real FalkorDB. Tags are read-only in this editor; no full-database graph visualization. Actual isolated FalkorDB edit/delete verification passes. |
| Background work | Long-running owner, Discord/Gmail intake and private web/Discord task execution through separate Harness conversations | Bounded serial private task executor (five outstanding, two-minute tasks) with owner-only results; optional requested one-shot Discord reminders and generic private-task completion notices; no recurring scheduler, future monitor or voice background-call engine. |

## Activation and account setup

Keep the existing preview and user form intact. Runtime changes require a coordinated owner update; do not restart repeatedly during user setup. Newly saved model connections use OS credential persistence. Existing legacy session connections require one fresh login/save after adopting it. Gmail configuration remains session-only. Successful passwordless FalkorDB connections restore on restart; database passwords require re-entry. Discord Keychain reconnection follows the user's saved opt-in and scope. Saved passwordless memory reconnects after activation; supported saved provider credentials restore through the app. Use the exact [Gmail OAuth and Pub/Sub steps](gmail-setup.md); manual checking needs no public ingress.

Do not interpret an OAuth grant, Gateway connection, successful watch or localhost HTTP 200 as live end-to-end success. Final confirmation is an owner message yielding the intended response/intake through the connected account.

See [assistant execution and audience boundaries](assistant-capabilities.md) for natural memory, channel tools, private work routing, limits and activation.

BYOK now supports separate OpenAI, Anthropic, Google/Gemini and selected OpenRouter model catalogs, secure per-provider persistence and explicit saved connection selection. See [supported scope and verification](model-providers.md). Live UI/catalog checks are complete; successful paid inference for new providers is not claimed without supplied keys.


Local files now support explicit persistent owner folder grants, actual Pi read/create/edit and bounded discovery/text search, with private-only tools and known sensitive-path/content exclusions. Optional commands run only after exact review in an isolated disposable copy; no network or original-file command writes. See [local access scope and limits](local-files.md). Grants remain empty until the user configures them. Chat Markdown uses Streamdown with local scoped styling, safe links, highlighted/copyable code and contained tables; see [renderer evidence](markdown.md).


Guided Discord onboarding now discovers bot metadata, generates an invite, and binds a verified slash-command account/channel only after local confirmation. Advanced manual settings remain. See [setup boundaries](discord-onboarding.md). Explicit opt-in Discord updates now have durable scheduling, source deduplication, cancellation and guarded actual delivery, with mock end-to-end proof; see [scope and limits](discord-notifications.md). No live unsolicited messages or setup changes were made by verification.

The inconsistent Discord reply bug was a completed-output validator rejecting valid thinking+text responses. The fix accepts completed reasoning metadata but sends only visible text. Actual failed requests had successful model completions with the correct gpt-6-sol identity and no send receipt; simple text-only responses succeeded. No keyword-specific exception or recovery replay was added.
