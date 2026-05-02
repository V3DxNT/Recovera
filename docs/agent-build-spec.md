# Recovera Agent Build Spec (Execution-Ready)

## Purpose
This document is written for an implementation agent. Follow tasks **in order**. Do not skip acceptance criteria. Do not move to the next phase unless current phase gates pass.

## Global Rules for the Agent
- Only change files listed in each task unless required by type errors.
- Keep changes minimal and incremental.
- After each task:
  - run lint/typecheck/tests relevant to changed files,
  - update checklist state in this document.
- Never implement auto-merge or direct production deployment.
- Safety policy is mandatory; if uncertain, route to human approval path.

## Repository Baseline (Already Exists)
- AWS integration flow:
  - `client/app/api/integration/setup/route.ts`
  - `client/app/api/integration/provision/route.ts`
- AWS infra helpers:
  - `client/lib/aws/CreateS3Bucket.ts`
  - `client/lib/aws/CreateIamRoles.ts`
  - `client/lib/aws/CreateFirehose.ts`
  - `client/lib/aws/CreateCloudWatch.ts`
- Mapping + schema foundations:
  - `client/lib/aws/repoMapper.ts`
  - `client/prisma/schema.prisma`

## Implementation Audit Snapshot (Current Repo)
This is the verified status based on current files in the repository.

### Completed Now
- [x] AWS credential flow implemented (`setup` + `user/credentials` APIs)
- [x] AWS provisioning flow implemented (`provision` API)
- [x] S3/IAM/Firehose/CloudWatch helper modules implemented
- [x] Resource discovery + repo mapping APIs implemented (`discover`, `mappings`)
- [x] Baseline schema for integration + mapping implemented (`CloudCredential`, `Integration`, `InstanceMapping`, `Repository`)

### Not Yet Implemented
- [ ] `client/app/api/ingest/logs/route.ts`
- [ ] `client/lib/ingest/*` normalization and publish modules
- [ ] `workers/log-processor.ts`
- [ ] Detection models (`Incident`, `IncidentEvent`, `DetectionAudit`)
- [ ] RCA modules/APIs (`client/lib/ai/*`, `api/incidents/*/analyze`)
- [ ] Retrieval modules/APIs (`client/lib/retrieval/*`, `api/retrieval/search`)
- [ ] Fix generator modules (`fixGenerator`, `patchValidator`)
- [ ] PR automation modules/APIs (`prCreator`, incident action route)
- [ ] Safety modules/audit models (`policyEngine`, `SafetyAuditLog`)

### Phase Completion Status
- [x] Phase 0 (Foundation/Integration Bootstrap) - Completed
- [ ] Phase 1 (Ingestion Runtime) - Not started
- [ ] Phase 2 (Detection Engine) - Not started
- [ ] Phase 3 (Root Cause Analyzer) - Not started
- [ ] Phase 4 (Retrieval Layer) - Not started
- [ ] Phase 5 (Fix Generator) - Not started
- [ ] Phase 6 (PR Creator) - Not started
- [ ] Phase 7 (Safety Layer) - Not started

---

## Phase 1: Ingestion Runtime

### Task 1.1 - Create ingest endpoint
**Implement:** `client/app/api/ingest/logs/route.ts`

Required behavior:
- Accept Firehose batch payload (`records[]` with base64 data).
- Decode, decompress when needed, parse JSON.
- Return fast success response.
- Mark malformed records with failure metadata for DLQ path.

Acceptance:
- [x] Endpoint exists and handles valid Firehose sample payload.
- [x] Invalid records do not crash entire batch.
- [ ] Response time target: p95 under 500ms for small test batches.

### Task 1.2 - Add normalized event contract
**Implement:** `client/lib/ingest/types.ts`, `client/lib/ingest/normalize.ts`

Add type:
- `NormalizedLogEvent`
  - `eventId`, `integrationId`, `logGroupName`, `logStreamName`, `messageRaw`, `timestamp`, `parseStatus`.

Acceptance:
- [x] All events are normalized into one internal shape.
- [x] `eventId` deterministic hashing implemented.

### Task 1.3 - Queue handoff + DLQ
**Implement:** `client/lib/ingest/publish.ts` (or equivalent)

Required:
- Publish normalized events for Step 2 worker.
- Failed parse events stored with reason for replay.

Acceptance:
- [x] Successful events are enqueued.
- [x] Failed events are persisted with error reason.

---

## Phase 2: Detection Engine

