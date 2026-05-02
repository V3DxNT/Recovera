import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { actionId } = await req.json();
    if (!actionId) {
      return NextResponse.json({ error: "Missing actionId" }, { status: 400 });
    }

    const incidentAction = await prisma.incidentAction.findUnique({
      where: { id: actionId },
    });

    if (!incidentAction) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    if (incidentAction.incidentId !== id) {
      return NextResponse.json({ error: "Action does not belong to this incident" }, { status: 400 });
    }

    if (!incidentAction.requiresApproval || incidentAction.status !== "pending_approval") {
      return NextResponse.json({ error: "Action does not require approval or is already processed" }, { status: 400 });
    }

    // Update the action status so the client can now retry PR creation
    await prisma.incidentAction.update({
      where: { id: actionId },
      data: {
        status: "pending",
        requiresApproval: false, // human override removes the gate
      }
    });

    // We also log this in the SafetyAuditLog
    await prisma.safetyAuditLog.create({
      data: {
        incidentId: id,
        actionType: "human_override",
        decision: "ALLOW_AUTO_PR",
        reasonCodes: "HUMAN_APPROVED",
        riskScore: 0,
        details: `Human approval granted by ${session.user.email} for Action ${actionId}`,
      }
    });

    return NextResponse.json({ success: true, message: "Action approved successfully." });
  } catch (error: any) {
    console.error("[Safety Approval API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
