# Remembering Discord setup

Non-secret setup now persists in the ignored integrations.sqlite preferences table: application ID, server/channel IDs, mentions-only, Message Content, permission to save messages, optional sending, secure-save choice and auto-reconnect choice. A strict whitelist excludes token/secret values and normalizes booleans and IDs. The UI hydrates once and does not replace edits during polling. Saved setup does not imply a connected bot.

The earlier implementation did not persist this configuration. Previously observed server/channel pairs can be suggested using only extracted event metadata, without selecting message text. They are not treated as a complete approved allowlist: the user reviews the suggested IDs and explicitly connects. The earlier application ID is not recoverable from a saved setup record; do not infer one from message authors or other IDs.

## Token storage

The user can select Save token securely in macOS Keychain when entering their token locally. The native @napi-rs/keyring AsyncEntry binding uses service com.pebble.discord and a SHA-256 account key derived from the installation directory. No shell arguments, plaintext file, SQLite value, log or localStorage stores the token. No credential is returned to the client; status contains only a saved-token flag and safe errors. The token remains in process memory only while needed for the connection. Moving the installation directory changes its Keychain account identifier.

Saving a token and reconnecting automatically are separate opt-ins. Startup reads the vault only when all saved gates are satisfied: secure save, auto-reconnect, message-saving consent, and nonempty explicit server/channel scope. It reuses the exact normalized preferences; sending still requires the existing individual message approvals. Disconnect disables startup reconnection and leaves the secure copy available for a later explicit reconnect. Disconnect & forget saved token also deletes the Keychain item; a failed deletion is clearly reported and never claimed successful. Shutdown alone preserves the user's reconnect choice. Generation guards and serialized vault operations prevent stale startup/configuration work from reconnecting after disconnect or leaving a late secret write after forget.

macOS may request permission to access Keychain or require it to be unlocked. The user must approve that dialog themselves and retry locally if necessary. An unpackaged Bun process may prompt again after runtime/signing changes. Keychain provides OS-protected storage, not protection from all hostile code running as the same user.

## Cross-platform boundary

TokenVault separates credential operations from app logic. This release enables the native adapter only on macOS. A Windows Credential Manager adapter and Linux Secret Service adapter can use the same boundary later, but are not enabled or claimed tested here. Linux must explicitly require Secret Service: the package's default keyutils fallback is memory-only and must not be presented as persistent credential storage. There is no plaintext fallback when the OS store is unavailable. Unsupported platforms can still connect for the current session.

Focused verification uses a synthetic in-memory vault and fake Discord transport: preference persistence/reopen, opted-in startup reconnection, scope/sending restrictions, no token in status/preferences, deletion failure and successful forget, and no reconnection after forget. The native binding imports under Bun; no real Keychain entry was read/written and no OS vault roundtrip was claimed. One isolated UI smoke checks hydration, empty token field, honest disconnected state, explicit reconnect/forget and preserving draft edits during polling. No live account calls were made.

Activation requires a coordinated owner restart. It has deliberately not been performed for this change. After activation the user enters/saves the real token through the local UI; the agent must not retrieve or save it on their behalf.