### Task 2.1 - Add data models
**Edit:** `client/prisma/schema.prisma`

Add:
- `Incident`
- `IncidentEvent`
- `DetectionAudit`

Acceptance:
- [ ] Migration generated and applied.
- [ ] Indexes added for `severity`, `status`, `lastSeenAt`, `fingerprint`.

### Task 2.2 - Build processor worker
**Implement:** `workers/log-processor.ts`

Required:
- Consume queue from Phase 1.
- Preprocess logs.
- Apply rule engine first.
- Fallback to LLM classifier only when rule confidence is low.

Acceptance:
- [ ] Worker processes batch input end-to-end.
- [ ] Rule-first then LLM-fallback ordering is enforced.

### Task 2.3 - Rule engine
**Implement:** `client/lib/detection/rules.ts`

Include baseline signatures:
- null pointer
- timeout
- connection refused
- rate limit
- auth failure

Acceptance:
- [ ] Unit tests for each signature.
- [ ] Severity mapping is deterministic.

---

## Phase 3: Root Cause Analyzer

### Task 3.1 - RCA service
**Implement:** `client/lib/ai/rootCauseAnalyzer.ts`

Input:
- incident data + representative logs + retrieval snippets.

Output schema (strict JSON):
- `rootCauseSummary`
- `likelyFiles[]`
- `fixStrategy[]`
- `confidence`
- `recommendedAction`

Acceptance:
- [ ] Schema validation added.
- [ ] Invalid model output is rejected/retried safely.

### Task 3.2 - Analyze API
**Implement:** `client/app/api/incidents/[id]/analyze/route.ts`

Acceptance:
- [ ] API returns stored RCA result.
- [ ] RCA output linked to incident record.

---

## Phase 4: Retrieval Layer

### Task 4.1 - Repo indexer
**Implement:** `workers/repo-indexer.ts`

Required:
- Full indexing on import.
- Incremental indexing on repo updates.

### Task 4.2 - Retrieval services
**Implement:**
- `client/lib/retrieval/embeddings.ts`
- `client/lib/retrieval/vectorStore.ts`
- `client/app/api/retrieval/search/route.ts`

Acceptance:
- [ ] Search returns ranked snippets with metadata (`path`, `symbol`, `sha`, `score`).
- [ ] RCA can consume retrieval output.

---

## Phase 5: Fix Generator

### Task 5.1 - Diff generation
**Implement:** `client/lib/ai/fixGenerator.ts`

Rules:
- Unified diff output only.
- Max changed files and lines.
- No protected path edits.

### Task 5.2 - Patch validation
**Implement:** `client/lib/ai/patchValidator.ts`

Validation:
- Parseable diff.
- Allowed paths only.
- Sandbox apply passes lint/build/tests.

Acceptance:
- [ ] Patch artifact and validation report persisted.
- [ ] Failed validation blocks PR creation.

---

## Phase 6: PR Creator

### Task 6.1 - PR automation service
**Implement:** `client/lib/github/prCreator.ts`

Steps:
1. Create branch
2. Apply patch
3. Commit
4. Push
5. Create PR

### Task 6.2 - PR action API
**Implement:** `client/app/api/incidents/[id]/action/route.ts` (or dedicated open-pr route)

Acceptance:
- [ ] PR includes incident + RCA + validation context.
- [ ] Incident action status lifecycle is tracked.

---

## Phase 7: Safety Layer

### Task 7.1 - Policy engine
**Implement:** `client/lib/safety/policyEngine.ts`

Policy outputs:
- `ALLOW_AUTO_PR`
- `REQUIRE_HUMAN_APPROVAL`
- `BLOCK_AND_ALERT`

Hard overrides:
- auth
- payments
- migrations
- secrets

### Task 7.2 - Approval + audit
**Implement:**
- Approval state in incident actions
- `SafetyAuditLog` model/table (or equivalent)

Acceptance:
- [ ] No PR action bypasses policy engine.
- [ ] Every policy decision logged with reason code.

---

## Test Gates (Mandatory Before Marking Phase Complete)
- [ ] Lint passes for changed packages
- [ ] Typecheck passes
- [ ] Unit tests for new modules pass
- [ ] Integration tests for new API routes pass
- [ ] No secrets or credentials committed

## Completion Definition
Project is complete only when:
- [ ] All phase acceptance boxes are checked
- [ ] `docs/plan.md` updated to reflect done status
- [ ] Demo flow works: log ingest -> incident -> RCA -> fix -> PR (policy-gated)
