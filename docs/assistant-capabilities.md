# Assistant execution and audience boundaries

The private web assistant can work through planning, writing, coding, reasoning and daily tasks, using saved memory, selected incoming messages, connected Gmail search/read and the dedicated browser when enabled. Tool results determine what completed; missing connections and unavailable capabilities must be reported honestly. Routine reads and normal replies do not create approvals. Outgoing sends still create exact reviewable drafts. Browser mutation review and manual credential entry remain unchanged.

## Natural sourced memory

There is no `Remember` prefix requirement. The assistant can save a useful durable preference or fact stated by the current owner. The host binds a web tool write to the active current user message, or a Discord write to the authenticated intake source and its bot/server/channel/owner scope. Assistant replies, older sources and model-selected source IDs cannot substitute for that source.

The assistant should extract a concise fact using the owner's own wording. The host rejects unsupported content words, common credential/secret patterns, opt-out phrases, imported quote/code/tag blocks and instruction-like facts. These checks constrain storage; they are not a guarantee that heuristic secret detection recognizes every possible sensitive string. Do not derive owner facts from email, linked material or quoted third-party statements. Saved facts retain actual source text and remain inspectable/editable/removable in Memory. Fact saving is model-driven, so not every eligible statement is automatically extracted. New unrelated preferences must not silently overwrite old facts.

## Authenticated owner Discord tools

The existing host intake still requires the configured owner, selected guild/channel, bot mention and permitted sending scope. Each reply receives a fresh conversation with an expiring host binding. Available tools search that exact channel's memory, save a grounded current-owner fact, inspect bounded same-channel history, or start private work. Scope checks happen in the graph query and again before returning results. A missing, released or aborted conversation binding cannot execute a channel tool or start another provider request.

Private web memory, mail, other channels and browser tools never enter the channel-facing tool set. Shared replies receive only private-work receipts (`id`, `state`), never private task bodies/results. Ordinary same-channel replies use the existing host send path and duplicate suppression without an additional per-message approval.

## Actual bounded background work

The private web `pebble_task_start` tool and Discord `pebble_private_task` tool enqueue the original owner request unchanged. The model cannot replace its directions, source or destination. A serial SQLite-backed queue permits five outstanding tasks, with a two-minute execution limit per task. A separate private Harness conversation can search private memory, inspect selected incoming messages, search/read Gmail and prepare review-only drafts. Its registered tool names are distinct from channel tools; it cannot recursively create tasks or save imported facts.

Results and original requests are stored locally and exposed only through owner-authenticated `GET /work`, the existing same-origin local proxy, and the Private work panel under Apps & actions. The private web assistant can also read task results. Private results are not automatically sent back to Discord; there is no direct-message delivery integration. The owner can explicitly review a proposed outgoing message through the existing approval flow.

Interrupted queued/running tasks become `unknown`; they do not replay automatically on startup. Active private-conversation bindings guard both tool execution and provider request preparation, so durable recovery cannot regain access after a binding is gone. Provider sign-out interrupts pending work. Errors are sanitized and uncertain actions are not retried. Existing immutable draft approval rules remain in force. This is a bounded executor, not a recurring scheduler, autonomous future monitor, voice engine, shell agent or general desktop controller.

## Evidence and activation

Focused synthetic checks use the actual Pi Durable Harness and fake model/graph/Gateway adapters. They verify natural web memory, rejected source forgery, actual Discord tool execution, source provenance, scope defense, durable task handling and exclusion of private results from channel context/sends. UI verification intercepts every API call and checks result states, escaped text and mobile layout. These checks do not claim a live model, mailbox or bot exchange.

This source change must be activated by a coordinated runtime restart. Preserve the existing session and accounts until the owner approves activation. Do not push or restart as part of this implementation checkpoint.
