import { gunzipSync } from "zlib";
import { createHash } from "crypto";
import { FirehoseBatchInput, FirehoseInputRecord } from "./types";

function tryGunzipBuffer(buffer: Buffer): Buffer {
  try {
    return gunzipSync(buffer);
  } catch {
    return buffer;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function buildEventId(parts: Array<string | null | undefined>): string {
  const payload = parts.map((p) => p ?? "").join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function parseFirehoseRequestBody(body: unknown): FirehoseBatchInput {
  if (!body || typeof body !== "object") {
    return { records: [] };
  }

  const maybe = body as Record<string, unknown>;
  const records = Array.isArray(maybe.records) ? (maybe.records as FirehoseInputRecord[]) : [];

  return {
    requestId: typeof maybe.requestId === "string" ? maybe.requestId : undefined,
    timestamp: typeof maybe.timestamp === "number" ? maybe.timestamp : undefined,
    records,
  };
}

export function decodeFirehoseRecordData(record: FirehoseInputRecord): {
  rawText: string;
  parsed: Record<string, unknown>;
} {
  if (!record?.data || typeof record.data !== "string") {
    throw new Error("Missing record.data");
  }

  const compressed = Buffer.from(record.data, "base64");
  const maybeJson = tryGunzipBuffer(compressed).toString("utf-8").trim();
  const parsed = JSON.parse(maybeJson) as Record<string, unknown>;

  return { rawText: maybeJson, parsed };
}

export function toPreview(value: unknown, limit = 600): string {
  const text = safeStringify(value);
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
