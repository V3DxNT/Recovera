# Agent Flow Model

The Agentic AI layer is designed as a stateless, idempotent pipeline.

## Flow
1. **Invocation**: Person 1 invokes \`runAgent(input)\` with the incident payload and status.
2. **Mock Check**: If \`AGENT_MOCK=true\`, returns a hardcoded \`DiagnosticReport\`.
3. **Idempotency Guard**: 
   - If \`incident_status === "done"\`, returns an "already_resolved" skip report.
   - If \`incident_status === "running"\`, returns an "execution_in_progress" skip report.
4. **RCA (Root Cause Analysis)**:
   - Processes heuristics (e.g. UNKNOWN events skip LLM).
   - Calls Gemini (falls back to Groq).
   - Parses the JSON response via Zod.
5. **Decision Engine**:
   - Maps the action against the safety registry.
   - Evaluates confidence score to determine the \`DecisionPath\` (\`auto_fix\`, \`approval_required\`, \`alert_only\`).
6. **Verification**:
   - If \`auto_fix\` was chosen, deterministically checks the \`post_fix_state\` against hardcoded rules.
7. **Reporter**:
   - Synthesises the \`DiagnosticReport\`, calculating the risk score and formatting the Slack payload.
   - Wraps the entire flow in a global try/catch to guarantee a valid report is always returned.

