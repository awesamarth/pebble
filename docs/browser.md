# Local browser control

Browser control at http://127.0.0.1:7341/home and the private chat use one dedicated Chromium profile: ignored `.pebble/browser-profile`. Ordinary searches, links, forms and authorized signed-in browsing use this same session. There is no anonymous research lane or query-parameter allowlist. Existing `start-research` and `navigate-public` HTTP endpoints are compatibility aliases for this browser; `status.research` is always false.

Start opens hidden Chromium under manual ownership. Resume enables agent control. A chat `pebble_browser_start` can start and enable a stopped browser, but never resumes an existing manual or paused session. Repeated chat starts reuse the active session. Pause and Stop interrupt agent work. Stop retains the profile's persistent site sessions. Browser tools cannot access ordinary Chrome tabs, profiles, cookies or credentials.

Open window hands this dedicated profile to the owner for login or manual work. Resume closes the visible context and opens it hidden again. Cookies and persistent site storage survive; unfinished forms, session storage, JavaScript state and scroll positions may reset. Tabs reopen at their previous addresses, which makes fresh navigation requests. Every handoff invalidates refs and pending reviews; uncertain actions are never replayed. This is a practical context handoff, not an embedded remote desktop.

Pause revokes agent control immediately rather than waiting for a page operation. Window handoff and Stop close the old context before releasing its action queue; a nonresponsive close returns an error after three seconds and keeps control paused. A stalled model cancellation cannot hold the browser-control response open. No pending mutation is replayed.

## Tools and actions

The private owner request receives seven tools: `pebble_browser_start`, `pebble_browser_navigate`, observe, screenshot, tabs, scroll and action. Observations return bounded untrusted page text and short-lived element refs. Search URL parameters are preserved, including YouTube `search_query` and arbitrary ordinary parameters. Account pages and normal HTTP methods are supported. Existing site permissions are unchanged.

Ordinary navigation, actual link/button clicks, non-sensitive fills, search submissions and tab changes run directly without creating review records. Consequential submissions (including sends, purchases, deletion and settings changes) create immutable, expiring, one-use reviews. The model must set `review:true` for consequential actions even when a page's control is ambiguous. Host checks also identify obvious action URLs, consequential button labels, non-search form submissions and settings/profile fills. This is action classification, not a proof that arbitrary site JavaScript has no side effects. Normal scripts, form events and network requests can run as part of browsing.

Login, password, OTP, payment and other credential fields require manual entry. Explicit bearer credentials in model-generated navigation URLs are rejected; generic words such as `token` in search values and ordinary keys such as `code` are not blocked. The model cannot run arbitrary selectors, JavaScript, shell, CDP or clipboard commands. Page content never grants permission. Site access controls and CAPTCHA remain in effect.

Refs expire after 90 seconds and are bound to session, tab and address. Routine interactions tolerate unrelated dynamic DOM updates. Reviews additionally validate a bounded page/form/focus hash before execution. Actions invalidate old refs and reviews; observation may retry after a navigation destroys its execution context, but mutations are never retried. Screenshots are viewport-only, masked for standard password/payment/OTP selectors and excluded from graph memory. Masking cannot identify every custom sensitive widget.

## Network boundary and limits

Chromium launches with its sandbox explicitly enabled and uses a private driver pipe. No unsandboxed retry is attempted. Downloads and service workers are blocked. HTTP(S) and WebSocket destinations check all resolved addresses, rejecting private, reserved, local, internal and metadata targets. The exact-origin loopback fixture exception is test-only.

Requests use a bounded native-fetch transport with automatic redirects disabled, preserving browser-provided request headers and response cookies. This avoids the installed Bun/Playwright `route.fetch` Set-Cookie parsing incompatibility. Response bodies are stream-bounded to 15 MB with a 12-second timeout. Each permitted top-level redirect becomes a fresh navigation that re-enters network validation. Subresource/frame redirects, non-idempotent 307/308 redirects, HTTPS downgrades and chains beyond eight hops fail closed. These limits break some websites. This is not DNS pinning, OS network isolation or universal browser compatibility.

Persistent cookies enable owner-authorized authenticated browsing in the dedicated profile. Credentials are entered by the owner in its window, never imported from another browser. Observation can expose signed-in page contents to the selected model and durable private conversation. Browser-derived assistant context remains excluded from graph memory after Stop and durable restart.

## Verification, 18 October 2026

`bun test runtime/browser runtime/engine-memory.test.ts` covers public/private network checks, provider namespace conversion, ownership/handoff, masked screenshots, revisions, exact reviews, ordinary clicks/fills, POST search submission, arbitrary search parameters, tabs and cookie persistence across Stop/Start. Visible handoff tests require explicit `PEBBLE_VISIBLE_BROWSER=1`; default runs stay headless. Earlier visible handoff checks passed separately, but repeated combined execution hit a launch timeout and was stopped to avoid opening more windows.

A disposable real browser loaded `https://www.youtube.com/results?search_query=new+clayface+trailer` in about 3.9 seconds, returned Final Trailer and Official Trailer links, reused the same session across other search URLs and created zero reviews. Google returned its unusual-traffic challenge; it was not bypassed. Bing returned an incomplete result page. These are site outcomes, not query-policy refusals.

An isolated Engine using the existing saved ChatGPT connection and gpt-6-sol completed the same YouTube request through the actual browser tools in 14.9 seconds. It returned `https://www.youtube.com/watch?v=KCR-rz0YfD4` and `https://www.youtube.com/watch?v=OGO4Mqvo3jI`, with zero reviews, without sign-in or video playback. Temporary storage/profile were removed; live Gmail, personal graph and owner conversation were untouched. Its HTTP-equivalent send acceptance took 3 ms: status, model validation, synthetic memory recall and configuration each under 1 ms, submit 2 ms. The independent live chat worker measured acceptance at 37 ms and first model text at 3.6 seconds, so no backend acceptance delay was reproduced.

Source changes require restarting the Bun owner to become active in the main app. Gmail's current configuration/tokens are session-only: restarting requires reconnecting Gmail. Do not restart the connected runtime without the owner's approval of that impact.
