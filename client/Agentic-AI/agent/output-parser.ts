// Parses the raw output from the LLM, ensuring it conforms to the expected schema. It handles common issues like markdown fences, malformed JSON, missing fields, and out-of-range confidence values. The parser also coerces unknown actions to "unknown" and provides detailed error information for debugging and fallback handling.

import { z } from "zod";
import { AgentOutput, ParseError, ActionType } from "./types";

const agentOutputSchema = z.object({
  root_cause: z.string(),
  confidence: z.number(),
  action: z.string(),
  reasoning: z.string(),
  requires_approval: z.boolean(),
  evidence: z.array(z.string()),
});

function stripMarkdownFences(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

export function parseAgentOutput(raw: string): AgentOutput | ParseError {
  if (!raw || raw.trim() === "") {
    return {
      kind: "ParseError",
      reason: "parse_error",
      raw
    };
  }

  const cleaned = stripMarkdownFences(raw);
  
  let parsedJson;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (e) {
    return {
      kind: "ParseError",
      reason: "parse_error",
      raw: cleaned
    };
  }

  const result = agentOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      kind: "ParseError",
      reason: "parse_error",
      raw: cleaned,
      field: firstError?.path[0]?.toString() || "unknown"
    };
  }

  let data = result.data;

  // Clamp confidence
  if (typeof data.confidence !== "number" || isNaN(data.confidence) || data.confidence < 0 || data.confidence > 1) {
    data.confidence = 0.40;
  } else if (data.confidence > 0.93) {
    data.confidence = 0.93;
  }

  // Coerce action
  const validActions = [
    "fix_s3_public_access",
    "restrict_iam_policy",
    "close_security_group_port",
    "alert_only",
    "unknown"
  ];
  
  let finalAction = data.action as ActionType;
  if (!validActions.includes(data.action)) {
    console.warn(`Unknown action received from LLM: ${data.action}. Coercing to 'unknown'.`);
    finalAction = "unknown";
  }

  return {
    root_cause: data.root_cause,
    confidence: data.confidence,
    action: finalAction,
    reasoning: data.reasoning,
    requires_approval: data.requires_approval,
    evidence: data.evidence,
  };
}
