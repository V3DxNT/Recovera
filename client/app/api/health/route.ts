import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

let lastAlertTime = 0;

export async function GET() {
  console.log("Prisma keys:", Object.keys(prisma));
  try {
    const [pending, processing, failed, completed] = await Promise.all([
      prisma.detectionQueue.count({ where: { status: "pending" } }),
      prisma.detectionQueue.count({ where: { status: "processing" } }),
      prisma.detectionQueue.count({ where: { status: "failed" } }),
      prisma.detectionQueue.count({ where: { status: "completed" } }),
    ]);

    // Calculate throughput and lag from recent audits
    const recentAudits = await prisma.detectionAudit.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    const avgLatency = recentAudits.length
      ? recentAudits.reduce((acc, curr) => acc + (curr.processingLatencyMs || 0), 0) / recentAudits.length
      : 0;

    const oldestPending = await prisma.detectionQueue.findFirst({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    const processingLagMs = oldestPending
      ? Date.now() - new Date(oldestPending.createdAt).getTime()
      : 0;

    const alerts: string[] = [];
    if (processingLagMs > 120000) {
      alerts.push("CRITICAL_LAG: Processing delay exceeds 2 minutes");
    }
    if (failed > 10) {
      alerts.push("HIGH_FAILURE_RATE: More than 10 events failed in the queue");
    }

    const overallStatus = alerts.length > 0 ? "degraded" : "healthy";

    if (overallStatus === "degraded" && process.env.SLACK_WEBHOOK_URL) {
      if (Date.now() - lastAlertTime >= 5 * 60 * 1000) {
        lastAlertTime = Date.now();
        
        fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "🚨 System Degraded",
            attachments: [
              {
                color: "danger",
                fields: [
                  { title: "Status", value: "Degraded", short: true },
                  { title: "Action", value: "Check Dashboard", short: true },
                  { title: "Details", value: alerts.join(", "), short: false }
                ]
              }
            ]
          })
        }).catch(err => console.error("Failed to send slack webhook", err));
      }
    }

    return NextResponse.json({
      status: overallStatus,
      alerts,
      pipeline: {
        queue: {
          pending,
          processing,
          failed,
          completed,
          processingLagMs,
        },
        performance: {
          avgProcessingLatencyMs: Math.round(avgLatency),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "degraded",
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
