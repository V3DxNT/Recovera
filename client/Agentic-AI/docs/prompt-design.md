# Prompt Design

The system prompt is located at \`prompts/system-prompt.ts\`.

## Structure
1. **Role**: Anchors the LLM to an SRE persona.
2. **Task**: Instructs the LLM to diagnose the issue based on logs and resource state.
3. **Output Format**: Strictly enforces a JSON schema (\`AgentOutput\`) with specific types (e.g. \`confidence\` must be a float).
4. **Constraints**:
   - Outlines valid actions.
   - Enforces the use of provided evidence only (prevents hallucination).
5. **Confidence Calibration**: Maps explicit scenarios to confidence bands (e.g. direct evidence = 0.75-0.90).
6. **Examples**: Injects few-shot prompting via \`few-shot-examples.ts\` (S3_PUBLIC positive case, UNKNOWN negative case).

This structure ensures deterministic, structured output across both Gemini and Groq models.

