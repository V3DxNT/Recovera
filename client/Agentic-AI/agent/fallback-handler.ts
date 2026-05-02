// Fallback handler for the AI agent, responsible for generating 
// a structured response when the agent encounters an error during execution. 
// It categorizes the failure reason (e.g., parse errors, LLM errors, unknown actions) 
// and formats a response that can be used to alert users or trigger alternative workflows. 
// The handler ensures that even in failure scenarios, the system provides meaningful feedback 
// and maintains a consistent response structure.

import { AgentInput, FallbackResponse, FailureReason } from "./types";
import { LLMError } from "./errors";

export function handleFailure(error: unknown, input: AgentInput): FallbackResponse {
  let reason: FailureReason = "unknown_action"; // default generic fallback
  let message = "An unknown error occurred during agent execution.";

  if (error && typeof error === "object" && "kind" in error) {
    if (error.kind === "ParseError") {
      reason = (error as any).reason || "parse_error";
      message = "Failed to parse structured LLM response.";
    } else if (error instanceof LLMError) {
      reason = error.reason;
      message = error.message;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return {
    kind: "FallbackResponse",
    path: "alert_only",
    reason,
    message,
    original_input: input
  };
}
