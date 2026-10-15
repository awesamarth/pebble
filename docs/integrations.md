# Gmail and Discord milestone

Open http://127.0.0.1:7341/home and select **Apps & actions**. The Connections, Incoming, and Review & send views use the real owner API. Accounts are disconnected by default. Neither connector starts model work or sends automatic replies.

## Gmail setup the user must perform

1. In your own Google Cloud project, enable Gmail API and configure the OAuth consent screen/test user as appropriate. Create a web OAuth client. Register this exact redirect:
   `http://127.0.0.1:7341/api/integrations/gmail/callback`.
2. Enter that client ID and secret in Pebble. Credentials stay in runtime memory. Select intake consent before enabling INBOX intake. Metadata is the default; full bodies are a separate opt-in. Optional sending requests `gmail.send`; default OAuth scope is `gmail.readonly`.
3. Choose **Prepare Google authorization**, then **Continue to Google** and grant permissions yourself. Pebble does not reuse external app credentials.
4. For push, create a Pub/Sub topic in the same Google Cloud project and grant publisher permission to `gmail-api-push@system.gserviceaccount.com`. Supply the full topic and subscription names.
5. Set up authenticated Pub/Sub push with your service-account identity and expected audience. The HTTPS destination must forward to `/api/integrations/gmail/push`. This preview is local-only; no public endpoint, tunnel, cloud IAM change or subscription was created by Codex. Arrange and authorize that exposure yourself before expecting push delivery.
6. Enter the push service-account email, audience and subscription name. Choose **Enable / renew INBOX watch** after setup. The callback and push paths are separate.

Watch renewal runs while this owner session is active, with bounded backoff and an explicit manual-retry state. Tokens/configuration are session-only; after restart, reconnect. Message/history IDs and account-scoped cursors persist. If Gmail returns a history404, the UI asks before skipping the inaccessible gap and resuming from now; there is no automatic whole-mailbox import. **Check new changes** can verify incremental sync without public push delivery. Disconnect attempts `users.stop` and then clears local credentials; revoke the Google grant in Google account settings if desired.

Push verification checks Google RS256 signature/JWKS, issuer, audience, expiry, service-account email/email_verified, expected subscription and connected mailbox identity before intake. Delivery IDs and Gmail message IDs are durably deduplicated. Metadata mode strips snippets/body. Public ingress never exposes the owner token. Development incoming-request logging is disabled to avoid logging OAuth callback codes.

## Discord setup the user must perform

1. Create your own application/bot in the Discord Developer Portal. Enter the application ID if you want a permission-scoped invite link. Generate/copy the bot token yourself; enter it only in the local app.
2. Invite the bot to the intended guild. Default invite asks for View Channel; enabling outbound adds Send Messages. No Administrator permission is requested.
3. Enter exact allowed guild and channel IDs. Explicitly consent to intake and choose **Connect bot & listen in scope**. Mentions only is on by default. DMs, webhook messages and bot messages are ignored.
4. The default Gateway intents are GUILDS and GUILD_MESSAGES. Message Content is a separate optional checkbox and must also be enabled/approved in Discord's portal when required. Without it, content availability follows Discord's app-mention rules.
5. Optional outbound permission is separate and remains review-gated. Gateway uses authenticated WSS, heartbeat ACKs, resume sequences and bounded reconnect. There is no public unsigned Discord-event webhook route.

Tokens/Gateway session state stay in memory. Incoming message IDs are durably deduplicated across reconnect/restart. The intake history keeps exact source/guild/channel/author metadata. Runtime restart requires reconnecting the bot. Bot tokens are never returned in status, logged or stored in SQLite.

## Outbound review behavior

A draft creates an immutable record containing provider, account, exact destination, subject/body and scope. Drafting never sends. Each review expires after15minutes. **Approve & send** must be clicked for that exact record. The digest binds approval to its immutable details, and the owner atomically consumes it before the adapter can make an outbound request. Rejection, expiry and concurrent duplicate execution are blocked.

Discord verifies the destination's guild and uses a stable nonce with `enforce_nonce`, plus `allowed_mentions: {parse: []}`. Gmail uses a stable Message-ID; Gmail does not promise exactly-once delivery from that header. Any ambiguous exception or owner crash during execution becomes **unknown** with no automatic resend. Inspect the destination before drafting again. Provider receipts are stored when confirmed. These records persist; credentials do not.

The model still has no send tools. Incoming content is saved as untrusted source data and queued for FalkorDB source syncing, with no automatic model invocation. Broader autonomous workflows require a later explicitly scoped tool/approval milestone.

## Verification limits

The suite uses clearly isolated Gmail fetch/JWT-verifier and Discord socket/fetch doubles. It tests OAuth state/PKCE/consent, signed-identity policy, account cursor/replay behavior, renewal/refresh, Gateway reconnection/scopes, durable intake/source outboxes and one-use exact-payload approvals. No real account grant, mailbox ingestion, Gateway session or send has been performed. Live end-to-end verification awaits the user's setup above.

Official references: [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push), [Pub/Sub push authentication](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions), [Discord Gateway](https://docs.discord.com/developers/events/gateway), [Discord messages](https://docs.discord.com/developers/resources/message).
