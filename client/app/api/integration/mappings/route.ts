import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { credentialId, mappings } = body;

    if (!credentialId || !mappings || !Array.isArray(mappings)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 1. Create/Update the Integration record
    const integration = await prisma.integration.upsert({
      where: {
        userId_provider_credentialId: {
          userId: user.id,
          provider: "aws",
          credentialId: credentialId,
        },
      },
      update: { status: "active" },
      create: {
        userId: user.id,
        credentialId: credentialId,
        provider: "aws",
        status: "active",
      },
    });

    // 2. Save the mappings
    const mappingOperations = mappings.map((m: any) => {
      return prisma.instanceMapping.upsert({
        where: {
          integrationId_logGroupName_resourceId: {
            integrationId: integration.id,
            logGroupName: m.logGroupName || "unknown",
            resourceId: m.resourceId,
          },
        },
        update: {
          repoFullName: m.repoFullName,
          confidence: m.confidence,
          source: m.source,
          status: "confirmed",
        },
        create: {
          integrationId: integration.id,
          repoFullName: m.repoFullName,
          logGroupName: m.logGroupName || "unknown",
          resourceId: m.resourceId,
          resourceType: m.resourceType,
          resourceLabel: m.resourceLabel,
          confidence: m.confidence,
          source: m.source,
          status: "confirmed",
        },
      });
    });

    await Promise.all(mappingOperations);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Mapping Save Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        integrations: {
          include: {
            mappings: {
              include: {
                repository: true
              }
            },
            credentials: true
          }
        }
      }
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Flatten mappings into a clean "project" list, filtering out soft-deleted repos
    const projects = user.integrations.flatMap(integration => 
      integration.mappings
        .filter(mapping => !mapping.repository || mapping.repository.deletedAt === null)
        .map(mapping => ({
          id: mapping.id,
          repoId: mapping.repositoryId,
          name: mapping.repoFullName.split("/")[1] || mapping.repoFullName,
          repo: mapping.repoFullName,
          credentialLabel: integration.credentials.label || "AWS Account",
          resourceId: mapping.resourceId,
          resourceType: mapping.resourceType,
          status: integration.status,
          updatedAt: mapping.updatedAt
        }))
    );

    return NextResponse.json({ success: true, projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
