# Step 7: Safety Layer (Mandatory)

## Objective
Enforce non-bypassable safety policies so autonomous remediation remains bounded, auditable, and human-governed where risk is high.

## Current Implementation Status
**Status: Partially Implemented**

Implemented:
- Provisioning rollback logic for failed AWS setup.
- Integration status/error propagation.

Missing:
- Policy decision engine for RCA/fix/PR flow.
- Confidence and domain-based approval gates.
- Automated action quotas and circuit breakers.
- Full audit trail for safety decisions.

## Technical Policy Design

### Decision Inputs
- Incident severity and service criticality.
- RCA confidence and evidence quality.
- Patch validation report (lint/build/test).
- File/path risk classification.
- Recent action history for this incident/service.

### Policy Outputs
- `ALLOW_AUTO_PR`
- `REQUIRE_HUMAN_APPROVAL`
- `BLOCK_AND_ALERT`

With mandatory `reasonCodes` for explainability.

### Baseline Thresholds
- `confidence < 0.70` -> `BLOCK_AND_ALERT`
- `0.70 <= confidence < 0.85` -> `REQUIRE_HUMAN_APPROVAL`
- `confidence >= 0.85` + checks pass + non-critical domain -> `ALLOW_AUTO_PR`

### Hard Overrides (Always Human)
- AuthN/AuthZ core modules
- Payment/billing flows
- Migration/data destructive files
- Secret/key management paths

### Runtime Safety Controls
- Max automated attempts per incident (suggest 2).
- Cooldown between attempts (suggest 10 minutes).
- Global circuit breaker when failure rate exceeds threshold (for example, >30% in 1h).

## Implementation Checklist

- [ ] Create `client/lib/safety/policyEngine.ts`
- [ ] Implement deterministic rule evaluation + reason codes
- [ ] Add path/domain risk classifier (`auth`, `payments`, `migrations`, `secrets`)
- [ ] Add `requiresApproval` state in action workflow
- [ ] Add dashboard approval/reject controls with audit comments
- [ ] Add action quota and cooldown enforcement
- [ ] Add global circuit breaker state management
- [ ] Persist policy decisions to `SafetyAuditLog`
- [ ] Add policy simulation tests against historical incidents
- [ ] Add SLO dashboards (auto-fix success, blocked rate, false-fix rate)

## Verification Criteria (Definition of Done)
- No PR action can bypass policy engine.
- High-risk domains always require human approval.
- All safety decisions are queryable with timestamp, inputs, and reason codes.
- Circuit breaker reliably halts automation in degraded periods.

## Operational Risks and Controls
- **Overly strict policy lowers automation value**
  - Control: tune via replay/simulation against historical data.
- **Overly permissive policy allows risky changes**
  - Control: conservative default thresholds + hard domain overrides.
- **Undebuggable policy behavior**
  - Control: mandatory structured audit logs for every decision.
