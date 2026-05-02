# Step 2: Log Processing and Issue Detection

## Objective
Convert normalized logs into high-signal incident records with deterministic classification for known failures and controlled LLM fallback for unknown signatures.

## Current Implementation Status
**Status: Not Implemented (Detection Core Missing)**

Current foundation exists for integration + mapping, but there is no:
- log processing worker,
- incident data model,
- rule engine,
- severity policy,
- incident grouping/fingerprinting module.

## Technical Design

### Processing Architecture
Input: normalized events from Step 1 queue/topic.

Pipeline stages:
1. **Preprocessing**
   - Normalize timestamp and service identity.
   - Extract stack traces and error lines.
2. **Rule Engine**
   - Match regex signatures with weighted confidence.
3. **Fallback Classifier (LLM)**
   - Only for unmatched/ambiguous events.
4. **Fingerprinting + Grouping**
   - Convert event into incident key.
5. **Incident Persistence**
   - Create/update incident state machine.

### Suggested Incident State Machine
- `open` -> `investigating` -> `mitigated` -> `resolved`
- `open` -> `ignored` (for non-actionable noise)

### Suggested Prisma Model Additions
- `Incident`
  - `id`, `projectId`, `fingerprint`, `title`, `severity`, `status`, `firstSeenAt`, `lastSeenAt`, `eventCount`, `confidence`
- `IncidentEvent`
  - `id`, `incidentId`, `eventId`, `rawExcerpt`, `stackTop`, `detectedAt`
- `DetectionAudit`
  - `id`, `eventId`, `engine` (`rule` | `llm`), `label`, `confidence`, `explanation`, `createdAt`

### Rule Engine Requirements
- Signature format:
  - `id`, `name`, `pattern`, `languageScope`, `severity`, `confidenceBase`
- Example classes:
  - `null_pointer`, `timeout`, `connection_refused`, `oom_kill`, `syntax_error`, `rate_limit`, `auth_error`
- Severity mapping should include environment impact:
  - auth/payment paths elevate baseline severity.

### Fingerprinting Strategy
Fingerprint hash input:
- normalized error message template (numbers/UUID stripped),
- top stack frame (`file:function:line`),
- service/repo key.

This prevents cross-service collision and reduces over-grouping.

## Implementation Checklist

- [ ] Add `Incident`, `IncidentEvent`, `DetectionAudit` models to Prisma schema
- [ ] Create migration and validate indexes for query performance
- [ ] Build `workers/log-processor.ts` consumer
- [ ] Create `client/lib/detection/preprocess.ts` (stack/error extraction)
- [ ] Create `client/lib/detection/rules.ts` and signature registry
- [ ] Add rule confidence + severity mapping policy
- [ ] Create `client/lib/detection/fingerprint.ts`
- [ ] Implement incident upsert/grouping logic
- [ ] Create LLM fallback `client/lib/detection/classifier.ts`
- [ ] Add cost guardrails (max fallback calls / minute / service)
- [ ] Add unit tests for top 20 error signatures
- [ ] Add replay tests with historical logs to measure precision/recall

## Verification Criteria (Definition of Done)
- >=80% of frequent production error types classified by rule engine without LLM.
- Unknown errors are classified with explicit confidence and rationale.
- Incident grouping has low collision rate across services.
- Incident query API supports filters by severity/status/service/time.

## Operational Risks and Controls
- **False positive flood from noisy logs**
  - Control: open incident only after threshold (`N` events in `T` minutes).
- **LLM spend and latency escalation**
  - Control: strict fallback gating and prompt size budget.
- **Incorrect grouping merges distinct failures**
  - Control: include service + stack anchor in fingerprint input.
