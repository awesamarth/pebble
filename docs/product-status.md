# Product implementation status

This audit distinguishes source implementation, isolated verification and live account evidence. Code presence is not proof of a successful provider exchange. The approved landing page is unchanged.

| Area | Implemented | Remaining / evidence limit |
| --- | --- | --- |
| Private web chat | Pi Durable Harness, selected model/reasoning, streaming, local history, graph recall and explicit sourced fact saving | Synthetic provider/graph checks pass. A live model exchange is not asserted by this audit. |
| Discord | Owner mentions in selected bot/server/channel scope, same Harness, isolated conversation and scoped memory, ordinary direct reply, durable deduplication | Synthetic full Engine/Gateway/model/send path passes. User must connect model and updated Discord setup; no live send performed by this implementation work. |
| Gmail | OAuth PKCE, signed push intake, manual incremental sync, on-demand mailbox search/read in private agent and UI, review-only drafts/sends | User OAuth client/grant and public authenticated push infrastructure are still needed. No live mailbox or delivery proof. Metadata/full-text choice respected; on-demand reads do not import sources. |
| Browser | Dedicated sandboxed hidden Chromium, bounded text/image observations, explicit mutation reviews, manual window handoff | Handoff reloads tabs and may reset forms. Screenshot is not interactive remote desktop. No autonomous unreviewed navigation/action path. |
| Chat images | Two bounded PNG/JPEG/WebP attachments, previews/removal, typed Harness image input, capability gate, durable transcript | Isolated fake-provider test verifies transport/history, not real visual understanding. No image generation. Image bytes excluded from graph memory. |
| Voice calling | Landing concept only | No microphone capture, audio/realtime transport, speech pipeline or call UI. Needs a separate implementation with explicit microphone consent and an agreed provider path. |
| Customization | Name, colors, eyes, glasses, expression, live SVG previews, local persistence | Local functional/UI checks; no generated mascot assets required. |
| Approvals | Exact account/destination/body binding, expiring one-use actions, uncertain sends never auto-retry | Synthetic provider checks; no live consequential actions exercised here. |
| Editable memory | Sourced facts, person/project tags, private search and owner-scoped Discord facts | No graphical editor or fact edit/delete UI yet. |
| Background work | Long-running owner, Discord intake and Gmail event handling, hidden browser while agent turn runs | No general scheduled task runner, autonomous planning queue or voice background-call engine. |

## Activation and account setup

Keep the existing preview and user form intact. Runtime changes require a coordinated owner restart, which clears session-only model/Gmail/memory configuration; do not restart repeatedly during user setup. Discord Keychain reconnection follows the user's saved opt-in and scope. Reconnect the model and memory after activation. Use the exact [Gmail OAuth and Pub/Sub steps](gmail-setup.md); manual checking needs no public ingress.

Do not interpret an OAuth grant, Gateway connection, successful watch or localhost HTTP 200 as live end-to-end success. Final confirmation is an owner message yielding the intended response/intake through the connected account.
