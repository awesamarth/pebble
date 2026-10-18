# Gmail: shortest local setup

The local path uses manual incremental checks. No Pub/Sub topic, service account, public HTTPS address, tunnel, billing change or external webhook is needed for this path. No Google resources or credentials are created by this repository.

## User steps

1. Select or create your own Google Cloud project. Enable **Gmail API** in its API Library.
2. In **Google Auth Platform**, configure Branding and Audience. For a personal Gmail test use **External**, **Testing**, and add your Gmail address under test users. An organization may restrict grants or require administrator approval.
3. Create a client under **Clients**, type **Web application**, and register exactly:

   `http://127.0.0.1:7341/api/integrations/gmail/callback`

   Do not substitute localhost, a different port, `/home`, or the push URL. The app accepts only this redirect. JavaScript origins are not used by the server-side OAuth flow.
4. In local pebble, open **Apps & actions → Connections → Gmail**. Enter **Google OAuth client ID** and **Google OAuth client secret** locally. Do not paste either secret or an authorization code into chat.
5. Select **Save senders, subjects and dates from new inbox emails**. Leave **Include full email text** and **Allow sending emails I approve** off unless wanted. Leave **Advanced: automatic email updates** blank.
6. Select **Save Gmail setup → Continue to Google**, which opens Google in a new tab. Choose your account and review Google’s grant. Google may show an unverified-app warning for your own test app; confirm the project/account is yours before proceeding.
7. After return, select **Check new changes**. On a first connection there is no import of older mail: the baseline is the account’s current history position. After a new message reaches INBOX, check again; it appears under **Incoming**. A connected AI model is not required for this check. Use **Use in conversation** to discuss a saved message; that sends its visible content to the selected model when you send the chat.

## What access and storage mean

Default OAuth permission is `gmail.readonly`, which grants broader mailbox read access than the app’s default local storage. Metadata mode deliberately discards bodies and snippets and saves only identifying fields plus From/To/Subject/Date headers. Full-text storage is a separate app choice, not a narrower Google permission. Optional sending adds `gmail.send` and uses immutable, expiring one-use approval before sending. Gmail does not auto-reply to incoming mail.

By default, client configuration and OAuth tokens are session-only. Reuse your existing client ID and secret when reconnecting; no new Google client secret is needed. With **Remember Gmail setup and sign-in in macOS Keychain** selected when saving setup, the project-scoped native `com.pebble.gmail` entry stores the client configuration and refreshable OAuth session. SQLite stores only the opt-in flag, never these secrets. Stored permissions are restored without requesting additional scopes; notifications are not automatically started. Refresh-token rotation updates the same secure entry. If Google supplies no refresh token, only setup is saved and the UI explains that another sign-in is needed. Unsupported or locked Keychain storage reports an error without a plaintext fallback. Account-scoped history cursors and saved messages persist locally; sources also sync when memory is connected. Reconnecting the same account resumes its saved cursor if Gmail still retains that history. Google’s Testing-mode refresh tokens can expire after seven days for these scopes. Disconnect clears the local session and deletes the saved Keychain entry; removal failures stay visible and can be retried. Closing the app retains an opted-in entry; revoke access separately in your Google account if desired.

An expired history position requires explicit **Skip the gap & resume from now**. That skips unavailable updates; pebble never silently imports the whole mailbox. This implementation is designed for new messages entering INBOX; it is not an archive importer or background polling service. Manual checks run only when requested. Live Google OAuth and Gmail profile connection succeeded on the development Mac after Gmail API was enabled and the account was included as a test user. Read/send grant availability was confirmed through safe status fields. No mailbox contents were read and no email was sent during that check.

## Asking pebble to find an email

Once Gmail is connected, bounded mailbox search/read can use the existing read-only grant. A search returns at most ten messages and does not import results, move the saved-message cursor or require an inbox-saving choice. Metadata mode still limits returned content to From/To/Subject/Date; enable full text before connecting to let reads return up to 20,000 characters of plain text. Attachments and HTML-only bodies are not read. Results are untrusted email content. Their `gmail:account:messageId` references identify Google messages, not evidence that the message has been saved to local memory. Model conversation history may retain a tool result used in that conversation.

## Optional local automatic updates (Pub/Sub pull)

