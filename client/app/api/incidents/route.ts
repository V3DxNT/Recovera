import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const repoFullName = searchParams.get("repoFullName");

    if (!repoFullName) {
      return NextResponse.json({ error: "repoFullName is required" }, { status: 400 });
    }

    const repository = await prisma.repository.findFirst({
      where: { fullName: repoFullName },
      include: {
        mappings: {
          include: {
            integration: {
              include: { credentials: true }
            }
          }
        }
      }
    });

    const incidents = await prisma.incident.findMany({
      where: { repository: { fullName: repoFullName } },
      orderBy: { createdAt: "desc" },
      include: {
        patches: { orderBy: { createdAt: "desc" } },
        actions: { orderBy: { createdAt: "desc" } },
        rcaVersions: { orderBy: { createdAt: "desc" }, take: 1 },
      }
    });

    return NextResponse.json({ incidents, repository }, { status: 200 });
  } catch (error: any) {
    console.error("[Get Incidents API] Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
