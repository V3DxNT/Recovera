import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/Agentic-AI/agent";
import { AgentInput, DiagnosticReport } from "@/Agentic-AI/agent/types";
import { classifyEventFromMessage } from "@/lib/detection/detector";
import { fetchResourceState } from "@/lib/aws/actions/fetchState";
import { createAwsAgentRuntime } from "@/lib/aws/actions/executor";

function toIncidentStatus(report: DiagnosticReport): string {
  if (report.verification.status === "resolved") return "resolved";
  if (report.verification.status === "unresolved") return "investigating";
  if (report.verification.status === "error") return "open";
  if (report.requires_human_review) return "investigating";
  return "open";
}

function toActionStatus(report: DiagnosticReport): string {
  if (
    report.decision_path === "auto_fix" &&
    report.verification.status === "resolved"
  )
    return "opened";
  if (
    report.decision_path === "auto_fix" &&
    report.verification.status === "error"
  )
    return "failed";
  if (report.requires_human_review) return "pending";
  return "opened";
}

function isFullAnalyzePayload(body: Record<string, unknown>): body is {
  incident_id: string;
  event_id?: string;
  event: AgentInput["event"];
  logs: string;
  resource_state: AgentInput["resource_state"];
  metadata: AgentInput["metadata"];
  incident_status: AgentInput["incident_status"];
  repo_context?: string;
} {
  return (
    typeof body.incident_id === "string" &&
    Boolean(body.event) &&
    typeof body.logs === "string" &&
    Boolean(body.resource_state) &&
    Boolean(body.metadata) &&
    Boolean(body.incident_status)
  );
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const internalKey = req.headers.get("x-recovera-internal-key");
    const configuredInternalKey = process.env.RECOVERA_INTERNAL_KEY;
    const isInternalCall =
      Boolean(configuredInternalKey) && internalKey === configuredInternalKey;

    if (!session?.user?.email && !isInternalCall) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { incident_id: string } & Record<string, unknown>;

    if (!body?.incident_id || typeof body.incident_id !== "string") {
      return NextResponse.json(
        { error: "incident_id is required." },
        { status: 400 },
      );
    }

    const incident = await prisma.incident.findUnique({
      where: { id: body.incident_id },
      include: {
        repository: {
          include: {
            mappings: {
              take: 1,
              orderBy: { updatedAt: "desc" },
              include: {
                integration: { include: { credentials: true } },
              },
            },
          },
        },
        events: {
          orderBy: { detectedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!incident || !incident.repository) {
      return NextResponse.json(
        { error: "Incident or linked Repository not found." },
        { status: 404 },
      );
    }

    let agentInput: AgentInput;
    let eventId: string | null =
      typeof body.event_id === "string" ? body.event_id : null;

    if (isFullAnalyzePayload(body)) {
      agentInput = {
        event: body.event,
        logs: body.logs,
        resource_state: body.resource_state,
        metadata: body.metadata,
        incident_id: body.incident_id,
        incident_status: body.incident_status,
        repo_context: body.repo_context,
      };
    } else {
      const mapping = incident.repository.mappings[0];
      let credential: any = mapping?.integration?.credentials ?? null;

      if (!credential) {
        console.log("No credential found for incident", incident.id);
        credential =
          (await prisma.cloudCredential.findFirst({
            where: {
              userId: incident.repository.userId,
              isActive: true,
            },
          })) ?? null;
      }

      const logs = incident.events[0]?.rawExcerpt ?? "";
      eventId = eventId ?? incident.events[0]?.eventId ?? null;

      const resourceKey =
        mapping?.resourceId && mapping.resourceId !== "global"
          ? mapping.resourceId
          : incident.repository.fullName;

      let partialInput: AgentInput = {
        event: classifyEventFromMessage(logs),
        logs,
        resource_state: {
          type: mapping?.resourceType ?? "unknown",
          config: {},
        },
        metadata: {
          resource: resourceKey,
          account_id: mapping?.integrationId,
          region: credential?.region ?? "us-east-1",
        },
        incident_id: incident.id,
        incident_status: "pending",
        repo_context: incident.repository.fullName,
      };

      if (credential) {
        try {
          partialInput = {
            ...partialInput,
            resource_state: await fetchResourceState(
              partialInput,
              credential,
            ),
          };
        } catch (e) {
          console.warn("[Agent Analyze] fetchResourceState failed:", e);
        }
      }

      agentInput = partialInput;
    }

    let credentialForRuntime: any =
      incident.repository.mappings[0]?.integration?.credentials ?? null;
    if (!credentialForRuntime) {
      credentialForRuntime =
        (await prisma.cloudCredential.findFirst({
          where: {
            userId: incident.repository.userId,
            isActive: true,
          },
        })) ?? null;
    }

    const runtime = credentialForRuntime
      ? createAwsAgentRuntime(credentialForRuntime)
      : {};

    const report = await runAgent(agentInput, runtime);

    if (!eventId) {
      const ev = await prisma.incidentEvent.findFirst({
        where: { incidentId: body.incident_id },
        orderBy: { detectedAt: "desc" },
        select: { eventId: true },
      });
      eventId = ev?.eventId ?? null;
    }

    const incidentStatus = toIncidentStatus(report);
    const actionStatus = toActionStatus(report);

    await prisma.$transaction(async (tx) => {
      if (eventId) {
        await tx.detectionAudit.upsert({
          where: { eventId },
          create: {
            eventId,
            engine: "llm",
            label: report.action_taken,
            confidence: report.confidence,
            explanation: report.root_cause,
            reportPayload: JSON.stringify(report),
          },
          update: {
            engine: "llm",
            label: report.action_taken,
            confidence: report.confidence,
            explanation: report.root_cause,
            reportPayload: JSON.stringify(report),
          },
        });
      }

      await tx.incidentAction.create({
        data: {
          incidentId: body.incident_id,
          actionType: report.action_taken,
          status: actionStatus,
          requiresApproval: report.requires_human_review,
          failureReason:
            report.verification.status === "error"
              ? report.verification.evidence
              : (report.skip_reason ?? null),
        },
      });

      const latestRca = await tx.incidentRca.findFirst({
        where: { incidentId: body.incident_id },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      await tx.incidentRca.create({
        data: {
          incidentId: body.incident_id,
          rcaPayload: JSON.stringify(report.raw_output),
          version: (latestRca?.version ?? 0) + 1,
        },
      });

      // Use the workflow helper for explicit state transition
      const { transitionIncidentState } = await import("@/lib/incidents/workflow");
      const { IncidentState } = await import("../../../../generated/prisma/client");

      let newState: any = IncidentState.ANALYZED;
      if (report.requires_human_review || report.decision_path === "auto_fix") {
        newState = IncidentState.DECIDED;
      }

      await transitionIncidentState(
        body.incident_id,
        newState,
        {
          actionType: "rca_analysis",
          details: `Analyzed with confidence ${report.confidence}. Action: ${report.action_taken}`,
        },
        tx
      );

      // Update confidence on the incident
      await tx.incident.update({
        where: { id: body.incident_id },
        data: { confidence: report.confidence }
      });
    });

    return NextResponse.json(
      {
        success: true,
        incidentId: body.incident_id,
        status: report.verification.status,
        decisionPath: report.decision_path,
        actionTaken: report.action_taken,
        confidence: report.confidence,
        report,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Agent analyze failed";
    console.error("[Agent Analyze API] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
