// Main entry point for the Agentic AI module, orchestrating the flow 
// from receiving an incident input, running RCA, making decisions, verifying outcomes, 
// and building a comprehensive diagnostic report. It includes error handling to ensure 
// that even in failure scenarios, a meaningful report is generated for auditing and review purposes.

import { AgentInput, DiagnosticReport, AuditLogEntry, VerificationResult, AgentOutput, DecisionResult } from "./types";
import { runRCA } from "./rca";
import { decide } from "./decision-engine";
import { verify } from "../verification/verifier";
import { buildReport } from "./reporter";
import { handleFailure } from "./fallback-handler";

// Public exports
export type { AgentInput, DiagnosticReport, AuditLogEntry };

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

export async function runAgent(input: AgentInput): Promise<DiagnosticReport> {
  console.log(`\n[Agent] 🚀 Starting agent for incident: ${input.incident_id}`);
  console.log(`[Agent] Event type: ${input.event} on resource: ${input.metadata.resource}`);

  // 1. Mock check
  if (process.env.AGENT_MOCK === "true") {
    console.log(`[Agent] 🧪 Mock mode enabled. Returning fixture.`);
    return getMockFixture(input);
  }

  // 2. Idempotency guard
  if (input.incident_status === "done") {
    console.log(`[Agent] ⏭️ Incident already resolved. Skipping.`);
    return buildSkipReport(input, "already_resolved");
  }
  if (input.incident_status === "running") {
    console.log(`[Agent] ⏳ Incident analysis already in progress. Skipping.`);
    return buildSkipReport(input, "execution_in_progress");
  }

  try {
    // 3. RCA
    console.log(`[Agent] 🔍 Step 1/4: Running Root Cause Analysis (RCA)...`);
    const rcaResult = await runRCA(input);
    
    if ("kind" in rcaResult && rcaResult.kind === "ParseError") {
      console.warn(`[Agent] ⚠️ RCA returned a ParseError. LLM output was malformed.`);
    } else {
      console.log(`[Agent] ✅ RCA completed. Confidence: ${(rcaResult as AgentOutput).confidence}`);
    }

    // 4. Decide
    console.log(`[Agent] ⚖️ Step 2/4: Running Decision Engine...`);
    const decision = decide(rcaResult);
    console.log(`[Agent] 🎯 Decision: ${decision.path} (Action: ${decision.action})`);
    console.log(`[Agent] 📝 Reason: ${decision.reason}`);

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

    // 5. Verify
    let verification: VerificationResult;
    if (decision.path === "auto_fix") {
      console.log(`[Agent] 🧪 Step 3/4: Verifying the fix...`);
      verification = await verify({
        event: input.event,
        resource: input.metadata.resource,
        post_fix_state: input.resource_state
      });
      console.log(`[Agent] ${verification.resolved ? "✅" : "❌"} Verification ${verification.resolved ? "passed" : "failed"}.`);
    } else {
      console.log(`[Agent] ⏭️ Step 3/4: Skipping verification (not an auto-fix path).`);
      verification = {
        resolved: null,
        evidence: "Verification skipped because auto_fix was not performed.",
        checked_at: new Date().toISOString(),
        status: "pending"
      };
    }

    // 6. Report
    console.log(`[Agent] 📄 Step 4/4: Building final diagnostic report...`);
    const report = await buildReport(safeOutput, decision, verification, input);
    console.log(`[Agent] ✨ Pipeline complete. Report generated.\n`);
    return report;

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
