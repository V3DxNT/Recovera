import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all patch artifacts
    const patches = await prisma.patchArtifact.findMany({
      select: {
        validationStatus: true,
      }
    });

    const total = patches.length;
    let passed = 0;
    let failed = 0;
    let pending = 0;

    for (const patch of patches) {
      if (patch.validationStatus === "passed") passed++;
      else if (patch.validationStatus === "failed") failed++;
      else pending++;
    }

    const passRate = total > 0 ? (passed / total) * 100 : 0;
    const rejectionRate = total > 0 ? (failed / total) * 100 : 0;
    // Rollback rate would involve joining with IncidentAction (Step 6) and looking for "reverted" statuses.

    return NextResponse.json({
      total,
      passed,
      failed,
      pending,
      metrics: {
        passRate: passRate.toFixed(2) + "%",
        rejectionRate: rejectionRate.toFixed(2) + "%",
        falseFixRate: "N/A (Requires post-merge analysis)"
      }
    });

  } catch (error: unknown) {
    console.error("[Metrics API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
