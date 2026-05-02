import { NextRequest, NextResponse } from "next/server";
import { processLocalQueue, processQueueItem } from "@/lib/detection/detector";
import { prisma } from "@/lib/prisma";

const INTERNAL_KEY = process.env.RECOVERA_INTERNAL_KEY!;
const MAX_RETRIES = 3;

export async function POST(req: NextRequest) {
  // Security: Only internal calls allowed
  const authHeader = req.headers.get("x-recovera-internal");
  if (authHeader !== INTERNAL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await req.json();

  try {
    // Idempotency: Check if already processed
    const queueItem = await prisma.detectionQueue.findUnique({
      where: { eventId },
    });

    if (!queueItem) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (queueItem.status === "completed") {
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    if (queueItem.retryCount >= MAX_RETRIES) {
      // Move to dead letter queue (status failed)
      await prisma.detectionQueue.update({
        where: { eventId },
        data: { status: "failed", lastError: "Max retries exceeded" },
      });
      return NextResponse.json({ error: "Max retries exceeded" }, { status: 429 });
    }

    // Mark as processing
    const startedAt = Date.now();
    await prisma.detectionQueue.update({
      where: { eventId },
      data: { status: "processing" },
    });

    // Run detection for THIS specific event
    await processQueueItem(eventId);

    const durationMs = Date.now() - startedAt;

    // Mark complete
    await prisma.detectionQueue.update({
      where: { eventId },
      data: { 
        status: "completed", 
        processedAt: new Date(),
        processingLatencyMs: durationMs 
      },
    });

    return NextResponse.json({ message: "Processed", durationMs }, { status: 200 });
  } catch (error) {
    // Increment retry count
    await prisma.detectionQueue.update({
      where: { eventId },
      data: {
        retryCount: { increment: 1 },
        lastError: error instanceof Error ? error.message : "Unknown error",
        status: "pending", // Back to pending for retry
      },
    });

    console.error("[DETECTION] Processing failed:", error);
    return NextResponse.json(
      { error: "Processing failed", willRetry: true },
      { status: 500 },
    );
  }
}
