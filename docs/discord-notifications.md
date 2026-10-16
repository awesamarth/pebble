# Requested Discord updates

This is an actual trigger → durable queue → scoped delivery path, not just a send function. It is off by default. Enable it explicitly in Apps & actions → Discord updates. Only already connected owner/bot/server/channel scopes are eligible; configuration is rechecked again immediately before delivery.

## Reminders

Use the exact reminder form to choose one connected destination, local date/time and exact message. Scheduling authorizes that one message. Or mention the bot in its connected channel: `remind me in 10 minutes to stretch`. The no-argument Pi tool binds the original authenticated owner event, derives delay/text on the host and cannot change destination. Private chat supports `remind me on Discord in 10 minutes to stretch` when exactly one connected destination exists. Relative seconds/minutes/hours/days within one year are supported; other timing forms require clarification or the form. No model invocation is required when a queued reminder becomes due.

SQLite stores pending notifications, the opt-in and a unique source key. While pebble runs, a five-second scanner claims due items sequentially. It waits for the Gateway to connect on startup. Restart preserves pending requests; interrupted sends become unknown and never replay. Transport enforces the current owner/bot/server/channel/send scope and immutable payload with a deterministic Discord nonce and a single-use durable consume callback. Delivery errors are visible. Ambiguous delivery never automatically retries. Turning updates off cancels pending items and aborts active delivery; cancelling a pending reminder prevents its send. There are at most50outstanding requests, a one-year horizon and bounded transport timeouts. A computer asleep or app stopped cannot deliver at the requested moment; pending requests resume when pebble is running and connected.

## Private task completion

When the original human request explicitly asks to be notified when done and updates are enabled, successful private work schedules a generic completion notice. Discord-origin tasks bind the same owner/channel. Private-web requests must explicitly request notification on/in/via Discord and have exactly one connected destination, which is bound when the task starts. A later connection change never redirects its notice. The completion callback receives only the immutable original request, never result text. The channel gets only “Your private task is ready in pebble…”; the result stays in Apps & actions → Private work. Errors in notification scheduling do not erase completed private results.

This release does not choose arbitrary useful updates, monitor future conditions, run recurring reminders, start itself at login or wake a sleeping Mac. Those need separate requested trigger/recurrence rules. There is no automatic permission expansion and no notification setting was enabled on the live account during implementation.

## Evidence

Focused tests exercise fake-clock due processing, explicit opt-in, cancellation, request deduplication, scope revocation, one-use consume, restart recovery and ambiguous delivery. A real Engine + Gateway + Pi tool + SQLite queue test drives a reminder and private-task completion all the way to an intercepted Discord POST, proves distinct nonces/exactly-once behavior, and verifies private result content never reaches the channel. Frontend checks cover exact local-time scheduling, errors, cancellation, default-off state, uncertainty, keyboard focus and mobile layout. No unsolicited live test messages were sent.


## Conversational reply failures

An eligible owner mention whose generation fails now receives one fixed human-readable failure notice if the same configured Discord destination is still connected and permitted. It uses the original event's durable reply claim and deterministic nonce. Thinking-only/empty/incomplete responses count as generation failures; valid thinking+text responses deliver only text. Nonowner/unmentioned events never receive error notices. Normal delivery failures and failure-notice delivery failures never recurse or retry; ambiguous outcomes remain unknown. A confirmed successful reply whose memory source later fails stays recorded as sent.

Sanitized local records in `integrations.sqlite` → `discord_reply_diagnostics` bind source ID, stage, category, exception type, numeric HTTP status when available, elapsed time, delivery consumption and connection state. They retain at most500records and contain no raw error message, prompt, reasoning or credentials. The app also shows the actionable reply issue. Focused mocked tests verify one error notice, ignored/duplicate exclusion, normal-send failure without fallback, failed error notice without recursion, and no raw error leakage. No live failure was induced or external test message sent.
