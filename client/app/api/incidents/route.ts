import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

interface DiagnosisPayload {
  root_cause?: string;
  action_taken?: string;
  decision_path?: string;
  confidence?: number;
  verification?: {
    status?: string;
    resolved?: boolean | null;
    evidence?: string;
  };
  generated_at?: string;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const repoFullName = searchParams.get("repoFullName");

    if (!repoFullName) {
      return NextResponse.json(
        { error: "repoFullName is required" },
        { status: 400 },
      );
    }

    const repository = await prisma.repository.findFirst({
      where: { fullName: repoFullName },
      include: {
        mappings: {
          include: {
            integration: {
              include: { credentials: true },
            },
          },
        },
      },
    });

    const incidents = await prisma.incident.findMany({
      where: { repository: { fullName: repoFullName } },
      orderBy: { createdAt: "desc" },
      include: {
        patches: { orderBy: { createdAt: "desc" } },
        actions: { orderBy: { createdAt: "desc" } },
        rcaVersions: { orderBy: { createdAt: "desc" }, take: 1 },
        events: {
          orderBy: { detectedAt: "desc" },
          take: 1,
          select: { eventId: true },
        },
      },
    });

    const latestEventIds = incidents
      .map((incident) => incident.events[0]?.eventId)
      .filter((eventId): eventId is string => Boolean(eventId));

    const audits = latestEventIds.length
      ? await prisma.detectionAudit.findMany({
          where: { eventId: { in: latestEventIds } },
          select: {
            eventId: true,
            reportPayload: true,
            confidence: true,
            createdAt: true,
            label: true,
            explanation: true,
          },
        })
      : [];

    const auditByEventId = new Map(
      audits.map((audit) => [audit.eventId, audit]),
    );

    const enrichedIncidents = incidents.map((incident) => {
      const eventId = incident.events[0]?.eventId;
      const latestAudit = eventId ? auditByEventId.get(eventId) : undefined;

      let latestDiagnosis: {
        rootCause: string | null;
        actionTaken: string | null;
        decisionPath: string | null;
        confidence: number | null;
        verificationStatus: string | null;
        verificationResolved: boolean | null;
        verificationEvidence: string | null;
        generatedAt: string | null;
      } | null = null;

      if (latestAudit) {
        let parsedPayload: DiagnosisPayload = {};
        if (latestAudit.reportPayload) {
          try {
            parsedPayload = JSON.parse(
              latestAudit.reportPayload,
            ) as DiagnosisPayload;
          } catch {
            parsedPayload = {};
          }
        }

        latestDiagnosis = {
          rootCause:
            parsedPayload.root_cause ?? latestAudit.explanation ?? null,
          actionTaken: parsedPayload.action_taken ?? latestAudit.label ?? null,
          decisionPath: parsedPayload.decision_path ?? null,
          confidence:
            typeof parsedPayload.confidence === "number"
              ? parsedPayload.confidence
              : latestAudit.confidence,
          verificationStatus: parsedPayload.verification?.status ?? null,
          verificationResolved: parsedPayload.verification?.resolved ?? null,
          verificationEvidence: parsedPayload.verification?.evidence ?? null,
          generatedAt:
            parsedPayload.generated_at ?? latestAudit.createdAt.toISOString(),
        };
      }

      return {
        ...incident,
        latestDiagnosis,
      };
    });

    return NextResponse.json(
      { incidents: enrichedIncidents, repository },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[Get Incidents API] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  }
}
