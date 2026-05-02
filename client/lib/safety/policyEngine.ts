import { prisma } from "@/lib/prisma";

export type SafetyDecision = "ALLOW_AUTO_PR" | "REQUIRE_HUMAN_APPROVAL" | "BLOCK_AND_ALERT";

export interface PolicyEvaluationRequest {
  incidentId: string;
  actionType: "fix_generation" | "pr_creation";
  confidenceScore: number;
  patchDiff: string;
}

export interface PolicyDecisionResult {
  decision: SafetyDecision;
  reasonCodes: string[];
  riskScore: number;
}

const HIGH_RISK_DOMAINS = [
  "auth",
  "login",
  "billing",
  "payment",
  "stripe",
  "secret",
  "key",
  "migration",
  "prisma/migrations"
];

// 1 Hour in ms
const CIRCUIT_BREAKER_WINDOW = 60 * 60 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 0.3; // 30% failure rate
const MIN_SAMPLES_FOR_CIRCUIT_BREAKER = 5;

/**
 * Classifies if a patch touches any high-risk domains.
 */
function containsHighRiskDomain(patchDiff: string): boolean {
  const lowercaseDiff = patchDiff.toLowerCase();
  for (const domain of HIGH_RISK_DOMAINS) {
    if (lowercaseDiff.includes(domain)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if the global circuit breaker should trip.
 * Queries the last 1 hour of SafetyAuditLogs.
 */
async function checkCircuitBreaker(): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW);
  
  const recentLogs = await prisma.safetyAuditLog.findMany({
    where: { createdAt: { gte: oneHourAgo } },
    select: { decision: true }
  });

  if (recentLogs.length < MIN_SAMPLES_FOR_CIRCUIT_BREAKER) {
    return false; // Not enough data to trip
  }

  const blockedCount = recentLogs.filter(log => log.decision === "BLOCK_AND_ALERT").length;
  const failureRate = blockedCount / recentLogs.length;

  return failureRate >= CIRCUIT_BREAKER_THRESHOLD;
}

/**
 * Evaluates the safety policy for a given action.
 */
export async function evaluatePolicy(req: PolicyEvaluationRequest): Promise<PolicyDecisionResult> {
  const reasons: string[] = [];
  let decision: SafetyDecision = "ALLOW_AUTO_PR";
  let riskScore = 0.0;

  // 1. Check Global Circuit Breaker
  const isCircuitBreakerTripped = await checkCircuitBreaker();
  if (isCircuitBreakerTripped) {
    reasons.push("GLOBAL_CIRCUIT_BREAKER_TRIPPED");
    decision = "BLOCK_AND_ALERT";
    riskScore += 10.0; // Max risk
  }

  // 2. Evaluate Base Confidence
  if (req.confidenceScore < 0.70) {
    reasons.push("LOW_CONFIDENCE_SCORE");
    decision = "BLOCK_AND_ALERT";
    riskScore += 8.0;
  } else if (req.confidenceScore < 0.85) {
    reasons.push("MEDIUM_CONFIDENCE_SCORE");
    if (decision !== "BLOCK_AND_ALERT") {
      decision = "REQUIRE_HUMAN_APPROVAL";
    }
    riskScore += 4.0;
  }

  // 3. Evaluate Domain Risk
  const isHighRisk = containsHighRiskDomain(req.patchDiff);
  if (isHighRisk) {
    reasons.push("HIGH_RISK_DOMAIN_TOUCHED");
    if (decision !== "BLOCK_AND_ALERT") {
      decision = "REQUIRE_HUMAN_APPROVAL";
    }
    riskScore += 5.0;
  }

  // Cap risk score at 10
  riskScore = Math.min(riskScore, 10.0);

  // 4. Record the decision in the SafetyAuditLog
  await prisma.safetyAuditLog.create({
    data: {
      incidentId: req.incidentId,
      actionType: req.actionType,
      decision,
      reasonCodes: reasons.join(", ") || "ALL_CHECKS_PASSED",
      riskScore,
    }
  });

  return {
    decision,
    reasonCodes: reasons,
    riskScore
  };
}
