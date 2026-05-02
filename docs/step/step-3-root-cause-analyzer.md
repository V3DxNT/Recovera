# Step 3: Root Cause Analyzer (AI Brain)

## Objective
Produce machine-actionable root cause analysis from incidents by combining log evidence, deployment context, historical incidents, and retrieval-backed code context.

## Current Implementation Status
**Status: Not Implemented**

No RCA orchestration, prompt templates, or structured output persistence currently exists.

## Technical Design

### RCA Input Bundle
For each incident, construct a deterministic context payload:
- Incident metadata (`severity`, `service`, `firstSeen`, `eventCount`, fingerprint)
- Representative log excerpts (top N by error density)
- Stack traces (deduplicated by top frame)
- Deployment metadata (recent commits, deploy window overlap)
- Historical nearest incidents (same fingerprint or semantic similarity)
- Retrieved code snippets from Step 4 (`path`, `symbol`, `score`, `sha`)

### RCA Output Schema (Strict JSON)
- `rootCauseSummary`: string
- `failureMechanism`: string
- `likelySubsystem`: string
- `likelyFiles`: array of `{ path, reason, confidence }`
- `fixStrategy`: array of ordered steps
- `recommendedAction`: `generate_fix` | `rollback` | `human_only`
- `confidence`: number (0-1)
- `evidence`: array of evidence references (log/deploy/code snippet IDs)

### Prompting and Guardrails
- Use constrained system prompt with explicit "do not guess outside evidence".
- Reject outputs without evidence alignment.
- Require at least one cited code snippet when recommending file-level changes.

### Execution Modes
- **Synchronous API mode:** manual "Analyze" trigger from dashboard.
- **Async worker mode:** auto-analyze when incident crosses severity threshold.

## Implementation Checklist

- [ ] Create `client/lib/ai/rootCauseAnalyzer.ts`
- [ ] Define runtime validator for RCA JSON schema
- [ ] Create prompt templates per incident class
- [ ] Build context assembler (`logs + deploy + history + retrieval`)
- [ ] Implement `POST /api/incidents/:id/analyze`
- [ ] Persist RCA output on incident (with versioning)
- [ ] Add retry strategy for transient provider/API errors
- [ ] Add hallucination checks (must cite evidence IDs)
- [ ] Add offline replay suite for RCA quality evaluation
- [ ] Add scoring dashboard metrics (precision@1 for likely file, confidence calibration)

## Verification Criteria (Definition of Done)
- RCA output is consistently parseable against schema.
- Recommended files/modules are retrieval-backed, not hallucinated.
- Confidence correlates with measured RCA accuracy over replay set.
- Routing (`generate_fix` vs `human_only`) is deterministic from policy thresholds.

## Operational Risks and Controls
- **Hallucinated causal chains**
  - Control: evidence-citation requirement and output rejection.
- **Prompt drift or unstable format**
  - Control: schema validation + strict retry with repair prompt.
- **Overconfident wrong recommendation**
  - Control: confidence calibration and Step 7 policy enforcement.
