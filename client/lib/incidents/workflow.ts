import { prisma as defaultPrisma } from "../prisma";
import { IncidentState } from "../../generated/prisma/enums";

/**
 * Transitions an incident to a new state explicitly, ensuring auditability.
 */
export async function transitionIncidentState(
  incidentId: string,
  newState: IncidentState,
  context?: {
    actionType?: string;
    details?: string;
    riskScore?: number;
    decision?: string;
    reasonCodes?: string;
  },
  tx?: any
) {
  const db = tx || defaultPrisma;

  // Update the incident state
  const incident = await db.incident.update({
    where: { id: incidentId },
    data: { status: newState },
  });

  // Log in safety audit if context is provided
  if (context && context.actionType) {
    await db.safetyAuditLog.create({
      data: {
        incidentId,
        actionType: context.actionType,
        decision: context.decision || "STATE_TRANSITION",
        reasonCodes: context.reasonCodes || "N/A",
        riskScore: context.riskScore || 0,
        status: "SUCCESS",
        details: `Transitioned to ${newState}. ${context.details || ""}`,
      },
    });
  }

  return incident;
}

/**
 * Rollback an incident after a failed execution.
 * Tries to compensate external actions if necessary.
 */
export async function rollbackIncident(
  incidentId: string,
  failureReason: string,
  actionRequiresRevert: boolean,
  actionDetails?: any
) {
  // Revert incident state in DB
  const incident = await transitionIncidentState(
    incidentId,
    IncidentState.ANALYZED, // Fallback to ANALYZED so it can be re-evaluated or fixed manually
    {
      actionType: "system_rollback",
      details: `Rolled back due to execution failure: ${failureReason}`,
      decision: "ROLLBACK",
      reasonCodes: "EXECUTION_FAILED",
      riskScore: 0,
    }
  );

  // Compensating Action (e.g. Mock GitHub Revert if it was a code change)
  if (actionRequiresRevert) {
    console.log(`[Rollback] Triggering compensating action for Incident ${incidentId}...`);
    console.log(`[Rollback] Mocking GitHub Revert PR for original action:`, actionDetails);
    
    // In a real system, we would use the GitHub API to revert the PR or commit.
    await defaultPrisma.safetyAuditLog.create({
      data: {
        incidentId,
        actionType: "github_revert",
        decision: "AUTO_REVERT",
        reasonCodes: "COMPENSATING_ACTION",
        riskScore: 0,
        status: "SUCCESS",
        details: `Simulated GitHub Revert PR creation for failed action.`,
      },
    });
  }

  return incident;
}
