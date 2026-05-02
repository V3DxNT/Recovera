import { decodeFirehoseRecordData, parseFirehoseRequestBody, toPreview } from "./firehose";
import { normalizeLogEntry } from "./normalize";
import { publishForProcessing } from "./publish";
import { persistRawRecord, persistToDlq } from "./store";
import { NormalizedLogEvent } from "./types";

export async function processIngestPayload(params: {
  body: unknown;
  integrationId: string | null;
  resolveRepo?: Parameters<typeof normalizeLogEntry>[0]["resolveRepo"];
}) {
  const parsedBody = parseFirehoseRequestBody(params.body);
  const requestId = parsedBody.requestId ?? null;

  const accepted: NormalizedLogEvent[] = [];
  const failedIds: string[] = [];
  const seenEventIds = new Set<string>();

  for (const record of parsedBody.records) {
    const recordId = record?.recordId ?? null;
    try {
      const decoded = decodeFirehoseRecordData(record);
      const parsed = decoded.parsed;

      // Skip CloudWatch Logs Control Messages
      if (parsed.messageType === "CONTROL_MESSAGE") {
        continue;
      }

      await persistRawRecord({
        requestId,
        recordId,
        integrationId: params.integrationId,
        receivedAt: new Date().toISOString(),
        payloadPreview: toPreview(parsed),
      });

      // Handle CloudWatch Logs Batched Data (unpack logEvents)
      const events = Array.isArray(parsed.logEvents) ? parsed.logEvents : [parsed];

      for (const event of events) {
        // Merge envelope info (logGroup, logStream, owner) with the event data
        const combinedEntry = Array.isArray(parsed.logEvents)
          ? { ...parsed, ...event, logEvents: undefined }
          : parsed;

        const normalized = await normalizeLogEntry({
          integrationId: params.integrationId,
          requestId,
          recordId,
          logEntry: combinedEntry,
          rawText: typeof event.message === "string" ? event.message : decoded.rawText,
          resolveRepo: params.resolveRepo,
        });

        if (seenEventIds.has(normalized.eventId)) continue;
        seenEventIds.add(normalized.eventId);
        accepted.push(normalized);
      }
    } catch (error: unknown) {
      failedIds.push(recordId ?? "unknown");
      const reason = error instanceof Error ? error.message : "Unknown parse error";
      await persistToDlq({
        requestId,
        recordId,
        reason,
        payloadPreview: toPreview(record),
        failedAt: new Date().toISOString(),
      });
    }
  }

  await publishForProcessing(accepted);

  return {
    requestId,
    processed: parsedBody.records.length,
    accepted: accepted.length,
    failed: failedIds.length,
    failedIds,
  };
}
