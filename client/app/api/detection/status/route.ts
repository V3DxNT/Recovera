import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const repoFullName = searchParams.get("repoFullName");

    if (!repoFullName) {
      return NextResponse.json({ error: "Missing repoFullName" }, { status: 400 });
    }

    // 1. Find all integration IDs associated with this repo
    const mappings = await prisma.instanceMapping.findMany({
      where: { repoFullName },
      select: { integrationId: true }
    });

    const integrationIds = [...new Set(mappings.map(m => m.integrationId))];

    if (integrationIds.length === 0) {
      return NextResponse.json({ pendingCount: 0 });
    }

    // 2. Count pending items in queue for these integrations
    // Note: This requires the payload to be searchable or have a specific structure.
    // Since it's a Json field, we can use a raw query or Prisma's Json filtering if supported.
    
    // For simplicity in this env, we'll check status and filter in memory or use a simple contains if possible.
    // In production, we'd use a dedicated indexed column for integrationId in DetectionQueue.
    
    const pendingItems = await prisma.detectionQueue.count({
      where: {
        status: "pending",
        // We assume the payload contains integrationId at the root
        payload: {
          path: ["integrationId"],
          array_contains: integrationIds
        } as any
      }
    });

    return NextResponse.json({ 
      pendingCount: pendingItems,
      isProcessing: pendingItems > 0
    });

  } catch (error: any) {
    console.error("[Queue Status API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