This path keeps pebble on your Mac. Google publishes inbox-change notifications to your own Cloud Pub/Sub subscription; pebble receives them through outgoing authenticated requests. No public callback, tunnel, service-account key or new hosting vendor is needed. The owner process must remain running. This does not add scheduled mailbox scanning. [Gmail supports both pull and push subscriptions](https://developers.google.com/workspace/gmail/api/guides/push).

1. In the **same project as your OAuth client**, enable **Cloud Pub/Sub API** as well as Gmail API. Complete any Google project prerequisites yourself; pebble never enables billing, buys a service or creates Cloud resources.
2. Create a topic and a **Pull** subscription dedicated to this mailbox. Copy the complete resource names, for example `projects/PROJECT_ID/topics/pebble-gmail` and `projects/PROJECT_ID/subscriptions/pebble-gmail-local`. Grant **Pub/Sub Publisher** on the topic to `gmail-api-push@system.gserviceaccount.com`.
3. On that subscription, grant **Pub/Sub Subscriber** (`roles/pubsub.subscriber`) to the Google user who will sign in to pebble. That account needs `pubsub.subscriptions.consume`; publisher access alone is insufficient. Project administration and subscription creation are separate setup permissions, not permissions pebble requests. See [Pub/Sub access control](https://docs.cloud.google.com/pubsub/docs/access-control).
4. Select **Local automatic updates** in Gmail setup, enter the topic/subscription, and opt in to saving incoming emails. Save setup and reconnect Google. This mode additionally requests `https://www.googleapis.com/auth/pubsub`; an existing Gmail-only token cannot receive subscription notifications. [Google's pull endpoint requires that scope](https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions/pull).
5. Start local updates. Check that the watch has an expiry and the local receiver is running, then send a new INBOX email yourself. An entry in **Incoming** confirms actual import. Running/connected badges alone do not prove delivery.

Notifications are acknowledged only after processing and durable intake. Failed processing stays unacknowledged for Google redelivery; duplicates remain safe. [Acknowledgment removes delivered Pub/Sub messages](https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions/acknowledge). Configure an acknowledgment deadline suitable for processing; this implementation does not extend individual deadlines, so redelivery may occur. Retries back off and stop after six consecutive receiver failures. The app exposes the error and allows manual retry. Watch renewal continues while connected; stopping the local receiver does not revoke Google's OAuth grant. Disconnect or stopping the watch also cancels local receiving. Missing notifications can still require **Check new changes**; no periodic mailbox fallback is enabled.

Setup and OAuth tokens remain session-only unless Remember Gmail is enabled. After owner restart, an opted-in connection restores from Keychain; start receiving notifications again explicitly. Saved cursors/messages remain local. The implementation was verified with intercepted Google API fixtures, not a real mailbox.

## Optional externally hosted push intake

Manual checks work immediately after OAuth. Externally delivered push additionally needs a user-approved public HTTPS endpoint; this repo creates no tunnel or Google resources.

1. In the OAuth client's Google project, open Pub/Sub → Topics and create `pebble-gmail`. On that topic, grant **Pub/Sub Publisher** to `gmail-api-push@system.gserviceaccount.com`. Copy `projects/PROJECT_ID/topics/pebble-gmail`. See [Gmail push setup](https://developers.google.com/workspace/gmail/api/guides/push).
2. Create a dedicated service account such as `pebble-gmail-push`; no JSON key is needed. Create a subscription to the topic with delivery type **Push**. Its approved public endpoint must forward only `/api/integrations/gmail/push`, preserving the Authorization header and JSON body. Do not expose `/api/runtime`, the owner port, files or development UI.
3. Enable subscription authentication, select that service account, and set the audience to the exact public endpoint URL. The subscription creator needs `iam.serviceAccounts.actAs` on it. The Pub/Sub signing service agent `service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com` needs `iam.serviceAccounts.getOpenIdToken` (for example via Service Account Token Creator). See [authenticated push permissions](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
4. In pebble's advanced Gmail settings enter the full topic and subscription names, identical audience, and selected push service-account email. Save and reconnect Gmail, then **Turn on email updates**. A successful watch generates an initial notification; test intake with a new INBOX message. Watches renew while the owner runs. Push is event-driven, not periodic mailbox polling.

A connection/watch success alone does not prove public delivery. Verify that Incoming receives the new message; use **Check new changes** if delivery is delayed. Missing events can be recovered by manual incremental checks while history remains available. No automatic periodic fallback is currently implemented.

## Troubleshooting

- `redirect_uri_mismatch`: fix the authorized redirect on the same OAuth client used in pebble; copy the exact callback above.
- `pubsub scope reconnect required`: save setup in local automatic mode and authorize Google again.
- `pubsub http 403`: check the Pub/Sub API, subscription name and Subscriber access for the signed-in Google user. OAuth permission alone does not grant Cloud IAM access.
- Google refuses access: check Gmail API is enabled, the account is a test user, and organization policy allows the grant.
- Connected but no messages: confirm message-saving was selected before authorization, send a new message to INBOX, then use **Check new changes**. Existing older emails are not fetched.
- Manual checking disabled: choose permission to save new inbox emails in setup and authorize again.
- **Turn on email updates** fails with blank advanced fields: use **Check new changes** instead; choose manual checks or complete the selected pull/push Cloud setup.

Official references: [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail incremental sync](https://developers.google.com/workspace/gmail/api/guides/sync), [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push).


## Callback diagnostics

The callback returns only fixed error categories to the local UI, never the authorization code, state, token or raw Google response. The runtime preserves one-use state/PKCE checks. A failed callback must use a fresh sign-in attempt; do not replay a used callback URL. The Continue button opens Google from the user gesture, reuses an ongoing sign-in tab, and can retry after that tab returns to pebble. OAuth app publication and extra scopes are unnecessary for a correctly configured test account.


Secure-persistence verification uses synthetic OAuth responses and an injected in-memory vault only. It covers opt-in/config-only saving, restored permissions, token rotation, disconnect erasure, locked-vault failures and absence of secrets in SQLite/status. No real Gmail token was read or saved during this implementation. Activating the new backend requires an owner-approved restart; storing a real connection requires the owner to select Remember Gmail, save setup and complete Google sign-in. Existing session-only tokens lost in a previous restart cannot be recovered by this change.
