import { extractLogMetadata } from "@/lib/aws/parseLogMetadata";
import { resolveRepoMapping } from "@/lib/aws/repoMapper";
import { buildEventId } from "./firehose";
import { NormalizedLogEvent } from "./types";

function inferResourceType(logGroupName: string | null): NormalizedLogEvent["resourceType"] {
  if (!logGroupName) return "unknown";
  const lower = logGroupName.toLowerCase();
  if (lower.includes("/ecs/")) return "ecs";
  if (lower.includes("/eks/")) return "eks";
  if (lower.includes("/ec2/")) return "ec2";
  if (lower.includes("/lambda/")) return "lambda";
  return "unknown";
}

function extractLogGroupName(logEntry: Record<string, unknown>): string | null {
  const aws = logEntry?.aws as { logGroup?: unknown } | undefined;
  return (
    (typeof logEntry?.logGroup === "string" ? logEntry.logGroup : null) ||
    (typeof logEntry?.logGroupName === "string" ? logEntry.logGroupName : null) ||
    (typeof aws?.logGroup === "string" ? aws.logGroup : null)
  );
}

function extractLogStreamName(logEntry: Record<string, unknown>): string | null {
  const aws = logEntry?.aws as { logStream?: unknown } | undefined;
  return (
    (typeof logEntry?.logStream === "string" ? logEntry.logStream : null) ||
    (typeof logEntry?.logStreamName === "string" ? logEntry.logStreamName : null) ||
    (typeof aws?.logStream === "string" ? aws.logStream : null)
  );
}

export async function normalizeLogEntry(params: {
  integrationId: string | null;
  requestId: string | null;
  recordId: string | null;
  logEntry: Record<string, unknown>;
  rawText: string;
  resolveRepo?: typeof resolveRepoMapping;
}): Promise<NormalizedLogEvent> {
  const { integrationId, requestId, recordId, logEntry, rawText } = params;
  const resolver = params.resolveRepo ?? resolveRepoMapping;
  const metadata = extractLogMetadata(logEntry);
  const logGroupName = extractLogGroupName(logEntry);
  const logStreamName = extractLogStreamName(logEntry);
  const resourceId = typeof logEntry?.resourceId === "string" ? logEntry.resourceId : null;
  const timestamp =
    metadata.timestamp ||
    (typeof logEntry?.timestamp === "string" ? logEntry.timestamp : null) ||
    new Date().toISOString();

  const repoFullName = await resolver({
    integrationId: integrationId ?? undefined,
    logGroupName,
    serviceName: metadata.serviceName,
    resourceId,
  });

  return {
    eventId: buildEventId([integrationId, logGroupName, logStreamName, timestamp, metadata.logMessage, rawText]),
    integrationId,
    provider: "aws",
    requestId,
    recordId,
    logGroupName,
    logStreamName,
    resourceId,
    resourceType: inferResourceType(logGroupName),
    serviceName: metadata.serviceName,
    repoFullName,
    messageRaw: rawText,
    messageParsed: logEntry,
    timestamp,
    ingestedAt: new Date().toISOString(),
    parseStatus: "ok",
  };
}
