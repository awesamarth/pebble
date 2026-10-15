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

## Optional push: later, not required for manual checks

The existing adapter supports Gmail watches and authenticated Pub/Sub notifications. This requires user-managed Google Cloud resources and authorized public HTTPS ingress; nothing in the local-only setup creates that exposure.

- Create a Pub/Sub topic in the same Google Cloud project, granting publisher access to `gmail-api-push@system.gserviceaccount.com`.
- Create an authenticated push subscription and configure a service-account identity and expected audience. Its public endpoint must forward to `/api/integrations/gmail/push` without exposing the private owner API/token.
- Fill **Topic name**, **Subscription name**, **Verified delivery address (audience)** and **Push service-account email** in advanced settings before authorizing Gmail, then use **Turn on email updates**.
- Watches renew while the owner stays connected. This is push-triggered incremental sync, not a separate polling process.

## Troubleshooting

- `redirect_uri_mismatch`: fix the authorized redirect on the same OAuth client used in pebble; copy the exact callback above.
- Google refuses access: check Gmail API is enabled, the account is a test user, and organization policy allows the grant.
- Connected but no messages: confirm message-saving was selected before authorization, send a new message to INBOX, then use **Check new changes**. Existing older emails are not fetched.
- Manual checking disabled: choose permission to save new inbox emails in setup and authorize again.
- **Turn on email updates** fails with blank advanced fields: use **Check new changes** instead; push needs its separate Cloud setup.

Official references: [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail incremental sync](https://developers.google.com/workspace/gmail/api/guides/sync), [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push).
