import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { prisma } from "../prisma";
import { IncidentState } from "../../generated/prisma/client";
import { NormalizedLogEvent } from "../ingest/types";
import { incrementMetric } from "../ingest/metrics";
import { storeEventToS3 } from "../ingest/store";
import { runAgent } from "../../Agentic-AI/agent";
import { runFullPipeline } from "../ai/orchestrator";
import {
  AgentInput,
  EventType,
  IncidentStatus,
  ResourceSnapshot,
} from "../../Agentic-AI/agent/types";
import { fetchResourceState } from "../aws/actions/fetchState";
import { createAwsAgentRuntime } from "../aws/actions/executor";

const BASE_DIR = path.join(process.cwd(), ".recovera-ingest");
const QUEUE_FILE = path.join(BASE_DIR, "queue.ndjson");

const FINGERPRINT_VERSION = "v1";

function generateFingerprint(log: NormalizedLogEvent): string {
  let normalizedMsg = log.messageRaw || "";
  normalizedMsg = normalizedMsg.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "<UUID>",
  );
  normalizedMsg = normalizedMsg.replace(/\b\d+\b/g, "<NUM>");

  const stackMatch = normalizedMsg.match(/at\s+.*?\s+\((.*?):\d+:\d+\)/);
  const stackTop = stackMatch ? stackMatch[1] : "unknown_location";

  const components = [
    log.repoFullName || "unknown_repo",
    log.resourceType,
    stackTop,
    normalizedMsg.substring(0, 100),
  ];

  const hash = crypto
    .createHash("sha256")
    .update(components.join("::"))
    .digest("hex");
  return `${FINGERPRINT_VERSION}_${hash.substring(0, 16)}`;
}

/** Exported for `/api/agent/analyze` when rebuilding input from stored logs only. */
export function classifyEventFromMessage(messageRaw: string): EventType {
  const msg = (messageRaw || "").toLowerCase();
  if (
    msg.includes("s3") &&
    (msg.includes("public") || msg.includes("access denied"))
  )
    return "S3_PUBLIC";
  if (
    msg.includes("iam") ||
    msg.includes("assume role") ||
    msg.includes("not authorized")
  )
    return "IAM_OVERPERMISSION";
  if (
    msg.includes("security group") ||
    msg.includes("timeout") ||
    msg.includes("connection refused")
  )
    return "SG_OPEN_PORT";
  return "UNKNOWN";
}

export function detectEventType(log: NormalizedLogEvent): EventType {
  return classifyEventFromMessage(log.messageRaw || "");
}

async function findInstanceMapping(log: NormalizedLogEvent) {
  if (!log.integrationId) return null;

  const include = {
    repository: true,
    integration: { include: { credentials: true } },
  } as const;

  if (log.logGroupName && log.resourceId) {
    const exact = await prisma.instanceMapping.findFirst({
      where: {
        integrationId: log.integrationId,
        logGroupName: log.logGroupName,
        resourceId: log.resourceId,
      },
      include,
    });
    if (exact) return exact;

    const globalRg = await prisma.instanceMapping.findFirst({
      where: {
        integrationId: log.integrationId,
        logGroupName: log.logGroupName,
        resourceId: "global",
      },
      include,
    });
    if (globalRg) return globalRg;
  }

  if (log.logGroupName) {
    const byLg = await prisma.instanceMapping.findFirst({
      where: {
        integrationId: log.integrationId,
        logGroupName: log.logGroupName,
      },
      include,
    });
    if (byLg) return byLg;
  }

  return prisma.instanceMapping.findFirst({
    where: { integrationId: log.integrationId },
    include,
    orderBy: { updatedAt: "desc" },
  });
}

function mapIncidentStatusFromReport(report: {
  verification: { status: "resolved" | "unresolved" | "pending" | "error" };
  requires_human_review: boolean;
}): IncidentState {
  if (report.verification.status === "resolved") return IncidentState.VERIFIED;
  if (report.verification.status === "unresolved") return IncidentState.ANALYZED;
  if (report.verification.status === "error") return IncidentState.DETECTED;
  if (report.requires_human_review) return IncidentState.DECIDED;
  return IncidentState.PROCESSING;
}

