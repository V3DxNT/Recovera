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
      await persistRawRecord({
        requestId,
        recordId,
        integrationId: params.integrationId,
        receivedAt: new Date().toISOString(),
        payloadPreview: toPreview(decoded.parsed),
      });

      const normalized = await normalizeLogEntry({
        integrationId: params.integrationId,
        requestId,
        recordId,
        logEntry: decoded.parsed,
        rawText: decoded.rawText,
        resolveRepo: params.resolveRepo,
      });

      if (seenEventIds.has(normalized.eventId)) continue;
      seenEventIds.add(normalized.eventId);
      accepted.push(normalized);
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
