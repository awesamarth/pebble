# Gmail and Discord milestone

Open http://127.0.0.1:7341/home and select **Apps & actions**. The Connections, Incoming, and Review & send views use the real owner API. Accounts require user-managed connection. Gmail intake is read-only unless optional sending is enabled. Connecting Discord for owner mentions enables ordinary conversational replies in the selected scope.

## Gmail setup the user must perform

Start with the [minimal local Gmail guide](gmail-setup.md): manual **Check new changes** needs no Pub/Sub or public endpoint. Advanced push setup below is optional.

1. In your own Google Cloud project, enable Gmail API and configure the OAuth consent screen/test user as appropriate. Create a web OAuth client. Register this exact redirect:
   `http://127.0.0.1:7341/api/integrations/gmail/callback`.
2. Enter that client ID and secret in pebble. Credentials are session-only; reconnect after owner restart. Choose permission to save new inbox emails before authorizing. Metadata is the default; full bodies are a separate opt-in. Optional sending requests `gmail.send`; default OAuth scope is `gmail.readonly`.
3. Choose **Save Gmail setup**, **Get Google sign-in link**, then **Continue to Google** and grant permissions yourself. Pebble does not reuse external app credentials.
4. For push, create a Pub/Sub topic in the same Google Cloud project and grant publisher permission to `gmail-api-push@system.gserviceaccount.com`. Supply the full topic and subscription names.
5. Set up authenticated Pub/Sub push with your service-account identity and expected audience. The HTTPS destination must forward to `/api/integrations/gmail/push`. This preview is local-only; no public endpoint, tunnel, cloud IAM change or subscription was created by Codex. Arrange and authorize that exposure yourself before expecting push delivery.
6. Enter the push service-account email, audience and subscription name. Choose **Turn on email updates** after setup. The callback and push paths are separate.

Watch renewal runs while this owner session is active, with bounded backoff and an explicit manual-retry state. Tokens/configuration are session-only; after restart, reconnect. Message/history IDs and account-scoped cursors persist. If Gmail returns a history404, the UI asks before skipping the inaccessible gap and resuming from now; there is no automatic whole-mailbox import. **Check new changes** can verify incremental sync without public push delivery. Disconnect attempts `users.stop` and then clears local credentials; revoke the Google grant in Google account settings if desired.

Push verification checks Google RS256 signature/JWKS, issuer, audience, expiry, service-account email/email_verified, expected subscription and connected mailbox identity before intake. Delivery IDs and Gmail message IDs are durably deduplicated. Metadata mode strips snippets/body. Public ingress never exposes the owner token. Development incoming-request logging is disabled to avoid logging OAuth callback codes.

## Discord setup the user must perform

1. Create an application/bot in Discord Developer Portal. Enter its application ID for an invite link. Copy its token yourself into the local app.
2. Invite it to your server with View Channel and Send Messages. No Administrator permission is requested.
3. Enter your own Discord user ID and exact server/channel IDs. **Connect Discord** authorizes saving messages in that scope and replying to your direct bot mentions there. There is no separate ordinary-reply toggle or approval for each reply. Older read-only setups remain read-only until this updated Connect action is used.
4. Mentions-only capture is the default. DMs, webhooks and bots are ignored. Only the configured owner’s actual bot mentions can start model work, even if broader capture is selected. Message Content is optional and must also be enabled in the Discord portal when required.
5. Connect your model in pebble. Each reply uses the same Pi Durable Harness and selected model/reasoning settings, but a separate conversation with only that owner’s same-bot/server/channel history and scoped memory. Private web chat, mail and other channels are excluded. Channel-facing agents can use scoped memory/history tools and hand off the original owner request to private work. They have no browser, private-memory-search or outbound-action tools. Private work returns only a receipt to the channel; results stay in the owner app.

Ordinary conversational replies go directly to the originating channel. Consequential or out-of-scope actions must move to the private app and its review flow. Messages are deduplicated durably. At most five replies are queued, one generation runs at a time, and uncertain delivery is never retried automatically. After interruption, send a new message rather than expecting queued work to replay. Connection changes cancel unfinished generation.

Bot tokens stay in memory unless you explicitly choose macOS Keychain storage. The separate automatic-reconnect option restores only your saved scope. Tokens are never returned in status, logged or stored in SQLite. Disconnect stops the bot; Forget saved token removes its Keychain entry. Other platforms do not claim secure token storage support.

## Outbound review behavior

A draft creates an immutable record containing provider, account, exact destination, subject/body and scope. Drafting never sends. Each review expires after15minutes. **Approve & send** must be clicked for that exact record. The digest binds approval to its immutable details, and the owner atomically consumes it before the adapter can make an outbound request. Rejection, expiry and concurrent duplicate execution are blocked.

Discord verifies the destination's guild and uses a stable nonce with `enforce_nonce`, plus `allowed_mentions: {parse: []}`. Gmail uses a stable Message-ID; Gmail does not promise exactly-once delivery from that header. Any ambiguous exception or owner crash during execution becomes **unknown** with no automatic resend. Inspect the destination before drafting again. Provider receipts are stored when confirmed. These records persist; credentials do not.

Private web chat can search saved memory, inspect recent incoming messages, and prepare exact Gmail/Discord drafts for review. These tools cannot send directly. Memory writes can naturally extract durable facts from the current owner message without a Remember prefix, with source binding, source-word grounding, secret/opt-out rejection and inspectable provenance. Incoming content remains untrusted source material and never grants permission. Discord ordinary replies follow the separate owner-scoped conversation path above. Both surfaces can start bounded private tasks; see [assistant capabilities](assistant-capabilities.md).

## Verification limits

The suite uses clearly isolated Gmail fetch/JWT-verifier and Discord socket/fetch doubles. It tests OAuth state/PKCE/consent, signed-identity policy, account cursor/replay behavior, renewal/refresh, Gateway reconnection/scopes, durable intake/source outboxes and one-use exact-payload approvals. These checks use no real account grants, Gateway sessions, model calls or sends. Live end-to-end conversational verification remains pending user-managed connection and runtime activation.

Official references: [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push), [Pub/Sub push authentication](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions), [Discord Gateway](https://docs.discord.com/developers/events/gateway), [Discord messages](https://docs.discord.com/developers/resources/message).
