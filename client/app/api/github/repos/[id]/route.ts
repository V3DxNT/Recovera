import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { removeSubscriptionFilters } from "@/lib/aws/CreateCloudWatch";

/**
 * DELETE /api/github/repos/[id]
 * 
 * Performs a soft-delete on the repository and triggers background deprovisioning
 * of the associated CloudWatch subscription filters.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 1. Fetch the repository and its mappings
    const repo = await prisma.repository.findFirst({
      where: { id: id, userId: user.id },
      include: {
        mappings: {
          include: {
            integration: {
              include: {
                credentials: true
              }
            }
          }
        }
      }
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // 2. Perform soft-delete in DB immediately for responsive UI
    await prisma.repository.update({
      where: { id: repo.id },
      data: { deletedAt: new Date() }
    });

    // 3. Trigger background deprovisioning (Async)
    // We group mappings by integration/credential to minimize AWS client overhead
    const mappings = (repo as any).mappings || [];
    const integrationGroups = mappings.reduce((acc: any, m: any) => {
      if (!m.integration || !m.integration.credential) return acc;
      const key = m.integrationId;
      if (!acc[key]) acc[key] = { credential: m.integration.credential, logGroups: [] };
      acc[key].logGroups.push(m.logGroupName);
      return acc;
    }, {} as Record<string, { credential: any, logGroups: string[] }>);

    // Detached promise for background cleanup
    (async () => {
      for (const group of Object.values(integrationGroups) as any[]) {
        try {
          console.log(`[Deprovision] Removing subscription filters for repo ${repo.fullName} from ${group.logGroups.length} log groups...`);
          await removeSubscriptionFilters(group.credential, group.logGroups);
          
          // Optionally delete InstanceMappings
          await prisma.instanceMapping.deleteMany({
            where: { repositoryId: repo.id, integrationId: (group.credential as any).integrationId }
          });
        } catch (err) {
          console.error(`[Deprovision] Failed to cleanup AWS resources for repo ${repo.id}:`, err);
        }
      }
    })();

    return NextResponse.json({ success: true, message: "Repository soft-deleted and cleanup triggered." });
  } catch (error: any) {
    console.error("Repository Delete Error:", error);
    return NextResponse.json({ error: "Failed to delete repository." }, { status: 500 });
  }
}
