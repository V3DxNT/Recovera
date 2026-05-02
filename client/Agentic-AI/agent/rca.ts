// Main logic for running the Root Cause Analysis (RCA) agent, including pre-evaluation checks, LLM invocation, output parsing, and post-evaluation adjustments. It handles special cases for unknown events and missing data, ensuring robust performance even in edge cases.

import { AgentInput, AgentOutput, ParseError } from "./types";
import { callLLM } from "./llm-caller";
import { parseAgentOutput } from "./output-parser";
import { buildSystemPrompt } from "../prompts/system-prompt";

export async function runRCA(input: AgentInput): Promise<AgentOutput | ParseError> {
  // Special-case 1: UNKNOWN event
  if (input.event === "UNKNOWN") {
    return {
      root_cause: "Event type unknown. Manual review required.",
      confidence: 0.30,
      action: "alert_only",
      reasoning: "The event type is unrecognized and no resource state or logs are available to diagnose the issue.",
      requires_approval: true,
      evidence: []
    };
  }

  // Pre-evaluation checks
  const isConfigEmpty = !input.resource_state.config || Object.keys(input.resource_state.config).length === 0;
  const isLogsEmpty = !input.logs || input.logs.trim() === "";

  const systemPrompt = buildSystemPrompt();
  
  // Call LLM
  // (Note: repo_context is already handled by llm-caller formatUserMessage)
  const rawResponse = await callLLM(input, systemPrompt);
  
  // Parse output
  const parsed = parseAgentOutput(rawResponse);
  
  if (parsed.kind === "ParseError") {
    return parsed;
  }

  const output = parsed as AgentOutput;

  // Post-evaluation adjustments
  // Special-case 2: Floor confidence to 0.45 if config is empty
  if (isConfigEmpty && output.confidence < 0.45) {
    output.confidence = 0.45;
  }

  // Special-case 3: Append reasoning if logs are empty
  if (isLogsEmpty) {
    output.reasoning = `${output.reasoning.trim()} No log data provided. Diagnosis based on resource state only.`;
  }

  return output;
}
