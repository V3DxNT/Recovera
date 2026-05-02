import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INTERNAL_KEY = process.env.RECOVERA_INTERNAL_KEY!;
const STALE_THRESHOLD_MS = 5_000; // 5s

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("x-recovera-internal");
  if (authHeader !== INTERNAL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleEvents = await prisma.detectionQueue.findMany({
    where: {
      status: "pending",
      createdAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
    take: 50, // Increased batch size
    orderBy: { createdAt: "asc" }
  });

  const baseUrl = process.env.NEXTAUTH_URL || `http://${req.headers.get("host")}`;

  // Parallel processing with Promise.allSettled to avoid one failure blocking others
  const results = await Promise.allSettled(
    staleEvents.map(async (event) => {
      const response = await fetch(`${baseUrl}/api/detection/process`, {
        method: "POST",
        headers: {
          "x-recovera-internal": INTERNAL_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventId: event.eventId }),
      });
      return { eventId: event.eventId, status: response.status };
    })
  );

  const summary = results.map((r, i) => ({
    eventId: staleEvents[i].eventId,
    result: r.status === "fulfilled" ? r.value.status : "rejected"
  }));

  return NextResponse.json({ 
    processed: results.length, 
    successCount: results.filter(r => r.status === "fulfilled").length,
    summary 
  });
}
