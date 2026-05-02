import { mkdir, appendFile } from "fs/promises";
import path from "path";

const BASE_DIR = path.join(process.cwd(), ".recovera-ingest");
const METRICS_FILE = path.join(BASE_DIR, "metrics.ndjson");
const ALERTS_FILE = path.join(BASE_DIR, "alerts.ndjson");

async function ensureDir() {
  await mkdir(BASE_DIR, { recursive: true });
}

export interface IngestMetricsInput {
  requestId: string | null;
  processed: number;
  accepted: number;
  failed: number;
  durationMs: number;
}

export async function recordIngestMetrics(input: IngestMetricsInput) {
  await ensureDir();
  const entry = {
    ...input,
    parseFailurePct: input.processed ? Number(((input.failed / input.processed) * 100).toFixed(2)) : 0,
    ts: new Date().toISOString(),
  };
  await appendFile(METRICS_FILE, `${JSON.stringify(entry)}\n`, "utf-8");
  return entry;
}

export async function maybeRecordIngestAlert(input: {
  requestId: string | null;
  processed: number;
  failed: number;
  thresholdPct?: number;
}) {
  const thresholdPct = input.thresholdPct ?? 20;
  const failurePct = input.processed ? (input.failed / input.processed) * 100 : 0;
  if (failurePct < thresholdPct) return false;

  await ensureDir();
  await appendFile(
    ALERTS_FILE,
    `${JSON.stringify({
      type: "ingest_failure_rate_high",
      requestId: input.requestId,
      processed: input.processed,
      failed: input.failed,
      failurePct: Number(failurePct.toFixed(2)),
      thresholdPct,
      ts: new Date().toISOString(),
    })}\n`,
    "utf-8"
  );
  return true;
}
