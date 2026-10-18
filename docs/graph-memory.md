# Hybrid semantic and multi-hop graph memory

Implemented in [runtime/memory.ts](../runtime/memory.ts), [local embeddings](../runtime/embeddings.ts), and the normal [Engine](../runtime/engine.ts) recall path. SQLite retains durable conversations/tasks; FalkorDB stores sourced facts, their entity graph and their semantic vectors. No new paid embedding provider or API key is required.

## Stored model

| Node / edge | Actual properties and purpose |
| --- | --- |
| `Source` | `id`, `conversationId`, `role`, `text`, `kind="chat_message"`; immutable original provenance in the fact editor. |
| `Fact` | `id`, `text`; `embedding` (512-dimensional native vector), `embeddingModel`, `embeddingText` (exact indexed-text version). |
| `Person`, `Project` | Deterministic normalized-name `id`, plus `name`. Entity names must occur in both the fact and its original source. |
| `PebbleWorkspace` | Initialization marker `id`; no linking edge is invented. |
| `Fact -[:SUPPORTED_BY]-> Source` | Original evidence for each remembered fact. |
| `Fact -[:ABOUT]-> Person/Project` | Grounded shared entities. There is no inferred direct “works on” or dependency edge. |

New/edited facts are embedded locally. Legacy source-backed facts are backfilled automatically on connection in batches of 32, with background continuation. Unsourced orphan facts are excluded. The stored model ID and exact indexed text detect stale vectors. Correction clears/rebuilds embeddings and removes obsolete entity links; deletion removes the Fact/vector but preserves Source. Compare-and-set indexing cannot overwrite a newer fact text. Browser-derived assistant output remains excluded from automatic source sync.

## Real semantic retrieval

On this Mac, Apple's pretrained NaturalLanguage English sentence embedding is available: **512 dimensions**, model ID `apple-nl-sentence-en-r1-d512`. The small Swift worker is compiled locally on first use; vectors/text never go to an embedding service. The worker stays resident while used, with bounded requests/cache lifecycle. No model weights or generated binary are committed. Missing native tooling/model produces visible semantic-unavailable status, retaining wording/graph recall; it never substitutes a hash or synonym table and calls it semantic search.

Vectors are persisted in FalkorDB with a native HNSW cosine index:

```cypher
CREATE VECTOR INDEX FOR (f:Fact) ON (f.embedding)
OPTIONS {dimension:512, similarityFunction:'cosine'}
```

Private-owner search uses the native index for candidates, filters current model/text versions and source existence, then ranks qualifying matches. `score` is cosine distance, so similarity is `1-score`.

```cypher
CALL db.idx.vector.queryNodes('Fact','embedding',64,vecf32($vector))
YIELD node,score
WITH node AS f,1.0-score AS similarity
MATCH (f)-[:SUPPORTED_BY]->(s:Source)
WHERE f.embeddingModel=$model AND f.embeddingText=f.text
WITH f,s,similarity WHERE similarity >= $minimum
OPTIONAL MATCH (f)-[:ABOUT]->(p:Person)
OPTIONAL MATCH (f)-[:ABOUT]->(j:Project)
RETURN DISTINCT f.id AS id,f.text AS text,s.id AS sourceId,
  s.text AS sourceText,s.conversationId AS conversationId,s.role AS role,
  p.name AS person,j.name AS project,similarity
ORDER BY similarity DESC,f.id LIMIT 8
```

Channel-scoped searches deliberately filter Source scope **before** exact `vec.cosineDistance` ranking. A global ANN result followed by scope filtering could let another channel crowd out the owner's matches. Neither vector ranking nor traversal returns another scope's source.

Lexical seed retrieval still matches fact wording and named entities. Semantic matches require a minimum cosine similarity (default 0.36) and stay within 0.08 of the best qualifying semantic match. Reciprocal-rank fusion combines both lists into up to eight seeds. Scores are similarity, not truth/confidence. A nonempty query with no match returns no remembered context: the previous generic-fact fallback has been removed. Empty search remains an explicit bounded memory-list operation.

## Meaningful multi-hop retrieval

Starting from hybrid seeds, breadth-first expansion repeatedly asks FalkorDB for existing `Fact → entity ← Fact` connections. Each step traverses two ABOUT edges; it is not merely a larger seed limit. Every intermediate and destination fact must have an allowed source. Cycles/duplicate facts are tracked. Results retain `retrieval.kind`, `depth`, a path of original source IDs/entity names, and each result's own source. The inspector shows the path and opens its sources.

