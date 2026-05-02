# Step 4: Codebase Mapping (Retrieval Layer)

## Objective
Map incident evidence to the most relevant source files/functions with high precision, enabling RCA and fix generation to operate on grounded code context.

## Current Implementation Status
**Status: Completed (Branch: Step-4-Mapping)**

### Implemented in this step:
- `CodeChunk` and `IndexJob` Prisma models with pgvector (`vector(768)`) embedding storage.
- `lib/retrieval/chunker.ts` — sliding window (50 lines, 10-line overlap) code file chunker.
- `lib/retrieval/embeddings.ts` — Gemini `text-embedding-004` REST caller with single and batch generation.
- `lib/retrieval/vectorStore.ts` — pgvector adapter for chunk upsert and cosine similarity search (`<=>`).
- `lib/retrieval/reranker.ts` — LLM-based reranker using Gemini (primary) → Groq (fallback).
- `workers/repo-indexer.ts` — background worker: clone repo → chunk files → generate embeddings → upsert to pgvector.
- `app/api/retrieval/search/route.ts` — `POST /api/retrieval/search` for incident-time semantic code lookup.
- `app/api/webhooks/github/route.ts` — GitHub push webhook handler that triggers incremental indexing.
- `.env.example` updated with all required keys.

### Key Files

| File | Purpose |
|------|---------|
| `client/prisma/schema.prisma` | Added `CodeChunk`, `IndexJob` models and pgvector extension |
| `client/lib/retrieval/chunker.ts` | Splits source files into overlapping line chunks |
| `client/lib/retrieval/embeddings.ts` | Calls Gemini `text-embedding-004` for embedding generation |
| `client/lib/retrieval/vectorStore.ts` | pgvector raw SQL upsert and cosine distance search |
| `client/lib/retrieval/reranker.ts` | LLM reranker (Gemini → Groq fallback) to score retrieved chunks |
| `client/workers/repo-indexer.ts` | Full pipeline: clone → chunk → embed → upsert into pgvector |
| `client/app/api/retrieval/search/route.ts` | Search endpoint for RCA and fix generation context |
| `client/app/api/webhooks/github/route.ts` | GitHub push webhook triggering incremental reindex |

## Technical Design

### AI Provider Strategy
- **Embeddings**: Gemini `text-embedding-004` only. (Groq does not support embedding models — throws explicitly if Gemini key is missing.)
- **Reranking**: `callLLM()` from the Agentic-AI module — Gemini as primary, Groq as fallback.
- **Mock mode**: Set `AGENT_MOCK=true` to skip real LLM calls during local development.

### Indexing Pipeline
Trigger events:
- GitHub `push` webhook (incremental reindex at new commit SHA),
- manual `POST /api/retrieval/search` call triggers embedding of the query.

Pipeline:
1. `repo-indexer.ts` — git clone at target commit SHA into a temp dir.
2. Recursively list all valid text/code files (`.ts`, `.js`, `.py`, `.go`, etc.).
3. `chunker.ts` — split each file into 50-line windows with 10-line overlap.
4. `embeddings.ts` — `generateEmbeddingsBatch()` in groups of ≤100 (API limit).
5. `vectorStore.ts` — delete old chunks for the repo, upsert new ones via raw pgvector SQL.
6. `IndexJob` updated to `completed` or `failed` with error detail.

### Query/Retrieval Pipeline
Input (`POST /api/retrieval/search`):
- `repositoryId` — Prisma `Repository.id`
- `incidentContext` — free-text incident evidence (logs + stack frames + error message)
- `topK` (default: 20) — candidates from vector search
- `rerankTopK` (default: 5) — final chunks returned after reranking

Steps:
1. `generateEmbedding(incidentContext)` → Gemini query vector.
2. Cosine distance search (`<=>`) against `CodeChunk.embedding` for the repository.
3. `rerankChunks()` — LLM evaluates and scores each candidate chunk against the incident context.
4. Returns top `rerankTopK` chunks with `relevanceScore` and `reasoning`.

Latency target:
- p95 ≤ 2s for `topK=20` retrieval in active repositories.

## Environment Variables Required

```env
## ── Gemini AI (Primary LLM + Embeddings for Step 4) ─────────────────
GEMINI_API_KEY=                    # get from https://aistudio.google.com/app/apikey
GEMINI_MODEL=gemini-1.5-flash      # optional, defaults to gemini-1.5-flash

## ── Groq (Fallback LLM for reranking only) ──────────────────────────
GROQ_API_KEY=                      # get from https://console.groq.com
GROQ_MODEL=llama-3.1-8b-instant    # optional

## ── GitHub Webhook ───────────────────────────────────────────────────
GITHUB_WEBHOOK_SECRET=             # set when registering GitHub App webhook

## ── Agent Flags ──────────────────────────────────────────────────────
AGENT_MOCK=false                   # set to "true" to skip LLM calls in dev
```

## Database Setup Required

Before using the retrieval layer, ensure pgvector is enabled on your Postgres instance:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run:
```bash
npx prisma db push
# or
npx prisma migrate dev --name add-codebase-mapping
```

## Implementation Checklist

- [x] Add `CodeChunk` and `IndexJob` models to Prisma schema with `pgvector` extension
- [x] Run `npx prisma generate` to regenerate the client
- [x] Create `client/lib/retrieval/chunker.ts` (sliding window chunker)
- [x] Create `client/lib/retrieval/embeddings.ts` (Gemini `text-embedding-004`, single + batch)
- [x] Create `client/lib/retrieval/vectorStore.ts` (pgvector cosine search adapter)
- [x] Create `client/lib/retrieval/reranker.ts` (Gemini primary, Groq fallback)
- [x] Create `client/workers/repo-indexer.ts` (clone → chunk → embed → upsert pipeline)
- [x] Implement `POST /api/retrieval/search` endpoint
- [x] Implement `POST /api/webhooks/github` push webhook handler
- [x] Update `.env.example` with all new required variables
- [ ] Run Prisma migration on production DB (`CREATE EXTENSION IF NOT EXISTS vector`)
- [ ] Add retrieval quality tests (Recall@K / MRR on labeled incidents)
- [ ] Add stale-index detection using latest commit SHA (incremental diff-only reindex)

## Verification Criteria (Definition of Done)
- Fresh indexes are created when a repository is imported.
- Indexes are updated on every push webhook at the new commit SHA.
- `POST /api/retrieval/search` returns file-level and chunk-level grounded context within 2s p95.
- RCA (`lib/ai/rootCauseAnalyzer.ts`) receives high-relevance snippets via the code retrieval stub.
- Retrieval quality metrics (Recall@5) are tracked and above baseline thresholds.

## Operational Risks and Controls
- **Stale index causes wrong context**
  - Control: `IndexJob` commit SHA tracking + full reindex on push webhook.
- **Context pollution from irrelevant chunks**
  - Control: cosine similarity prefilter (topK=20) + LLM reranker + token budget caps.
- **Provider coupling (embeddings have no Groq fallback)**
  - Control: `AGENT_MOCK=true` bypasses Gemini in dev. Throw explicitly if key is missing in prod.
- **Serverless timeout killing long-running indexer**
  - Control: fire-and-forget async execution. Long-term: push job to SQS queue.
- **Large monorepo indexing cost**
  - Control: batch embeddings (≤100/call), file type filtering, skip `node_modules`/`dist`/`.git`.
