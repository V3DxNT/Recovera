// Decision engine for the AI agent, responsible for determining the appropriate action based on the parsed output from the LLM. It evaluates the confidence level, safety classification, and potential risks associated with the proposed action, and categorizes it into paths like "auto_fix", "approval_required", or "alert_only" with specific reasons for each decision. This ensures that actions taken by the agent are aligned with safety policies and risk tolerance levels.

import { AgentOutput, ParseError, DecisionResult } from "./types";
import { getSafetyClass } from "../tools/safety-registry";

export const CONFIDENCE_AUTO_FIX = 0.85;
export const CONFIDENCE_MIN_ACTION = 0.60;

export function decide(output: AgentOutput | ParseError): DecisionResult {
  // 1. ParseError -> alert_only, reason "parse_error"
  if ("kind" in output && output.kind === "ParseError") {
    return {
      path: "alert_only",
      action: "alert_only",
      reason: "parse_error",
      confidence: 0.0,
      safety_class: "safe"
    };
  }

  const validOutput = output as AgentOutput;

  // 2. output.action === "unknown" -> alert_only, reason "unknown_action"
  if (validOutput.action === "unknown") {
    return {
      path: "alert_only",
      action: "unknown",
      reason: "unknown_action",
      confidence: validOutput.confidence,
      safety_class: "blocked"
    };
  }

  // 3. safetyClass = getSafetyClass(output.action)
  const safetyClass = getSafetyClass(validOutput.action);

  // 4. safetyClass === "blocked" -> alert_only, reason "blocked_action"
  if (safetyClass === "blocked") {
    return {
      path: "alert_only",
      action: validOutput.action,
      reason: "blocked_action",
      confidence: validOutput.confidence,
      safety_class: safetyClass
    };
  }

  // 5. confidence < 0.60 -> alert_only, reason "low_confidence"
  if (validOutput.confidence < CONFIDENCE_MIN_ACTION) {
    return {
      path: "alert_only",
      action: validOutput.action,
      reason: "low_confidence",
      confidence: validOutput.confidence,
      safety_class: safetyClass
    };
  }

  // 6. confidence >= 0.85 AND safetyClass === "safe" -> auto_fix
  if (validOutput.confidence >= CONFIDENCE_AUTO_FIX && safetyClass === "safe") {
    return {
      path: "auto_fix",
      action: validOutput.action,
      reason: "high_confidence_safe_action",
      confidence: validOutput.confidence,
      safety_class: safetyClass
    };
  }

  // 7. confidence >= 0.60 AND safetyClass === "needs_approval" -> approval_required
  if (validOutput.confidence >= CONFIDENCE_MIN_ACTION && safetyClass === "needs_approval") {
    return {
      path: "approval_required",
      action: validOutput.action,
      reason: "needs_approval_policy",
      confidence: validOutput.confidence,
      safety_class: safetyClass
    };
  }

  // 8. Default -> alert_only, reason "policy_default"
  return {
    path: "alert_only",
    action: validOutput.action,
    reason: "policy_default",
    confidence: validOutput.confidence,
    safety_class: safetyClass
  };
}