The query executed for each frontier fact is:

```cypher
MATCH (seed:Fact {id:$seed0})-[:SUPPORTED_BY]->(origin:Source),
      (seed)-[:ABOUT]->(entity)<-[:ABOUT]-(f:Fact)-[:SUPPORTED_BY]->(s:Source)
WHERE seed.id <> f.id AND ($scoped = false OR
      (s.conversationId = $conversationId AND origin.conversationId = $conversationId))
OPTIONAL MATCH (f)-[:ABOUT]->(p:Person)
OPTIONAL MATCH (f)-[:ABOUT]->(j:Project)
RETURN DISTINCT f.id AS id,f.text AS text,s.id AS sourceId,
  s.text AS sourceText,s.conversationId AS conversationId,s.role AS role,
  p.name AS person,j.name AS project,entity.name AS relatedTo
ORDER BY f.id,s.id LIMIT 16
```

Defaults: **3 connection steps**, **80 visited facts**, **24 returned facts**, 16 neighbors/frontier query and a soft 1.5-second traversal budget (individual database queries retain their server timeout). Results reserve room across depths so shallow neighbors do not automatically exclude deeper evidence. Bounds prevent runaway/cyclic queries; there is no claim of unlimited traversal. Operator settings: `PEBBLE_MEMORY_HOPS` (1–6), `PEBBLE_MEMORY_VISITED` (8–160), `PEBBLE_MEMORY_RESULTS` (4–40), `PEBBLE_MEMORY_SIMILARITY` (0.25–0.9). Truncation and actual depth/timing are reported. Association paths are not new asserted relationships; the agent is instructed to explain/cite them accurately.

## Measured actual verification

All data below was synthetic, in uniquely named disposable graphs/conversations; the personal graph was not used for verification.

- Native worker cold compile/start: **2.6 s** measured; warm embedding request **3 ms**. A seven-fact cold backfill plus first lookup completed in roughly **1.5–2.7 s** in subsequent test runs.
- **Paraphrase:** query “A broken cycle requires maintenance” retrieved “The bicycle needs repair” with **0.6205 cosine similarity**, no lexical seed. Scoped recall took **6–12 ms** and excluded a printer fact and another owner's journal fact.
- **Chain:** Liora leads CobaltRelay → Liora coordinates BirchLedger → Noor reviews BirchLedger → Noor is available after lunch. Anchored traversal reached the preference at depth **3**; depth 1 could not. Hybrid search can sometimes find a middle fact semantically and use a shorter, still multi-step path.
- **Actual ChatGPT/Pi calls:** the paraphrase answer cited `900:100:0`; the CobaltRelay answer cited all four chain sources and explicitly said Noor was connected indirectly. Initial retrieval took **15 ms / 41 ms** respectively; total agent turns **6.05 s / 8.44 s**. The chain turn's initial lookup reached depth 3. No disconnected printer fact entered model context.
- Reopen retained vectors/index; backfill found zero stale facts. Tests cover exact source lookup, other-scope exclusion, no-match behavior, corrections and the old generic-context leak regression.

```sh
# Actual local vectors + real FalkorDB; creates/deletes only a synthetic graph.
PEBBLE_REAL_MEMORY=1 bun test runtime/memory-hybrid.test.ts
# Explicit opt-in real saved ChatGPT/Pi calls with synthetic data only.
PEBBLE_REAL_AGENT=1 bun test runtime/memory-hybrid-agent.test.ts
```

Limitations: the current native semantic model is English/macOS-specific; paraphrase quality and threshold sensitivity vary. ANN candidate limits and traversal budgets can omit relevant facts, with truncation reported. Shared normalized names are not full entity disambiguation. No new edge is inferred from embedding similarity, and retrieval does not prove a fact true. These checks are completed engineering evidence, not a recorded submission video.

Primary API references: [Apple sentence embedding](https://developer.apple.com/documentation/naturallanguage/nlembedding/sentenceembedding(for:)), [FalkorDB vector indexes](https://docs.falkordb.com/cypher/indexing/vector-index), [vector functions](https://docs.falkordb.com/cypher/functions).