function mapActionStatusFromReport(report: {
  decision_path: "auto_fix" | "approval_required" | "alert_only";
  verification: { status: "resolved" | "unresolved" | "pending" | "error" };
  requires_human_review: boolean;
}): string {
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

export async function processNormalizedEvent(log: NormalizedLogEvent) {
  const fingerprint = generateFingerprint(log);

  const existingEvent = await prisma.incidentEvent.findUnique({
    where: { eventId: log.eventId },
  });

  if (existingEvent && existingEvent.processingStatus === "processed") {
    console.log(
      `[Detector] Skipped event ${log.eventId} - already successfully processed.`,
    );
    return;
  }

  const mapping = await findInstanceMapping(log);
  const credential = mapping?.integration?.credentials ?? null;

  const defaultFullName =
    mapping?.repoFullName ||
    mapping?.repository?.fullName ||
    log.repoFullName ||
    "unknown/repo";

  let repo = await prisma.repository.findFirst({
    where: { fullName: defaultFullName },
  });

  // Guard: Reject unlinked events to prevent phantom data
  if (!mapping && !repo) {
    const isWhitelisted =
      log.integrationId &&
      log.integrationId.startsWith("recovera-onboarding-");

    if (!isWhitelisted) {
      console.warn("[DETECTOR] Rejected unlinked event:", {
        eventId: log.eventId,
        integrationId: log.integrationId,
        reason: "no_mapping_no_repo",
      });

      await storeEventToS3(log);
      await incrementMetric("detector.events_rejected", { reason: "unlinked" });
      return;
    }
  }

  if (!repo) {
    let user = await prisma.user.findFirst();
    if (!user)
      user = await prisma.user.create({
        data: { name: "System", email: "system@recovera.dev" },
      });
    repo = await prisma.repository.create({
      data: {
        userId: user.id,
        fullName: defaultFullName,
        name: defaultFullName.split("/").pop() || "repo",
        htmlUrl: `https://github.com/${defaultFullName}`,
      },
    });
  }

  const incident = await prisma.incident.upsert({
    where: { repositoryId_fingerprint: { repositoryId: repo.id, fingerprint } },
    create: {
      repositoryId: repo.id,
      fingerprint,
      title: `Incident: ${log.resourceType} failure`,
      severity: "medium",
      status: IncidentState.DETECTED,
      eventCount: 1,
      firstSeenAt: new Date(log.timestamp || new Date()),
      lastSeenAt: new Date(log.timestamp || new Date()),
    },
    update: {
      eventCount: existingEvent ? undefined : { increment: 1 },
      lastSeenAt: new Date(log.timestamp || new Date()),
    },
  });

  const incidentEvent = await prisma.incidentEvent.upsert({
    where: { eventId: log.eventId },
    create: {
      incidentId: incident.id,
      eventId: log.eventId,
      rawExcerpt: log.messageRaw,
      detectedAt: new Date(),
      processingStatus: "pending",
    },
    update: {
      processingStatus: "pending", // mark as pending again for retry
    },
  });

  let agentStatus: IncidentStatus = "pending";
  if (
    incident.status === IncidentState.DETECTED ||
    incident.status === IncidentState.QUEUED
  )
    agentStatus = "pending";
  if (
    incident.status === IncidentState.PROCESSING ||
    incident.status === IncidentState.ANALYZED
  )
    agentStatus = "running";
  if (
    incident.status === IncidentState.VERIFIED ||
    incident.status === IncidentState.CLOSED
  )
    agentStatus = "done";

  let state: ResourceSnapshot = { type: log.resourceType, config: {} };
  if (log.messageParsed && typeof log.messageParsed === "object") {
    state.config = log.messageParsed as Record<string, unknown>;
  }

  const parsedConfig =
    log.messageParsed && typeof log.messageParsed === "object"
      ? (log.messageParsed as Record<string, unknown>)
      : {};

  const region =
    credential?.region ||
    mapping?.integration?.credentials?.region ||
    "us-east-1";

  const resourceKey =
    log.resourceId ||
    (mapping?.resourceId && mapping.resourceId !== "global"
      ? mapping.resourceId
      : null) ||
    "unknown_resource";

  let agentInput: AgentInput = {
    event: detectEventType(log),
    logs: log.messageRaw,
    resource_state: {
      type: mapping?.resourceType || log.resourceType,
      config: parsedConfig,
    },
    metadata: {
      resource: resourceKey,
      account_id: log.integrationId ?? mapping?.integrationId ?? undefined,
      region,
    },
    incident_id: incident.id,
    incident_status: agentStatus,
    repo_context: defaultFullName,
  };

  if (credential) {
    try {
      agentInput = {
        ...agentInput,
        resource_state: await fetchResourceState(agentInput, credential),
      };
    } catch (e) {
      console.warn("[Detector] fetchResourceState failed:", e);
    }
  }

  const runtime = credential ? createAwsAgentRuntime(credential) : {};

  try {
    const startTime = Date.now();
    const report = await runAgent(agentInput, runtime);
    const latency = Date.now() - startTime;

    await prisma.$transaction(async (tx: any) => {
      await tx.incidentEvent.update({
        where: { id: incidentEvent.id },
        data: { processingStatus: "processed" },
      });

      await tx.detectionAudit.upsert({
        where: { eventId: log.eventId },
        create: {
          eventId: log.eventId,
          engine: "llm",
          label: report.action_taken,
          confidence: report.confidence,
          explanation: report.root_cause,
          reportPayload: JSON.stringify(report),
          processingLatencyMs: latency,
        },
        update: {
          engine: "llm",
          label: report.action_taken,
          confidence: report.confidence,
          explanation: report.root_cause,
          reportPayload: JSON.stringify(report),
          processingLatencyMs: latency,
        },
      });

      await tx.incidentAction.create({
        data: {
          incidentId: incident.id,
          actionType: report.action_taken,
          status: mapActionStatusFromReport(report),
          requiresApproval: report.requires_human_review,
          failureReason:
            report.verification.status === "error"
              ? report.verification.evidence
              : (report.skip_reason ?? null),
        },
      });

      await tx.incident.update({
        where: { id: incident.id },
        data: {
          status: mapIncidentStatusFromReport(report),
          confidence: report.confidence,
        },
      });

      const latestRca = await tx.incidentRca.findFirst({
        where: { incidentId: incident.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      await tx.incidentRca.create({
        data: {
          incidentId: incident.id,
          rcaPayload: JSON.stringify(report.raw_output),
          version: (latestRca?.version ?? 0) + 1,
        },
      });
    });

    // Trigger the full pipeline (Steps 3-7) in the background
    runFullPipeline(incident.id).catch(err => {
      console.error(`[Detector] Orchestrator failed for incident ${incident.id}:`, err);
    });

    return report;
  } catch (error) {
    console.error(
      `[Detector] Agent execution failed for event ${log.eventId}:`,
      error,
    );
    await prisma.incidentEvent.update({
      where: { id: incidentEvent.id },
      data: { processingStatus: "failed" },
    });
    throw error;
  }
}

/**
 * Process a specific item from the database queue.
 * Used by the /api/detection/process route for immediate/parallel processing.
 */
export async function processQueueItem(eventId: string) {
  const item = await prisma.detectionQueue.findUnique({
    where: { eventId },
  });

  if (!item) {
    throw new Error(`Queue item ${eventId} not found in database.`);
  }

  return processNormalizedEvent(item.payload as unknown as NormalizedLogEvent);
}

export async function processLocalQueue() {
  // 1. Sweep database for pending items that might have been missed by the async trigger
  try {
    const pendingItems = await prisma.detectionQueue.findMany({
      where: { status: "pending" },
      take: 20,
      orderBy: { createdAt: "asc" },
    });

    if (pendingItems.length > 0) {
      console.log(`[Detector] Found ${pendingItems.length} pending items in DB queue.`);
      for (const item of pendingItems) {
        try {
          // Mark as processing to avoid double-processing during sweep
          await prisma.detectionQueue.update({
            where: { id: item.id },
            data: { status: "processing" },
          });

          const startedAt = Date.now();
          await processNormalizedEvent(item.payload as unknown as NormalizedLogEvent);
          
          await prisma.detectionQueue.update({
            where: { id: item.id },
            data: { 
              status: "completed",
              processedAt: new Date(),
              processingLatencyMs: Date.now() - startedAt
            },
          });
        } catch (err) {
          console.error(`[Detector] Failed to process DB item ${item.eventId}:`, err);
          await prisma.detectionQueue.update({
            where: { id: item.id },
            data: { 
              status: "pending", 
              retryCount: { increment: 1 },
              lastError: err instanceof Error ? err.message : String(err)
            },
          });
        }
      }
    }
  } catch (err) {
    console.error("[Detector] DB Queue sweep failed:", err);
  }

  // 2. Legacy: Cleanup/Process any remaining local files (Transition period)
  try {
    const files = await fs.readdir(BASE_DIR);
    const staleFiles = files.filter(
      (f) => f.startsWith("queue.processing-") && f.endsWith(".ndjson"),
    );

    for (const staleFile of staleFiles) {
      const filePath = path.join(BASE_DIR, staleFile);
      const stat = await fs.stat(filePath);
      // If older than 5 minutes, consider it stale and process it
      if (Date.now() - stat.mtimeMs > 5 * 60 * 1000) {
        console.log(`[Detector] Processing stale lock file: ${staleFile}`);
        await processQueueFile(filePath);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[Detector] Failed to check for stale lock files:", err);
    }
  }

  const processingFile = path.join(
    BASE_DIR,
    `queue.processing-${Date.now()}.ndjson`,
  );

  try {
    await fs.rename(QUEUE_FILE, processingFile);
    await processQueueFile(processingFile);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[Detector] Failed to lock queue file:", err);
    }
  }
}

async function processQueueFile(filePath: string) {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const lines = data.split("\n").filter((l) => l.trim().length > 0);

    console.log(`[Detector] Found ${lines.length} events in local queue.`);

    for (const line of lines) {
      try {
        const log = JSON.parse(line) as NormalizedLogEvent;
        await processNormalizedEvent(log);
      } catch (err) {
        console.error("[Detector] Failed to process line:", err);
      }
    }

    // Successfully processed, delete the processing file
    await fs.unlink(filePath);
  } catch (err) {
    console.error("[Detector] Error processing locked queue file:", err);
  }
}
