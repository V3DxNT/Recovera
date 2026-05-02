# Step 6: PR Creator

## Objective
Automatically convert validated fixes into review-ready pull requests with complete technical traceability back to incidents.

## Current Implementation Status
**Status: Not Implemented**

GitHub auth/repo fetch exists, but no automated patch-to-PR execution path exists.

## Technical Design

### PR Creation Workflow
1. Resolve repository and default branch.
2. Create feature branch: `auto-fix/inc-<incidentId>-<slug>`.
3. Apply validated patch artifact from Step 5.
4. Commit with standardized message and signed metadata.
5. Push branch.
6. Create PR with structured incident report.
7. Persist PR linkage in incident action records.

### Required PR Body Sections
- Incident ID and severity
- RCA summary and confidence
- Files changed and rationale
- Validation evidence (lint/build/tests)
- Risk/rollback plan
- Reviewer checklist

### Data Model Extensions (Suggested)
- `IncidentAction`
  - `actionType` (`open_pr`)
  - `status` (`pending` | `opened` | `failed` | `merged` | `closed`)
  - `branchName`, `commitSha`, `prUrl`, `providerResponse`, `failureReason`

### Failure Handling
- If branch push fails -> mark failed, attach provider error.
- If PR creation fails after push -> optionally keep branch and notify human.
- If checks fail after PR open -> add comment + route to manual triage.

## Implementation Checklist

- [ ] Create `client/lib/github/prCreator.ts`
- [ ] Implement branch create/apply/commit/push sequence
- [ ] Implement `POST /api/incidents/:id/actions/open-pr`
- [ ] Add PR body renderer from incident/RCA/validation artifacts
- [ ] Persist action lifecycle in DB
- [ ] Add retry strategy for transient GitHub API failures
- [ ] Add scope preflight checks (repo write, pull_request write)
- [ ] Add notifications (Slack/email) for open/fail events
- [ ] Add end-to-end test against a staging repository

## Verification Criteria (Definition of Done)
- Validated patch can be turned into PR in one API call.
- PR includes reproducible evidence and clear review instructions.
- Incident timeline reflects PR lifecycle in near real-time.
- Failure paths are observable and recoverable without manual DB edits.

## Operational Risks and Controls
- **PRs opened for weak fixes**
  - Control: Step 7 policy gate before PR action.
- **Conflict with fast-moving base branch**
  - Control: bounded rebase/retry policy.
- **Insufficient token scopes**
  - Control: startup preflight and actionable error messaging.
