# Recovera AutoSRE Master Plan

> Execution spec for implementation agents: `docs/agent-build-spec.md`

## Program Objective
Deliver an end-to-end autonomous SRE pipeline:
`Logs -> Detection -> RCA -> Retrieval -> Fix -> PR -> Safety-Gated Automation`

## Current Baseline (From Existing Repo)

### Implemented Foundation
- [x] AWS credential onboarding with encryption + STS verification
- [x] AWS provisioning (S3, IAM roles, Firehose, CloudWatch subscriptions)
- [x] Resource discovery and repo/resource mapping persistence
- [x] Provisioning rollback flow for partial failures

### Core Platform Gaps
- [ ] Runtime log ingest endpoint and normalization pipeline
- [ ] Incident schema + detection workers
- [ ] RCA orchestration with structured outputs
- [ ] Retrieval/indexing (vector + hybrid search)
- [ ] Fix generation + patch verification sandbox
- [ ] Automated GitHub PR action pipeline
- [ ] Central safety policy engine with auditability

## Current Completion Snapshot (Repo Audit)
- [x] Foundation/Integration bootstrap complete
- [ ] Phase 1 Ingestion Runtime
- [ ] Phase 2 Detection Engine
- [ ] Phase 3 Root Cause Analyzer
- [ ] Phase 4 Retrieval Layer
- [ ] Phase 5 Fix Generator
- [ ] Phase 6 PR Creator
- [ ] Phase 7 Safety and Governance

---

## Phase Execution Plan (Technical + Trackable)

## Phase 1 - Ingestion Reliability (Week 1-2)
Reference: `docs/step-1-log-ingestion-layer.md`

### Deliverables
- [ ] Implement `POST /api/ingest/logs`
- [ ] Firehose payload decoding and normalization
- [ ] Queue handoff for downstream workers
- [ ] DLQ and deduplication controls
- [ ] Ingestion SLO dashboards

### Exit Criteria
- [ ] Stable ingest under burst conditions
- [ ] Parse success >=99%
- [ ] Replay path for failed records

## Phase 2 - Detection Core (Week 2-4)
Reference: `docs/step-2-log-processing-issue-detection.md`

### Deliverables
- [ ] Incident-related Prisma models + migrations
- [ ] `workers/log-processor.ts`
- [ ] Rule engine and severity mapping
- [ ] LLM fallback classifier for unknown signatures
- [ ] Incident grouping/fingerprinting

### Exit Criteria
- [ ] Known errors classified deterministically
- [ ] Unknown errors receive confidence-based classification
- [ ] Incident queries functional by service/severity/time

## Phase 3 - RCA Intelligence (Week 4-5)
Reference: `docs/step-3-root-cause-analyzer.md`

### Deliverables
- [ ] RCA service + schema validation
- [ ] Context assembler (logs + deploys + history + retrieval)
- [ ] API endpoint `POST /api/incidents/:id/analyze`
- [ ] Replay evaluation harness

### Exit Criteria
- [ ] RCA output always parseable and evidence-backed
- [ ] Confidence routing is deterministic

## Phase 4 - Retrieval Layer (Week 5-7)
Reference: `docs/step-4-codebase-mapping.md`

### Deliverables
- [ ] Repo indexer worker (full + incremental)
- [ ] Embeddings adapter
- [ ] Vector store adapter
- [ ] Hybrid retrieval API + reranking
- [ ] RCA integration with top snippets

### Exit Criteria
- [ ] Retrieval p95 latency <=2s (target)
- [ ] Measurable Recall@K baseline established

## Phase 5 - Fix Generation (Week 7-8)
Reference: `docs/step-5-fix-generator.md`

### Deliverables
- [ ] Diff generator with strict constraints
- [ ] Patch validator (path/risk policy)
- [ ] Sandbox apply + lint/build/test runner
- [ ] Patch artifact persistence

### Exit Criteria
- [ ] Generated patches are parseable and policy-compliant
- [ ] Validation artifact generated for each fix attempt

## Phase 6 - PR Automation (Week 8-9)
Reference: `docs/step-6-pr-creator.md`

### Deliverables
- [ ] Branch/apply/commit/push automation
- [ ] PR creation API and template renderer
- [ ] Incident-action lifecycle persistence
- [ ] Notification hooks for success/failure

### Exit Criteria
- [ ] One call can create review-ready PR from validated patch
- [ ] PR is fully traceable to incident + RCA + validation evidence

## Phase 7 - Safety and Governance (Week 9-10)
Reference: `docs/step-7-safety-layer.md`

### Deliverables
- [ ] Policy engine with reason codes
- [ ] Human approval workflow for sensitive domains
- [ ] Circuit breaker and action quotas
- [ ] Safety audit logs and policy simulation tests

### Exit Criteria
- [ ] No unsafe automated PR path bypasses policy
- [ ] All decisions are auditable and explainable

---

## Milestone Checkpoints

## Milestone A: Observability MVP
- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Dashboard shows live incidents

## Milestone B: AI-Assisted SRE
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] RCA quality benchmark completed

## Milestone C: Auto-Remediation Beta
- [ ] Phase 5 complete
- [ ] Phase 6 complete
- [ ] Phase 7 complete
- [ ] Limited rollout enabled for low-risk services

---

## Immediate Priority Queue (Next Build Sprint)
- [ ] Build `POST /api/ingest/logs` with fixture tests
- [ ] Add incident schema + basic rule engine (top 10 signatures)
- [ ] Add initial incident list API/dashboard wiring
- [ ] Define safety threshold constants and reason codes early
