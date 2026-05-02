import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const repoIdentifier = (body?.repoFullName || body?.repoName || "").trim();

    if (!repoIdentifier) {
      return NextResponse.json({ error: "repoFullName or repoName is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const repository = await prisma.repository.findFirst({
      where: {
        userId: user.id,
        OR: [{ fullName: repoIdentifier }, { name: repoIdentifier }],
      },
      select: { id: true, fullName: true, name: true },
    });

    const repoKeys = Array.from(
      new Set(
        [repoIdentifier, repository?.fullName, repository?.name]
          .filter((v): v is string => Boolean(v && v.trim()))
          .map((v) => v.trim())
      )
    );

    const relatedRepositories = await prisma.repository.findMany({
      where: {
        userId: user.id,
        OR: [
          { fullName: { in: repoKeys } },
          { name: { in: repoKeys } },
          { fullName: { endsWith: `/${repoIdentifier}` } },
        ],
      },
      select: { id: true },
    });

    const relatedRepoIds = relatedRepositories.map((r) => r.id);

    const result = await prisma.$transaction(async (tx) => {
      const deletedMappings = await tx.instanceMapping.deleteMany({
        where: {
          integration: { userId: user.id },
          OR: [
            { repoFullName: { in: repoKeys } },
            { repoFullName: { endsWith: `/${repoIdentifier}` } },
            ...(relatedRepoIds.length > 0 ? [{ repositoryId: { in: relatedRepoIds } }] : []),
          ],
        },
      });

      let deletedRepository = 0;
      if (relatedRepoIds.length > 0) {
        const repoDelete = await tx.repository.deleteMany({
          where: {
            id: { in: relatedRepoIds },
            userId: user.id,
          },
        });
        deletedRepository = repoDelete.count;
      }

      return { deletedMappings: deletedMappings.count, deletedRepository };
    });

    return NextResponse.json({
      success: true,
      deletedRepository: result.deletedRepository,
      deletedMappings: result.deletedMappings,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
