import { prisma } from "../prisma";
import { runRCA } from "../../Agentic-AI/agent/rca";
import { AgentInput, AgentOutput, ParseError } from "../../Agentic-AI/agent/types";

export interface RCARequest {
  incidentId: string;
}

export interface RCAResult {
  success: boolean;
  output?: AgentOutput;
  error?: string;
  version?: number;
}

export async function analyzeRootCause(req: RCARequest): Promise<RCAResult> {
  const incident = await prisma.incident.findUnique({
    where: { id: req.incidentId },
    include: {
      events: {
        orderBy: { detectedAt: "desc" },
        take: 5 // top N by error density
      },
      repository: true
    }
  });

  if (!incident) {
    return { success: false, error: "Incident not found" };
  }

  // 1. Gather logs and stack traces
  const logs = incident.events.map(e => e.rawExcerpt).join("\n");
  
  // 2. Assemble context payload 
  // STUB for Step 4: Code retrieval
  const retrievedCodeContext = "/* Code retrieval stub */";
  
  // STUB for Deployment history
  const deploymentContext = "/* Deployment metadata stub */";
  
  // STUB for Historical nearest incidents
  const historicalContext = "/* History stub */";

  const repoContext = [
    `Repository: ${incident.repository.fullName}`,
    `Deployment Context: ${deploymentContext}`,
    `Historical Incidents: ${historicalContext}`,
    `Code Context:\n${retrievedCodeContext}`
  ].join("\n\n");

  // Format resource state stub
  const resourceState = {
    type: "unknown",
    config: { fingerprint: incident.fingerprint }
  };

  let eventType: "S3_PUBLIC" | "IAM_OVERPERMISSION" | "SG_OPEN_PORT" | "UNKNOWN" = "UNKNOWN";
  const fprint = incident.fingerprint.toUpperCase();
  if (fprint.includes("S3") || fprint.includes("BUCKET")) eventType = "S3_PUBLIC";
  else if (fprint.includes("IAM") || fprint.includes("PERMISSION") || fprint.includes("ROLE")) eventType = "IAM_OVERPERMISSION";
  else if (fprint.includes("SG") || fprint.includes("SECURITY") || fprint.includes("PORT")) eventType = "SG_OPEN_PORT";
  else eventType = "UNKNOWN"; // Might skip LLM

  const agentInput: AgentInput = {
    event: eventType,
    logs: logs || "No logs available.",
    resource_state: resourceState,
    metadata: {
      resource: incident.repository.fullName,
      severity_hint: incident.severity as any,
    },
    incident_id: incident.id,
    incident_status: "running",
    repo_context: repoContext
  };

  try {
    // 3. Call LLM through Agent Pipeline
    const result = await runRCA(agentInput);

    if ("kind" in result && result.kind === "ParseError") {
      return { success: false, error: `ParseError: ${result.reason} - ${result.field || ""}` };
    }

    // 4. Persist RCA output on incident (with versioning)
    // Get latest version
    const agentOutput = result as AgentOutput;
    const latestRca = await prisma.incidentRca.findFirst({
      where: { incidentId: incident.id },
      orderBy: { version: "desc" }
    });
    
    const nextVersion = latestRca ? latestRca.version + 1 : 1;

    await prisma.incidentRca.create({
      data: {
        incidentId: incident.id,
        rcaPayload: JSON.stringify(agentOutput),
        version: nextVersion
      }
    });

    // Optionally update incident confidence and status based on RCA
    await prisma.incident.update({
      where: { id: incident.id },
      data: {
        confidence: agentOutput.confidence,
      }
    });

    return {
      success: true,
      output: agentOutput,
      version: nextVersion
    };

  } catch (error) {
    console.error("RCA execution failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown RCA error" };
  }
}
