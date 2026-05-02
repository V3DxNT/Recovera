# Test Scenarios

The testing suite covers 12 core scenarios without making real API calls:

1. **S3_PUBLIC happy path**: Validates \`decision_path === "auto_fix"\` and \`requires_human_review === false\`.
2. **Low confidence**: Validates \`confidence <= 0.60\` results in \`alert_only\`.
3. **Malformed LLM response**: Validates \`runAgent\` resolves safely with \`action_taken === "alert_only"\`.
4. **Blocked action**: Validates \`decision_path === "alert_only"\` with \`reason === "blocked_action"\`.
5. **High confidence, needs-approval action**: Validates \`decision_path === "approval_required"\`.
6. **Verification failure**: Validates \`resolved === false\` correctly triggers \`requires_human_review === true\`.
7. **Both providers fail**: Validates safe resolution with reason \`"both_providers_failed"\`.
8. **UNKNOWN event**: Validates LLM is not called, \`confidence === 0.30\`.
9. **Mock mode**: Validates \`AGENT_MOCK=true\` returns valid fixture without LLM calls.
10. **Confidence boundary 0.85**: Validates inclusive boundary results in \`auto_fix\`.
11. **SlackPayload shape**: Validates 6 blocks are present.
12. **Idempotency guard**: Validates \`status: "done"\` skips LLM and returns \`skip_reason === "already_resolved"\`.

