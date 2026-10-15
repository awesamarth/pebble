# User-facing copy

Write for the person using pebble. Explain the next useful action and its result in ordinary language. Product branding is lowercase **pebble**; the character’s chosen name is separate.

- Keep implementation terms (runtime, intake, Gateway, graph queues, SQLite, provider adapters, durable tasks) in engineering documentation. Use server, channel, messages, memory, connection and saved conversation in the product. Keep exact technical names in advanced setup only when people need them to configure a service.
- Put an important fact beside its relevant choice: what access is granted, where information is saved, whether a restart requires sign-in again, and whether an action sends or changes anything. Avoid a wall of developer notes or repeated defensive disclaimers. Never hide material limitations or imply stronger privacy/isolation than implemented.
- Every unavailable action needs an understandable reason and next step. Associate field guidance with controls using labels and aria-describedby; announce validation and progress accessibly. Distinguish connecting, connected, interrupted and failed. A request being accepted is not proof a connection succeeded.
- Keep consent specific and optional access separate. Saving messages, reading full content and sending need their own accurate choices. Invitation and connection are different steps. Never broaden access or auto-submit merely to simplify the UI.
- Review screens show the actual account, destination and content. Explain ambiguous results without claiming success or encouraging duplicate sends. Preserve approval, scope and retry checks in the owner.
- Prefer recognizable names when available. If only an ID is available, label it plainly (Server ID, Channel ID), explain where to find it, and never invent a name. Put source identifiers and delivery references in expandable details.
- Test empty, pending, success and failure states with synthetic data. For a live connected workspace, use a separate project/build directory and mock API responses. Never restart the owner, submit credentials, reconnect accounts, send messages or overwrite the live .next directory for a copy change.

Before shipping, read the screen aloud: can a person tell what to do, why a button is unavailable, and what happens next? Keep approved landing copy and design stable unless the request includes them.
