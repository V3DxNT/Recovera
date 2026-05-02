# Step 4: Codebase Mapping (Retrieval Layer)

## Objective
Map incident evidence to the most relevant source files/functions with high precision, enabling RCA and fix generation to operate on grounded code context.

## Current Implementation Status
**Status: Partially Implemented**

Implemented:
- AWS resource -> repository heuristic matching and persisted mapping.
- Integration/mapping APIs and schema support.

Missing:
- Code chunk indexing pipeline.
- Vector storage and retrieval service.
- Hybrid search/reranking endpoint for incident-time code lookup.

## Technical Design

### Mapping Layers
1. **Infrastructure mapping (available)**  
   `resource/logGroup -> repoFullName`
2. **Code retrieval mapping (to build)**  
   `incident evidence -> ranked code chunks`

### Indexing Pipeline
Trigger events:
- repo import,
- push webhook,
- manual reindex.

Pipeline:
1. Fetch repository at target commit SHA.
2. Parse files (language-aware where possible).
3. Chunk by token window + semantic boundaries.
4. Create embeddings for each chunk.
5. Upsert into vector store with metadata:
   - `repo`, `path`, `symbol`, `startLine`, `endLine`, `sha`, `chunkHash`, `lang`.

### Query/Retrieval Pipeline
Input:
- incident fingerprint,
- error message,
- stack frames,
- service/repo.

Retrieval steps:
1. Lexical prefilter (`path`, symbols, stack file hints).
2. Vector similarity search (`topK`).
3. Cross-encoder/reranker scoring.
4. Final context pack generation for Step 3/5.

Latency target:
- p95 <= 2s for `topK=20` retrieval in active repositories.

## Implementation Checklist

- [x] Persist resource/repo mappings (`Integration`, `InstanceMapping`, `Repository`)
- [ ] Add code index metadata models/tables (if needed) in Prisma
- [ ] Create `workers/repo-indexer.ts`
- [ ] Create `client/lib/retrieval/chunker.ts`
- [ ] Create `client/lib/retrieval/embeddings.ts` (provider abstraction)
- [ ] Create `client/lib/retrieval/vectorStore.ts` adapter
- [ ] Implement `POST /api/retrieval/search`
- [ ] Add reranker module for top result quality
- [ ] Add webhook-triggered incremental indexing
- [ ] Add stale-index detection using latest commit SHA
- [ ] Add retrieval quality tests (MRR/Recall@K on labeled incidents)

## Verification Criteria (Definition of Done)
- Fresh indexes are created on import and updated on push.
- Retrieval returns file-level and chunk-level grounded context.
- RCA receives high-relevance snippets with commit-aware metadata.
- Retrieval quality metrics are tracked and above baseline thresholds.

## Operational Risks and Controls
- **Stale index causes wrong context**
  - Control: commit SHA tracking + incremental reindex.
- **Context pollution from irrelevant chunks**
  - Control: hybrid retrieval + reranker + token budget caps.
- **Provider coupling**
  - Control: embedding/vector adapters with pluggable backends.
