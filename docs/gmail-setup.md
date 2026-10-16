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
6. Select **Save Gmail setup → Get Google sign-in link → Continue to Google**, choose your account and review Google’s grant. Google may show an unverified-app warning for your own test app; confirm the project/account is yours before proceeding.
7. After return, select **Check new changes**. On a first connection there is no import of older mail: the baseline is the account’s current history position. After a new message reaches INBOX, check again; it appears under **Incoming**. A connected AI model is not required for this check. Use **Use in conversation** to discuss a saved message; that sends its visible content to the selected model when you send the chat.

## What access and storage mean

Default OAuth permission is `gmail.readonly`, which grants broader mailbox read access than the app’s default local storage. Metadata mode deliberately discards bodies and snippets and saves only identifying fields plus From/To/Subject/Date headers. Full-text storage is a separate app choice, not a narrower Google permission. Optional sending adds `gmail.send` and uses immutable, expiring one-use approval before sending. Gmail does not auto-reply to incoming mail.

Client secret, access token and refresh token are currently session-only. Reenter client settings and reconnect after owner restart. Account-scoped history cursors and saved messages persist locally; sources also sync when memory is connected. Reconnecting the same account resumes its saved cursor if Gmail still retains that history. Google’s Testing-mode refresh tokens can expire after seven days for these scopes. Disconnect clears the local session; revoke access separately in your Google account if desired.

An expired history position requires explicit **Skip the gap & resume from now**. That skips unavailable updates; pebble never silently imports the whole mailbox. This implementation is designed for new messages entering INBOX; it is not an archive importer or background polling service. Manual checks run only when requested. No Gmail connection or live mailbox test was performed by the implementation agent.

## Asking pebble to find an email

Once Gmail is connected, bounded mailbox search/read can use the existing read-only grant. A search returns at most ten messages and does not import results, move the saved-message cursor or require an inbox-saving choice. Metadata mode still limits returned content to From/To/Subject/Date; enable full text before connecting to let reads return up to 20,000 characters of plain text. Attachments and HTML-only bodies are not read. Results are untrusted email content. Their `gmail:account:messageId` references identify Google messages, not evidence that the message has been saved to local memory. Model conversation history may retain a tool result used in that conversation.

## Optional event-driven intake

Manual checks work immediately after OAuth. Actual push additionally needs a user-approved public HTTPS endpoint; this repo creates no tunnel or Google resources.

1. In the OAuth client's Google project, open Pub/Sub → Topics and create `pebble-gmail`. On that topic, grant **Pub/Sub Publisher** to `gmail-api-push@system.gserviceaccount.com`. Copy `projects/PROJECT_ID/topics/pebble-gmail`. See [Gmail push setup](https://developers.google.com/workspace/gmail/api/guides/push).
2. Create a dedicated service account such as `pebble-gmail-push`; no JSON key is needed. Create a subscription to the topic with delivery type **Push**. Its approved public endpoint must forward only `/api/integrations/gmail/push`, preserving the Authorization header and JSON body. Do not expose `/api/runtime`, the owner port, files or development UI.
3. Enable subscription authentication, select that service account, and set the audience to the exact public endpoint URL. The subscription creator needs `iam.serviceAccounts.actAs` on it. The Pub/Sub signing service agent `service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com` needs `iam.serviceAccounts.getOpenIdToken` (for example via Service Account Token Creator). See [authenticated push permissions](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
4. In pebble's advanced Gmail settings enter the full topic and subscription names, identical audience, and selected push service-account email. Save and reconnect Gmail, then **Turn on email updates**. A successful watch generates an initial notification; test intake with a new INBOX message. Watches renew while the owner runs. Push is event-driven, not periodic mailbox polling.

A connection/watch success alone does not prove public delivery. Verify that Incoming receives the new message; use **Check new changes** if delivery is delayed. Missing events can be recovered by manual incremental checks while history remains available. No automatic periodic fallback is currently implemented.

## Troubleshooting

- `redirect_uri_mismatch`: fix the authorized redirect on the same OAuth client used in pebble; copy the exact callback above.
- Google refuses access: check Gmail API is enabled, the account is a test user, and organization policy allows the grant.
- Connected but no messages: confirm message-saving was selected before authorization, send a new message to INBOX, then use **Check new changes**. Existing older emails are not fetched.
- Manual checking disabled: choose permission to save new inbox emails in setup and authorize again.
- **Turn on email updates** fails with blank advanced fields: use **Check new changes** instead; push needs its separate Cloud setup.

Official references: [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail incremental sync](https://developers.google.com/workspace/gmail/api/guides/sync), [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push).
