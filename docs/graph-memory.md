# FalkorDB model and decision evidence

Implemented in [runtime/memory.ts](../runtime/memory.ts); connected to each owner turn in [runtime/engine.ts](../runtime/engine.ts). This document describes current code, not a proposed schema. Queries below are read-only examples; parameter values shown later refer to disposable synthetic data, never private application records.

## Nodes and relationships

| Node | Stored properties / purpose |
| --- | --- |
| `Source` | `id`, `conversationId`, `role`, `text`, `kind`. Original text/provenance; current writer sets `kind="chat_message"`, including imported sources distinguished by role. |
| `Fact` | `id`, `text`. A bounded remembered statement grounded in an existing source. |
| `Person`, `Project` | Deterministic `id` from `memoryEntityId(kind,name)`, plus `name`. Named entities must occur in both fact and original source. |
| `PebbleWorkspace` | `id`. Explicit initialization marker; it has no linking relationship in current code. |

`(Fact)-[:SUPPORTED_BY]->(Source)` preserves provenance. `(Fact)-[:ABOUT]->(Person)` and `(Fact)-[:ABOUT]->(Project)` connect facts through shared entities. There is no invented direct `Person → Project` edge: that association is represented by a fact about both. Source upserts and fact/entity writes use parameterized `MERGE`; browser-derived assistant output is excluded from automatic graph sync. Correcting a fact removes obsolete `ABOUT` edges; deleting it preserves the original source.

SQLite persists transcripts/tasks and an idempotent source-sync outbox. FalkorDB stores/query-traverses sourced long-term memory. A transcript is not substituted for the graph, and a successful connection is not evidence that recall influenced an answer.

## Actual retrieval queries

The first query in `GraphMemory.recall()` selects up to 20 matching facts and their sources/entities. `$query` is the current question, trimmed/bounded. `$scoped=false` is the private owner's memory search; channel recall supplies `$scoped=true` and the exact conversation scope.

```cypher
MATCH (f:Fact)-[:SUPPORTED_BY]->(s:Source)
OPTIONAL MATCH (f)-[:ABOUT]->(p:Person)
OPTIONAL MATCH (f)-[:ABOUT]->(j:Project)
WITH f,s,p,j
WHERE ($scoped = false OR s.conversationId = $conversationId)
  AND ($query = "" OR toLower(f.text) CONTAINS toLower($query)
       OR toLower($query) CONTAINS toLower(p.name)
       OR toLower($query) CONTAINS toLower(j.name))
RETURN DISTINCT f.id AS id, f.text AS text, s.id AS sourceId,
  s.text AS sourceText, s.conversationId AS conversationId, s.role AS role,
  p.name AS person, j.name AS project
ORDER BY f.id, s.id LIMIT 20
```

When matches leave room, the implementation chooses at most eight seed fact IDs and performs one shared-entity hop. Below is its actual generated query for one seed; multiple seeds add parameterized `OR seed.id = $seedN` conditions. Both origin and result are scoped for channel memory.

```cypher
MATCH (seed:Fact)-[:SUPPORTED_BY]->(origin:Source),
      (seed)-[:ABOUT]->(entity)<-[:ABOUT]-(f:Fact)-[:SUPPORTED_BY]->(s:Source)
WHERE (seed.id = $seed0) AND seed.id <> f.id
  AND ($scoped = false OR
       (s.conversationId = $conversationId AND origin.conversationId = $conversationId))
OPTIONAL MATCH (f)-[:ABOUT]->(p:Person)
OPTIONAL MATCH (f)-[:ABOUT]->(j:Project)
RETURN DISTINCT f.id AS id, f.text AS text, s.id AS sourceId,
  s.text AS sourceText, s.conversationId AS conversationId, s.role AS role,
  p.name AS person, j.name AS project, entity.name AS relatedTo
ORDER BY f.id, s.id LIMIT 20
```

Results are deduplicated and capped at 20 in total. The model receives original source IDs/text and `relatedTo`; association supplies context, not proof of a new fact. Source inspection uses:

```cypher
MATCH (s:Source {id: $id})
RETURN s.id AS id, s.conversationId AS conversationId,
       s.role AS role, s.text AS text LIMIT 1
```

## Evidence that the graph affects the answer

The real database smoke check creates `s1` / `f1`: **Mira builds project Lantern**, about Mira and Lantern; and `s2` / `f2`: **Mira prefers quiet mornings**, about Mira only. Query parameters are `$query="Lantern"`, `$scoped=true`, `$conversationId="synthetic:private"`. The first query finds `f1`; the second uses `$seed0="f1"` and traverses shared Mira to retrieve `f2`, which contains no Lantern text. The test asserts `f2.relatedTo === "Mira"`, provenance, exclusion of another conversation's fact, correction-edge cleanup, persistence and deletion.

```sh
bun run runtime/memory-real-smoke.ts
```

This targets a uniquely named disposable graph at `127.0.0.1:7380`, then deletes it. Separate real-model checks through the normal Pi/Engine path used synthetic Mira/Lantern facts: a later Lantern question received the related morning preference and cited its source. That preference was supplied by FalkorDB traversal, rather than being present in the question or project fact. A real Engine reopen also restored the saved graph connection, related recall and exact source lookup. These are completed checks, not a claim that a submission demo has been recorded. No private personal graph was used for verification.
