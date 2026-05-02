import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { prisma } from "../prisma";
import { NormalizedLogEvent } from "../ingest/types";
import { runAgent } from "../../Agentic-AI/agent";
import { AgentInput, EventType, IncidentStatus, ResourceSnapshot } from "../../Agentic-AI/agent/types";
const BASE_DIR = path.join(process.cwd(), ".recovera-ingest");
const QUEUE_FILE = path.join(BASE_DIR, "queue.ndjson");

const FINGERPRINT_VERSION = "v1";

function generateFingerprint(log: NormalizedLogEvent): string {
  let normalizedMsg = log.messageRaw || "";
  normalizedMsg = normalizedMsg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, "<UUID>");
  normalizedMsg = normalizedMsg.replace(/\b\d+\b/g, "<NUM>");
  
  const stackMatch = normalizedMsg.match(/at\s+.*?\s+\((.*?):\d+:\d+\)/);
  const stackTop = stackMatch ? stackMatch[1] : "unknown_location";

  const components = [
    log.repoFullName || "unknown_repo",
    log.resourceType,
    stackTop,
    normalizedMsg.substring(0, 100)
  ];

  const hash = crypto.createHash("sha256").update(components.join("::")).digest("hex");
  return `${FINGERPRINT_VERSION}_${hash.substring(0, 16)}`;
}

export function detectEventType(log: NormalizedLogEvent): EventType {
  const msg = (log.messageRaw || "").toLowerCase();
  if (msg.includes("s3") && (msg.includes("public") || msg.includes("access denied"))) return "S3_PUBLIC";
  if (msg.includes("iam") || msg.includes("assume role") || msg.includes("not authorized")) return "IAM_OVERPERMISSION";
  if (msg.includes("security group") || msg.includes("timeout") || msg.includes("connection refused")) return "SG_OPEN_PORT";
  return "UNKNOWN";
}

export async function processNormalizedEvent(log: NormalizedLogEvent) {
  const fingerprint = generateFingerprint(log);
  
  const existingEvent = await prisma.incidentEvent.findUnique({
    where: { eventId: log.eventId }
  });

  if (existingEvent && existingEvent.processingStatus === "processed") {
    console.log(`[Detector] Skipped event ${log.eventId} - already successfully processed.`);
    return;
  }

  const defaultFullName = log.repoFullName || "unknown/repo";

  let repo = await prisma.repository.findFirst({
    where: { fullName: defaultFullName }
  });

  if (!repo) {
    let user = await prisma.user.findFirst();
    if (!user) user = await prisma.user.create({ data: { name: "System", email: "system@recovera.dev" } });
    repo = await prisma.repository.create({
      data: {
        userId: user.id,
        fullName: defaultFullName,
        name: defaultFullName.split("/").pop() || "repo",
        htmlUrl: `https://github.com/${defaultFullName}`
      }
    });
  }

  const incident = await prisma.incident.upsert({
    where: { repositoryId_fingerprint: { repositoryId: repo.id, fingerprint } },
    create: {
      repositoryId: repo.id,
      fingerprint,
      title: `Incident: ${log.resourceType} failure`,
      severity: "medium",
      status: "open",
      eventCount: 1,
      firstSeenAt: new Date(log.timestamp || new Date()),
      lastSeenAt: new Date(log.timestamp || new Date())
    },
    update: {
      eventCount: existingEvent ? undefined : { increment: 1 },
      lastSeenAt: new Date(log.timestamp || new Date())
    }
  });

  const incidentEvent = await prisma.incidentEvent.upsert({
    where: { eventId: log.eventId },
    create: {
      incidentId: incident.id,
      eventId: log.eventId,
      rawExcerpt: log.messageRaw,
      detectedAt: new Date(),
      processingStatus: "pending"
    },
    update: {
      processingStatus: "pending" // mark as pending again for retry
    }
  });

  let agentStatus: IncidentStatus = "pending";
  if (incident.status === "open") agentStatus = "pending";
  if (incident.status === "investigating") agentStatus = "running";
  if (incident.status === "resolved" || incident.status === "mitigated") agentStatus = "done";
  
  let state: ResourceSnapshot = { type: log.resourceType, config: {} };
  if (log.messageParsed && typeof log.messageParsed === "object") {
    state.config = log.messageParsed as Record<string, unknown>;
  }

  const agentInput: AgentInput = {
    event: detectEventType(log),
    logs: log.messageRaw,
    resource_state: state,
    metadata: {
      resource: log.resourceId || "unknown_resource",
      account_id: log.integrationId || undefined,
      region: "us-east-1"
    },
    incident_id: incident.id,
    incident_status: agentStatus,
    repo_context: log.repoFullName || undefined
  };

  try {
    const report = await runAgent(agentInput);
    
    await prisma.$transaction(async (tx) => {
      await tx.incidentEvent.update({
        where: { id: incidentEvent.id },
        data: { processingStatus: "processed" }
      });

      await tx.detectionAudit.upsert({
        where: { eventId: log.eventId },
        create: {
          eventId: log.eventId,
          engine: "llm",
          label: report.action_taken,
          confidence: report.confidence,
          explanation: report.root_cause,
          reportPayload: JSON.stringify(report)
        },
        update: {
          engine: "llm",
          label: report.action_taken,
          confidence: report.confidence,
          explanation: report.root_cause,
          reportPayload: JSON.stringify(report)
        }
      });

      if (!report.skip_reason) {
        let newStatus = "investigating";
        if (report.verification.resolved === true) newStatus = "resolved";
        await tx.incident.update({
          where: { id: incident.id },
          data: { status: newStatus }
        });
      }
    });

    return report;
  } catch (error) {
    console.error(`[Detector] Agent execution failed for event ${log.eventId}:`, error);
    await prisma.incidentEvent.update({
      where: { id: incidentEvent.id },
      data: { processingStatus: "failed" }
    });
    throw error;
  }
}

export async function processLocalQueue() {
  try {
    const files = await fs.readdir(BASE_DIR);
    const staleFiles = files.filter(f => f.startsWith("queue.processing-") && f.endsWith(".ndjson"));
    
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

  const processingFile = path.join(BASE_DIR, `queue.processing-${Date.now()}.ndjson`);
  
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
    const lines = data.split("\n").filter(l => l.trim().length > 0);
    
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
