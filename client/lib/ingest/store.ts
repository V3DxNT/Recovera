import { mkdir, appendFile } from "fs/promises";
import path from "path";
import { DeadLetterEvent, NormalizedLogEvent } from "./types";

const BASE_DIR = path.join(process.cwd(), ".recovera-ingest");
const QUEUE_FILE = path.join(BASE_DIR, "queue.ndjson");
const DLQ_FILE = path.join(BASE_DIR, "dead-letter.ndjson");
const RAW_FILE = path.join(BASE_DIR, "raw-events.ndjson");

async function ensureDir() {
  await mkdir(BASE_DIR, { recursive: true });
}

function toNdjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export async function persistRawRecord(raw: unknown) {
  await ensureDir();
  await appendFile(RAW_FILE, toNdjsonLine(raw), "utf-8");
}

export async function persistToDlq(event: DeadLetterEvent) {
  await ensureDir();
  await appendFile(DLQ_FILE, toNdjsonLine(event), "utf-8");
}

export async function publishNormalizedEvents(events: NormalizedLogEvent[]) {
  if (!events.length) return;
  await ensureDir();
  await appendFile(QUEUE_FILE, events.map(toNdjsonLine).join(""), "utf-8");
}
