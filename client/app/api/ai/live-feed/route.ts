import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const repoFullName = searchParams.get("repoFullName");

    if (!repoFullName) {
      return NextResponse.json({ error: "repoFullName is required" }, { status: 400 });
    }

    // Fetch latest safety audits and incident actions for this repo
    const activities = await prisma.$queryRaw`
      (SELECT 
        id, 
        'safety_audit' as type, 
        decision as status, 
        actionType as label, 
        reasonCodes as details, 
        "createdAt" 
      FROM "SafetyAuditLog" 
      WHERE "incidentId" IN (SELECT id FROM "Incident" WHERE "repositoryId" = (SELECT id FROM "Repository" WHERE "fullName" = ${repoFullName}))
      ORDER BY "createdAt" DESC 
      LIMIT 10)
      
      UNION ALL
      
      (SELECT 
        id, 
        'action' as type, 
        status, 
        actionType as label, 
        "failureReason" as details, 
        "createdAt" 
      FROM "IncidentAction" 
      WHERE "incidentId" IN (SELECT id FROM "Incident" WHERE "repositoryId" = (SELECT id FROM "Repository" WHERE "fullName" = ${repoFullName}))
      ORDER BY "createdAt" DESC 
      LIMIT 10)
      
      ORDER BY "createdAt" DESC
      LIMIT 15
    `;

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("Failed to fetch live feed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
