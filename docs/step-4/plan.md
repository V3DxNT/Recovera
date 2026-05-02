# Step 4: Codebase Mapping - Implementation Plan

## Objective
Map incident evidence to the most relevant source files/functions with high precision, enabling RCA and fix generation to operate on grounded code context.

## Completed Implementation Checklist
- [x] Add code index metadata models/tables in Prisma (`CodeChunk` and `IndexJob`).
- [x] Create `workers/repo-indexer.ts` to clone and process repos in the background.
- [x] Create `client/lib/retrieval/chunker.ts` for overlap-based file splitting.
- [x] Create `client/lib/retrieval/embeddings.ts` integrating Gemini `text-embedding-004`.
- [x] Create `client/lib/retrieval/vectorStore.ts` for pgvector raw SQL operations.
- [x] Implement `POST /api/retrieval/search` endpoint for incident analysis retrieval.
- [x] Add reranker module (`client/lib/retrieval/reranker.ts`) leveraging Gemini (primary) and Groq (fallback).
- [x] Add webhook-triggered incremental indexing (`client/app/api/webhooks/github/route.ts`).

## Component Details

### 1. Vector Store & Database Layer
- **Prisma Schema Update**: Introduced `CodeChunk` and `IndexJob` models. `CodeChunk` uses PostgreSQL's `pgvector` (`Unsupported("vector(768)")`) to store embeddings alongside relational data.
- **vectorStore.ts**: Interacts with the `CodeChunk` table using raw Prisma SQL queries to efficiently bulk-insert vectors and search via Cosine distance operations (`<=>`).

### 2. Retrieval Core
- **embeddings.ts**: Integrates Google Generative AI REST API to generate embeddings using Gemini's `text-embedding-004` model. Supports batch generation to adhere to rate limits.
- **chunker.ts**: Built a line-based chunking strategy. It chunks the file content into 50-line windows with a 10-line sliding overlap to preserve context boundaries.
- **reranker.ts**: An intelligent reranker leveraging the existing `callLLM` structure. Evaluates retrieved chunks and scores them based on how well they match the incident context.

### 3. Execution Engines
- **repo-indexer.ts**: A worker script that safely clones a target repository, strips irrelevant files, chunks the codebase, generates embeddings in batches, and updates the `IndexJob` status.
- **Search API (route.ts)**: A `POST` endpoint designed for Step 3. It accepts incident context, fetches vector candidates, reranks them using the LLM, and returns the top refined snippets.
- **Webhook API (route.ts)**: Listens for GitHub `push` events to trigger the `repo-indexer` worker asynchronously.
