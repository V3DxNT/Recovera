// Parses the raw output from the LLM, ensuring it conforms to the expected schema. It handles common issues like markdown fences, malformed JSON, missing fields, and out-of-range confidence values. The parser also coerces unknown actions to "unknown" and provides detailed error information for debugging and fallback handling.

import { z } from "zod";
import { AgentOutput, ParseError, ActionType } from "./types";

const agentOutputSchema = z.object({
  rootCauseSummary: z.string(),
  failureMechanism: z.string(),
  likelySubsystem: z.string(),
  likelyFiles: z.array(z.object({
    path: z.string(),
    reason: z.string(),
    confidence: z.number(),
  })),
  fixStrategy: z.array(z.string()),
  recommendedAction: z.string(),
  confidence: z.number(),
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
    "generate_fix",
    "rollback",
    "human_only",
    "alert_only",
    "unknown"
  ];
  
  let finalAction = data.recommendedAction as ActionType;
  if (!validActions.includes(data.recommendedAction)) {
    console.warn(`Unknown action received from LLM: ${data.recommendedAction}. Coercing to 'unknown'.`);
    finalAction = "unknown";
  }

  return {
    rootCauseSummary: data.rootCauseSummary,
    failureMechanism: data.failureMechanism,
    likelySubsystem: data.likelySubsystem,
    likelyFiles: data.likelyFiles,
    fixStrategy: data.fixStrategy,
    recommendedAction: finalAction,
    confidence: data.confidence,
    evidence: data.evidence,
  };
}
