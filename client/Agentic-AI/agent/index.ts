// Main entry point for the Agentic AI module, orchestrating the flow 
// from receiving an incident input, running RCA, making decisions, verifying outcomes, 
// and building a comprehensive diagnostic report. It includes error handling to ensure 
// that even in failure scenarios, a meaningful report is generated for auditing and review purposes.

import {
  AgentInput,
  DiagnosticReport,
  AuditLogEntry,
  VerificationResult,
  AgentOutput,
  DecisionResult,
  ResourceSnapshot,
} from "./types";
import { runRCA } from "./rca";
import { decide } from "./decision-engine";
import { verify } from "../verification/verifier";
import { buildReport } from "./reporter";
import { handleFailure } from "./fallback-handler";

// Public exports
export type { AgentInput, DiagnosticReport, AuditLogEntry };

/** Optional hooks injected by the backend (e.g. real AWS execute + state refetch). */
export interface AgentRuntime {
  executeAction?: (
    input: AgentInput,
    decision: DecisionResult,
  ) => Promise<{
    ok: boolean;
    message: string;
    postFixState: ResourceSnapshot;
  }>;
}

export function toAuditLogEntry(report: DiagnosticReport, input: AgentInput): AuditLogEntry {
  return {
    incident_id: report.incident_id,
    event: input.event,
    resource: input.metadata.resource,
    root_cause: report.root_cause,
    action_taken: report.action_taken,
    decision_path: report.decision_path,
    confidence: report.confidence,
    risk_score: report.risk_score,
    resolved: report.verification.resolved,
    requires_human_review: report.requires_human_review,
    generated_at: report.generated_at,
    account_id: input.metadata.account_id,
    region: input.metadata.region
  };
}

function buildSkipReport(input: AgentInput, skipReason: string): DiagnosticReport {
  return {
    incident_id: input.incident_id,
    summary: `Execution skipped. Reason: ${skipReason}`,
    root_cause: "Unknown (skipped)",
    action_taken: "alert_only",
    decision_path: "alert_only",
    verification: {
      resolved: skipReason === "already_resolved" ? true : null,
      evidence: `Skipped due to: ${skipReason}`,
      checked_at: new Date().toISOString(),
      status: skipReason === "already_resolved" ? "resolved" : "pending"
    },
    confidence: 1.0,
    risk_score: 0.0,
    requires_human_review: false,
    notification: {
      text: `[Recovera] Skipped ${input.event} on ${input.metadata.resource}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `[Recovera] Skipped ${input.event}` } },
        { type: "section", text: { type: "mrkdwn", text: `Reason: ${skipReason}` } }
      ]
    },
    raw_output: {
      rootCauseSummary: "Unknown (skipped)",
      failureMechanism: "None",
      likelySubsystem: "Unknown",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "alert_only",
      confidence: 1.0,
      evidence: []
    },
    generated_at: new Date().toISOString(),
    skip_reason: skipReason
  };
}

function getMockFixture(input: AgentInput): DiagnosticReport {
  return {
    incident_id: input.incident_id,
    summary: "Mock report generated.",
    root_cause: "Mocked root cause (S3 public access enabled)",
    action_taken: "alert_only",
    decision_path: "auto_fix",
    verification: {
      resolved: true,
      evidence: "Mocked verification: S3 bucket is secure.",
      checked_at: new Date().toISOString(),
      status: "resolved"
    },
    confidence: 0.90,
    risk_score: 0.10,
    requires_human_review: false,
    notification: {
      text: "[Recovera] Mock incident",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "[Recovera] Mock Incident" } }
      ]
    },
    raw_output: {
      rootCauseSummary: "Mocked root cause",
      failureMechanism: "Misconfiguration",
      likelySubsystem: "S3",
      likelyFiles: [],
      fixStrategy: ["Disable public access block"],
      recommendedAction: "alert_only",
      confidence: 0.90,
      evidence: []
    },
    generated_at: new Date().toISOString()
  };
}

export async function runAgent(
  input: AgentInput,
  runtime: AgentRuntime = {},
): Promise<DiagnosticReport> {
  // 1. Mock check
  if (process.env.AGENT_MOCK === "true") {
    return getMockFixture(input);
  }

  // 2. Idempotency guard
  if (input.incident_status === "done") {
    return buildSkipReport(input, "already_resolved");
  }
  if (input.incident_status === "running") {
    return buildSkipReport(input, "execution_in_progress");
  }

  try {
    // 3. RCA
    const rcaResult = await runRCA(input);

    // If RCA returned a ParseError (handled gracefully), we route it through the decision engine
    // The decision engine explicitly handles ParseError.

    // 4. Decide
    const decision = decide(rcaResult);

    const safeOutput: AgentOutput = "kind" in rcaResult && rcaResult.kind === "ParseError" ? {
      rootCauseSummary: "Failed to parse LLM output",
      failureMechanism: "failed to produce a valid structured response",
      likelySubsystem: "AI Agent",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "alert_only",
      confidence: 0.0,
      evidence: []
    } : rcaResult as AgentOutput;

    // 5. Verify (optional real execute + post-fix state via runtime.executeAction)
    let verification: VerificationResult;
    if (decision.path === "auto_fix") {
      if (runtime.executeAction) {
        const execResult = await runtime.executeAction(input, decision);
        if (!execResult.ok) {
          verification = {
            resolved: false,
            evidence: execResult.message,
            checked_at: new Date().toISOString(),
            status: "error",
          };
        } else {
          verification = await verify({
            event: input.event,
            resource: input.metadata.resource,
            post_fix_state: execResult.postFixState,
          });
        }
      } else {
        verification = await verify({
          event: input.event,
          resource: input.metadata.resource,
          post_fix_state: input.resource_state,
        });
      }
    } else {
      verification = {
        resolved: null,
        evidence: "Verification skipped because auto_fix was not performed.",
        checked_at: new Date().toISOString(),
        status: "pending"
      };
    }

    // 6. Report
    return await buildReport(safeOutput, decision, verification, input);

  } catch (error) {
    console.error("Agent execution failed:", error);
    // Top-level crash handler - Synthesise report without throwing
    const fallback = handleFailure(error, input);
    
    const fallbackOutput: AgentOutput = {
      rootCauseSummary: fallback.message,
      failureMechanism: `Agent execution failed: ${fallback.reason}`,
      likelySubsystem: "AI Agent",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "alert_only",
      confidence: 0.0,
      evidence: []
    };

    const fallbackDecision: DecisionResult = {
      path: "alert_only",
      action: "alert_only",
      reason: fallback.reason,
      confidence: 0.0,
      safety_class: "safe"
    };

    const fallbackVerification: VerificationResult = {
      resolved: null,
      evidence: "Execution failed before verification.",
      checked_at: new Date().toISOString(),
      status: "error"
    };

    return await buildReport(fallbackOutput, fallbackDecision, fallbackVerification, input);
  }
}
