// Main logic for running the Root Cause Analysis (RCA) agent, including pre-evaluation checks, LLM invocation, output parsing, and post-evaluation adjustments. It handles special cases for unknown events and missing data, ensuring robust performance even in edge cases.

import { AgentInput, AgentOutput, ParseError } from "./types";
import { callLLM } from "./llm-caller";
import { parseAgentOutput } from "./output-parser";
import { buildSystemPrompt } from "../prompts/system-prompt";

export async function runRCA(input: AgentInput): Promise<AgentOutput | ParseError> {
  // Special-case 1: UNKNOWN event
  if (input.event === "UNKNOWN") {
    return {
      rootCauseSummary: "Event type unknown. Manual review required.",
      failureMechanism: "Unknown",
      likelySubsystem: "Unknown",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "alert_only",
      confidence: 0.30,
      evidence: []
    };
  }

  // Pre-evaluation checks
  const isConfigEmpty = !input.resource_state.config || Object.keys(input.resource_state.config).length === 0;
  const isLogsEmpty = !input.logs || input.logs.trim() === "";

  const systemPrompt = buildSystemPrompt();
  
  // Call LLM
  console.log(`[RCA] 🤖 Calling LLM with system prompt (${systemPrompt.length} chars)...`);
  const rawResponse = await callLLM(input, systemPrompt);
  console.log(`[RCA] 📥 Received LLM response (${rawResponse.length} chars).`);
  
  // Parse output
  console.log(`[RCA] 🧩 Parsing LLM response...`);
  const parsed = parseAgentOutput(rawResponse);
  
  if ("kind" in parsed && parsed.kind === "ParseError") {
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
    output.failureMechanism = `${output.failureMechanism.trim()} No log data provided. Diagnosis based on resource state only.`;
  }

  return output;
}
