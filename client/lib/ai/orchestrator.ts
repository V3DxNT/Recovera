import { analyzeRootCause } from './rootCauseAnalyzer';
import { generateFix } from './fixGenerator';
import { validatePatch } from './patchValidator';
import { runSandboxValidation } from '../sandbox/runner';
import { evaluatePolicy } from '../safety/policyEngine';
import { createPullRequest } from '../github/prCreator';
import { prisma } from '../prisma';
import { IncidentState } from '../../generated/prisma/enums';

export async function runFullPipeline(incidentId: string) {
  console.log(`[Orchestrator] Starting full pipeline for incident ${incidentId}...`);

  try {
    // 1. Step 3: RCA
    const rcaResult = await analyzeRootCause({ incidentId });
    if (!rcaResult.success || !rcaResult.output) {
      console.error(`[Orchestrator] RCA failed for ${incidentId}: ${rcaResult.error}`);
      return;
    }

    const rcaOutput = rcaResult.output;
    console.log(`[Orchestrator] RCA completed with confidence ${rcaOutput.confidence}.`);

    // 2. Step 5: Fix Generation (if confidence is high enough)
    if (rcaOutput.confidence < 0.6) {
      console.log(`[Orchestrator] Confidence too low for auto-fix. Alerting only.`);
      return;
    }

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { repository: true }
    });

    if (!incident || !incident.repository) {
      console.error(`[Orchestrator] Incident or repo not found.`);
      return;
    }

    // Mock code context for now if not fully populated by RCA
    const context = rcaOutput.likelyFiles.map(f => ({
      path: typeof f === 'string' ? f : (f as any).path,
      content: "/* Content fetched from retrieval layer in RCA */"
    }));

    console.log(`[Orchestrator] Generating fix...`);
    const fixOutput = await generateFix(incident, rcaOutput, context);

    // 3. Step 7: Validation
    console.log(`[Orchestrator] Validating patch...`);
    const policyValidation = validatePatch(fixOutput.patchDiff);
    if (!policyValidation.valid) {
      console.log(`[Orchestrator] Patch failed static validation: ${policyValidation.reason}`);
      return;
    }

    // 4. Step 7: Safety Policy
    console.log(`[Orchestrator] Evaluating safety policy...`);
    const policyDecision = await evaluatePolicy({
      incidentId,
      actionType: "fix_generation",
      confidenceScore: rcaOutput.confidence,
      patchDiff: fixOutput.patchDiff
    });

    if (policyDecision.decision === "BLOCK_AND_ALERT") {
      console.log(`[Orchestrator] Action blocked by safety policy.`);
      return;
    }

    // 5. Step 7: Sandbox Validation
    console.log(`[Orchestrator] Running sandbox validation...`);
    const sandboxResult = await runSandboxValidation(
      incident.repository.fullName,
      fixOutput.patchDiff
    );

    const patchArtifact = await prisma.patchArtifact.create({
      data: {
        incidentId,
        patchDiff: fixOutput.patchDiff,
        changeSummary: fixOutput.changeSummary,
        riskScore: policyDecision.riskScore,
        validationStatus: sandboxResult.passed ? "passed" : "failed",
        validationLogs: sandboxResult.logs
      }
    });

    if (!sandboxResult.passed) {
      console.log(`[Orchestrator] Sandbox validation failed.`);
      return;
    }

    // 6. Step 6: PR Creation (if policy allows auto-PR)
    if (policyDecision.decision === "ALLOW_AUTO_PR") {
      console.log(`[Orchestrator] Opening PR...`);
      
      // Get system or user token? For automation, we might need a system token.
      // For now, we'll try to find any token for this repo.
      const userAccount = await prisma.account.findFirst({
        where: { userId: incident.repository.userId, provider: "github" }
      });
      const githubToken = userAccount?.access_token;

      if (!githubToken) {
        console.error(`[Orchestrator] No GitHub token found for PR creation.`);
        return;
      }

      const prResult = await createPullRequest({
        repoFullName: incident.repository.fullName,
        incidentId,
        patchDiff: fixOutput.patchDiff,
        githubToken,
        prTitle: `fix(autosre): ${incident.title}`,
        prBody: `## AutoSRE Remediation\n\n${fixOutput.changeSummary}`,
        baseBranch: incident.repository.defaultBranch
      });

      if (prResult.success) {
        console.log(`[Orchestrator] PR created: ${prResult.prUrl}`);
        await prisma.incidentAction.create({
          data: {
            incidentId,
            actionType: "open_pr",
            status: "opened",
            prUrl: prResult.prUrl,
            branchName: prResult.branchName,
            commitSha: prResult.commitSha
          }
        });
        await prisma.incident.update({
          where: { id: incidentId },
          data: { status: IncidentState.ANALYZED } // Using ANALYZED as a proxy for in_review
        });
      } else {
        console.error(`[Orchestrator] PR creation failed: ${prResult.error}`);
      }
    } else {
      console.log(`[Orchestrator] Policy requires human approval for PR.`);
    }

  } catch (error) {
    console.error(`[Orchestrator] Pipeline failed for ${incidentId}:`, error);
  }
}
