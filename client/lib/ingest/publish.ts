import { publishNormalizedEvents } from "./store";
import { NormalizedLogEvent } from "./types";

/**
 * Queue publisher abstraction for Step 1.
 * Current implementation writes NDJSON queue events to local disk.
 * Future Step 2 should replace this with BullMQ/Kafka/Redis streams.
 */
export async function publishForProcessing(events: NormalizedLogEvent[]) {
  await publishNormalizedEvents(events);
}
