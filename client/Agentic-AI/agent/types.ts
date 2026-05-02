// Defines the core AI-agent contracts: incident input/output, decision paths, verification, audit, and fallback/error shapes.

export type EventType =
  | "S3_PUBLIC"
  | "IAM_OVERPERMISSION"
  | "SG_OPEN_PORT"
  | "UNKNOWN";

export type IncidentStatus = "pending" | "running" | "done" | "failed";

export interface IncidentIdentity {
  tenant_id: string;
  aws_account_id: string;
  region: string;
  repo_id?: string;
  misconfig_signature: string;
}

export interface ResourceSnapshot {
  type: "s3" | "iam" | "security_group" | string;
  config: Record<string, unknown>;
}

export interface AgentInput {
  event: EventType;
  logs: string;
  resource_state: ResourceSnapshot;
  metadata: {
    resource: string;
    account_id?: string;
    region?: string;
    severity_hint?: "low" | "medium" | "high";
  };
  incident_id: string;
  incident_status: IncidentStatus;
  repo_context?: string;
}

export type ActionType =
  | "generate_fix"
  | "rollback"
  | "human_only"
  | "alert_only"
  | "unknown";

export interface AgentOutput {
  rootCauseSummary: string;
  failureMechanism: string;
  likelySubsystem: string;
  likelyFiles: Array<{
    path: string;
    reason: string;
    confidence: number;
  }>;
  fixStrategy: string[];
  recommendedAction: ActionType;
  confidence: number;
  evidence: string[];
}

export type SafetyClass = "safe" | "needs_approval" | "blocked";
export type DecisionPath = "auto_fix" | "approval_required" | "alert_only";

export interface DecisionResult {
  path: DecisionPath;
  action: ActionType;
  reason: string;
  confidence: number;
  safety_class: SafetyClass;
}

export interface VerificationInput {
  event: EventType;
  resource: string;
  post_fix_state: ResourceSnapshot;
  delay_ms?: number;
}

export interface VerificationResult {
  resolved: boolean | null;
  evidence: string;
  checked_at: string;
  status: "resolved" | "unresolved" | "pending" | "error";
}

export interface SlackBlock {
  type: "section" | "divider" | "header";
  text?: { type: "mrkdwn" | "plain_text"; text: string };
}

export interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

export interface DiagnosticReport {
  incident_id: string;
  summary: string;
  root_cause: string;
  action_taken: ActionType;
  decision_path: DecisionPath;
  verification: VerificationResult;
  confidence: number;
  risk_score: number;
  requires_human_review: boolean;
  notification: SlackPayload;
  raw_output: AgentOutput;
  generated_at: string;
  skip_reason?: string;
}

export interface AuditLogEntry {
  incident_id: string;
  event: EventType;
  resource: string;
  root_cause: string;
  action_taken: ActionType;
  decision_path: DecisionPath;
  confidence: number;
  risk_score: number;
  resolved: boolean | null;
  requires_human_review: boolean;
  generated_at: string;
  account_id?: string;
  region?: string;
}

export type FailureReason =
  | "parse_error"
  | "llm_timeout"
  | "llm_api_error"
  | "unknown_action"
  | "low_confidence"
  | "unknown_event"
  | "empty_state"
  | "both_providers_failed"
  | "already_resolved"
  | "execution_in_progress";

export interface ParseError {
  kind: "ParseError";
  reason: FailureReason;
  raw: string;
  field?: string;
}

export interface FallbackResponse {
  kind: "FallbackResponse";
  path: "alert_only";
  reason: FailureReason;
  message: string;
  original_input: AgentInput;
}
