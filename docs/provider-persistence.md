# Provider sign-in persistence

The production owner constructs `new DeviceCredentials(directory)`; isolated tests retain `new SessionCredentials()` or inject a fake vault. Both implement the pi-ai CredentialStore contract and expose non-secret `persistenceStatus('openai')`.

On macOS the native `@napi-rs/keyring` AsyncEntry API stores versioned JSON in Keychain service `com.pebble.provider`, account `<sha256(resolve(directory))>:openai`. The value holds either API-key credential or the SDK OAuth credential, including rotating refresh/access tokens and expiry. No shell arguments, files, SQLite or browser storage contain this value. There is no plaintext fallback. Other platforms are unsupported in this implementation; they fail secure writes rather than claiming persistence.

Reads are lazy and attempted once per provider for the owner lifetime. Missing entries report not_saved. Locked/unreadable/malformed entries produce an error status and no usable credential; restart after resolving Keychain access to retry a failed initial read. A secure write must succeed before updating session state. pi-ai's normal `modify` refresh path therefore persists rotating OAuth credentials. SDK callbacks receive a clone so failed storage cannot mutate the currently usable credential. Deletion must succeed before clearing the session; failure reports that sign-out did not finish. An absent item is a successful deletion.

Only one owner should run per project. The class serializes modifications in this process; it does not implement multi-process compare-and-swap around native entries. Moving the project changes its Keychain namespace. Existing session credentials are not automatically migrated: the human signs in again through the local app after activation. A macOS access prompt must be handled by the human. No real Keychain item was accessed while implementing or testing this feature.

Injected fake-vault tests verify login/refresh persistence, restart restoration, sanitized read failure and write/delete failure retaining the prior session. Native provider storage still needs the user's first real sign-in to verify their OS access configuration.
