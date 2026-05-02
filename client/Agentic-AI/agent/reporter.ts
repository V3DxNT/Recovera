// Reporter module for the Agentic AI system, responsible for compiling the final diagnostic report 
// after the RCA and decision-making processes. It calculates risk scores, 
// determines if human review is needed, generates summaries, 
// and constructs Slack payloads for notifications. 
// The report includes all relevant information about the incident, root cause, 
// actions taken, and verification results to provide a comprehensive overview 
// for stakeholders and audit purposes.

import { AgentInput, AgentOutput, DecisionResult, VerificationResult, DiagnosticReport, SlackPayload } from "./types";
import { callLLM } from "./llm-caller";

export async function buildReport(
  output: AgentOutput,
  decision: DecisionResult,
  verification: VerificationResult,
  input: AgentInput
): Promise<DiagnosticReport> {
  
  // 1. Calculate risk_score
  let risk_score = 1.0;
  if (input.event === "UNKNOWN") {
    risk_score = 1.0;
  } else if (decision.path === "auto_fix" && output.confidence >= 0.85) {
    risk_score = 1.0 - output.confidence;
  } else if (decision.path === "approval_required") {
    risk_score = 0.5;
  } else if (decision.path === "alert_only") {
    risk_score = 0.8;
  }

  // 2. Determine requires_human_review
  const requires_human_review = 
    decision.path === "approval_required" || 
    decision.path === "alert_only" || 
    verification.resolved === false || 
    verification.resolved === null;

  // 3. Generate Summary
  const fallbackSummary = `Recovera detected ${input.event} on ${input.metadata.resource}. Confidence: ${(output.confidence * 100).toFixed(0)}%. Action: ${decision.action}.`;
  let summary = fallbackSummary;

  if (process.env.AGENT_MOCK !== "true" && input.event !== "UNKNOWN" && decision.reason !== "parse_error" && decision.reason !== "both_providers_failed") {
    try {
      const summaryPrompt = `Summarize the following incident reasoning in 2 short sentences for a non-technical manager. Do not use markdown.`;
      const summaryInput = `Incident: ${input.event} on ${input.metadata.resource}. Reasoning: ${output.failureMechanism}`;
      const generated = await callLLM(
        { ...input, logs: "", resource_state: { type: "summary", config: {} } }, 
        summaryPrompt + "\n\n" + summaryInput
      );
      
      // Attempt to extract text if it returned a JSON object by accident, or just use as-is if plain text.
      try {
        const parsed = JSON.parse(generated);
        summary = parsed.summary || parsed.rootCauseSummary || fallbackSummary;
      } catch {
        summary = generated.trim();
      }
    } catch {
      summary = fallbackSummary;
    }
  }

  // 4. Build Slack Payload
  const notification: SlackPayload = {
    text: `[Recovera] ${input.event} detected on ${input.metadata.resource}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `[Recovera] ${input.event} detected on ${input.metadata.resource}` } },
      { type: "section", text: { type: "mrkdwn", text: `*Root cause:* ${output.rootCauseSummary}` } },
      { type: "section", text: { type: "mrkdwn", text: `*Confidence:* ${(output.confidence * 100).toFixed(0)}% · *Risk score:* ${(risk_score * 100).toFixed(0)}%` } },
      { type: "section", text: { type: "mrkdwn", text: `*Action:* ${decision.action} · *Status:* ${decision.path}` } },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: summary } }
    ]
  };

  return {
    incident_id: input.incident_id,
    summary,
    root_cause: output.rootCauseSummary,
    action_taken: decision.action,
    decision_path: decision.path,
    verification,
    confidence: output.confidence,
    risk_score,
    requires_human_review,
    notification,
    raw_output: output,
    generated_at: new Date().toISOString()
  };
}
