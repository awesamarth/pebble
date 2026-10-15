# Private workspace actions

`runtime/workspace-tools.ts` exports `workspaceExtension(host)` and `workspaceToolNames`. Install this extension only in the private web workspace agent. Discord/channel agents must exclude it: its memory and incoming-message results can contain private information.

The host supplies asynchronous callbacks `searchMemory(query)`, `remember({text, sourceId, person?, project?})`, `listIncoming()` (an array of saved events), and `createDraft(OutboundDraft)`, plus synchronous `canRemember()`. The host must derive memory-write authorization from the current actual human request, validate source ownership, and keep that authority outside model arguments. A retrieved source cannot authorize a write. The host should bound memory search results and validate account/destination/scope through the existing integration service.

Incoming reads are capped at 20 events and 4,000 text characters per event. External text is marked untrusted. Draft tools accept only Gmail/Discord and call the existing proposal/approval path; they expose no send callback. A draft terminates the turn for review. Actual sending remains in the user approval flow. Unsafe write/proposal tools are not automatically replayable. Errors do not expose adapter internals or credentials.
