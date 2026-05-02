# Step 5: Fix Generator

## Objective
Generate constrained, reviewable patches that directly address RCA findings while minimizing blast radius.

## Current Implementation Status
**Status: Not Implemented**

No fix generation, patch validation, or sandbox verification modules are present.

## Technical Design

### Input Bundle
- Incident record + RCA output from Step 3.
- Retrieved snippets and metadata from Step 4.
- Repo constraints:
  - language/toolchain,
  - lint rules,
  - test commands,
  - protected paths.

### Output Bundle
- `patchDiff` (unified diff)
- `changeSummary`
- `riskScore` (0-1)
- `validationPlan` (which checks to run)

### Generation Constraints
- Max files changed (suggest: <=3 for first version).
- Max lines changed (suggest: <=120).
- Must not touch blocked paths:
  - `prisma/migrations`,
  - secret/config vault files,
  - auth/payment core without human gate.
- Must include null/edge handling where relevant.

### Validation Pipeline
1. Parse diff and enforce policy.
2. Apply patch in isolated worktree/sandbox.
3. Run:
   - lint,
   - typecheck/build,
   - targeted tests,
   - optional generated regression test.
4. Produce signed validation artifact for Step 6.

## Implementation Checklist

- [ ] Create `client/lib/ai/fixGenerator.ts`
- [ ] Define strict diff output contract and parser
- [ ] Create `client/lib/ai/patchValidator.ts`
- [ ] Add blocked-path and blast-radius policy checks
- [ ] Build sandbox worktree apply runner
- [ ] Add lint/typecheck/test command orchestration
- [ ] Add optional regression test generator
- [ ] Persist patch + validation artifact to DB
- [ ] Add replay suite for patch quality on historical incidents
- [ ] Add policy metrics (pass rate, rollback rate, false-fix rate)

## Verification Criteria (Definition of Done)
- Generated diffs are parseable and policy-compliant.
- Sandbox checks pass before PR flow is allowed.
- Fixes are minimal and directly linked to RCA evidence.
- Validation artifact is attached for audit and reviewer trust.

## Operational Risks and Controls
- **Overbroad or unrelated edits**
  - Control: hard caps on file/line changes.
- **Patch compiles but breaks behavior**
  - Control: targeted tests + generated regression case.
- **Unsafe path modifications**
  - Control: blocked-path policy + mandatory human approval override.
