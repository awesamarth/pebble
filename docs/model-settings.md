# Model settings for the connected provider

Model and reasoning controls are hidden while disconnected. A connected account replaces the sign-in form with status, device-persistence feedback, model settings and Sign out. ChatGPT OAuth is separate from OpenAI, Anthropic, Google/Gemini and OpenRouter API-key connections. See [supported provider scope](model-providers.md). Keys never route to another provider.

For OpenAI, production requests the authenticated account's catalog from `https://api.openai.com/v1/models`. ChatGPT OAuth parses list-visible `models[]` slug/display_name entries; OpenAI API keys parse `data[]` IDs. Choices intersect the installed SDK's text-capable Responses models. Ordering and ChatGPT display names come from the server. No account-list failure falls back to an unrelated bundled list. See the official [ChatGPT models/inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

The account-specific catalog is cached in memory for five minutes with a method/token hash key and single-flight request. No raw credential is used as a cache key or persisted with catalog data. Authentication resolution uses the SDK's normal refresh path, whose credential updates flow through secure storage. Account changes select a different cache. Catalog listing is a read request, not inference, and does not guarantee a later response will succeed or that quota is available.

Model/reasoning preferences remain independently per connection in app.sqlite. A stale or incompatible saved choice is displayed as unavailable and rejected before inference, never silently replaced. The default remains gpt-6-sol/off until the user chooses otherwise. Reasoning uses the exact installed model's supported levels; an Off-only model has no reasoning selector. Changing models does not silently choose a different nontrivial reasoning level.

The private web and scoped Discord Harness requests validate against current authenticated choices in production. Unsupported provider requests are rejected. Isolated tests inject static catalogs or fake authenticated catalog transports; they do not access real accounts or OS credentials. Confirmation resets on connection/settings changes and becomes verified only after a completed response.

Backend activation uses the existing runtime session. The connected legacy UI stays honest about secure persistence/account catalog features that are not active yet. No current session credential is extracted or migrated manually; the user performs one fresh login/save after activation. Subsequent supported credentials restore from OS storage. See [provider persistence](provider-persistence.md).

## Mixed-version UI compatibility

Authenticated settings do not depend on the optional `provider` field. Older running owners return valid model/reasoning choices without it; those controls remain editable. Current selection stays visible during catalog loading/errors. A compatible `/models` response can populate missing choices; if neither catalog loads, the saved selection stays visible with an explicit retry state rather than fabricated capabilities. Reasoning is hidden only when the chosen model is positively known to support only `off`. Legacy compatible lists are labeled separately from account-filtered catalogs.

The model receives [trusted per-request execution context](execution-context.md) from backend-resolved agent configuration after runtime activation.
