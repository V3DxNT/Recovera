# Decision Logic & Routing

The decision engine evaluates the output of the RCA module and deterministically routes the agent's action.

## Safety Classes
- `safe`: Allowed to auto-fix (e.g. \`fix_s3_public_access\`).
- `needs_approval`: Requires human intervention (e.g. \`restrict_iam_policy\`).
- `blocked`: Forbidden from execution.

## Routing Rules
Execution evaluates in the following exact order:
1. **ParseError**: -> \`alert_only\`
2. **Unknown Action**: -> \`alert_only\`
3. **Blocked Action**: -> \`alert_only\`
4. **Low Confidence**: (\`< 0.60\`) -> \`alert_only\`
5. **Auto Fix**: (\`>= 0.85\` AND \`safe\`) -> \`auto_fix\`
6. **Approval Required**: (\`>= 0.60\` AND \`needs_approval\`) -> \`approval_required\`
7. **Default Fallback**: -> \`alert_only\`

These boundaries are strictly enforced. A confidence of 0.849 will never result in an auto fix.

