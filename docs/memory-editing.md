# Inspect and edit saved memory

Memory shows a source-backed relation view for each matching fact: source conversation → saved fact → linked person/project. Search queries the existing graph and returns up to 20 rows. Select a fact to inspect its original message and source/conversation identifiers. This is an inspector for returned relationships, not a complete database visualization.

The owner can edit a fact's text, save/cancel, or confirm removal. Person/project labels remain unchanged in this first editor. Text changes and deletions bind both the exact fact ID and source ID and require the text the owner last saw. If another operation changed or removed it, the graph write rejects rather than overwriting newer context; refresh and try again.

Deletion removes only the selected Fact node and its relationships. It does not delete Source, Person or Project nodes, the original conversation, or text already included in prior model turns. Future memory recall omits the deleted fact; conversation history remains a separate record. No automatic retry follows an ambiguous graph failure.

The API exposes owner-only POST `/memory/fact/update` and `/memory/fact/delete`, behind the existing local owner proxy and same-origin checks. These are direct human editor actions, not channel agent capabilities. UI text explains when an older running owner needs updating; do not restart connected accounts for a copy change.

## Focused verification

`bun verification/memory-edit.ts` uses the existing local database at7380, creates a unique `pebble_verify_...` synthetic graph, checks edit/recall, stale and wrong-source rejection, and source retention after deletion. It removes only that synthetic graph in `finally`; it never queries the user's `pebble` graph. The database must already be running. Run explicitly, not as a broad default test.

The UI smoke uses isolated frontend output, synthetic API data and intercepted requests; it does not read or edit live memory. A source build or synthetic test does not establish live user-edit success.
