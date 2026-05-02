import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { generateFix, MockRCA, MockCodeContext } from "@/lib/ai/fixGenerator";
import { validatePatch } from "@/lib/ai/patchValidator";
import { runSandboxValidation } from "@/lib/sandbox/runner";
import { evaluatePolicy } from "@/lib/safety/policyEngine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    
    // In a fully integrated flow, RCA and CodeContext would be fetched from the DB
    // using the incidentId. Since Step 3 & 4 are not fully implemented, we accept
    // them from the request body for independent testing.
    const body = await req.json();
    const { rca, context } = body as { rca: MockRCA, context: MockCodeContext[] };

    if (!rca || !context) {
      return NextResponse.json({ error: "Missing 'rca' or 'context' in request body." }, { status: 400 });
    }

    // 1. Fetch Incident and Repository metadata from the DB
    const incident = await prisma.incident.findUnique({
      where: { id: id },
      include: { repository: true }
    });

    if (!incident || !incident.repository) {
      return NextResponse.json({ error: "Incident or linked Repository not found." }, { status: 404 });
    }

    const mockIncidentInfo = {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      fingerprint: incident.fingerprint,
      eventCount: incident.eventCount,
    };

    // 2. Generate the fix using the AI module
    console.log(`[Fix Generator] Generating patch for Incident ${id}...`);
    const fixOutput = await generateFix(mockIncidentInfo, rca, context);

    // 3. Validate the patch using static policies (Blast radius, blocked paths)
    console.log(`[Fix Generator] Validating patch policy...`);
    const policyValidation = validatePatch(fixOutput.patchDiff);
    if (!policyValidation.valid) {
      // Create a failed patch artifact
      await prisma.patchArtifact.create({
        data: {
          incidentId: incident.id,
          patchDiff: fixOutput.patchDiff,
          changeSummary: fixOutput.changeSummary,
          riskScore: fixOutput.riskScore,
          validationStatus: "failed",
          validationLogs: `Policy Validation Failed: ${policyValidation.reason}`,
        }
      });
      return NextResponse.json({ error: `Policy Validation Failed: ${policyValidation.reason}`, patch: fixOutput }, { status: 422 });
    }

    // 4. Safety Policy Evaluation
    console.log(`[Fix Generator] Evaluating safety policy...`);
    const policyDecision = await evaluatePolicy({
      incidentId: incident.id,
      actionType: "fix_generation",
      confidenceScore: incident.confidence,
      patchDiff: fixOutput.patchDiff,
    });

    if (policyDecision.decision === "BLOCK_AND_ALERT") {
      await prisma.patchArtifact.create({
        data: {
          incidentId: incident.id,
          patchDiff: fixOutput.patchDiff,
          changeSummary: fixOutput.changeSummary,
          riskScore: policyDecision.riskScore,
          validationStatus: "failed",
          validationLogs: `Safety Policy Blocked: ${policyDecision.reasonCodes.join(", ")}`,
        }
      });
      return NextResponse.json({ error: `Action Blocked by Safety Layer: ${policyDecision.reasonCodes.join(", ")}` }, { status: 403 });
    }

    // 5. Run Sandbox Validation (Lint/Build check)
    // We pass the user's github access token from session if available, else undefined
    // Note: session.accessToken relies on custom NextAuth callbacks injecting it
    const githubToken = (session as { accessToken?: string }).accessToken;
    
    console.log(`[Fix Generator] Running sandbox validation for ${incident.repository.fullName}...`);
    const sandboxResult = await runSandboxValidation(
      incident.repository.fullName,
      fixOutput.patchDiff,
      githubToken
    );

    // 5. Persist the generated patch and validation results to the database
    const patchArtifact = await prisma.patchArtifact.create({
      data: {
        incidentId: incident.id,
        patchDiff: fixOutput.patchDiff,
        changeSummary: fixOutput.changeSummary,
        riskScore: policyDecision.riskScore,
        validationStatus: sandboxResult.passed ? "passed" : "failed",
        validationLogs: sandboxResult.logs,
      }
    });

    return NextResponse.json({
      message: sandboxResult.passed ? "Fix generated and validated successfully." : "Fix generated but sandbox validation failed.",
      patchArtifact,
    });

  } catch (error: unknown) {
    console.error("[Fix Generator API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
