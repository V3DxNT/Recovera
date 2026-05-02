import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { deleteLogBucket } from "@/lib/aws/CreateS3Bucket";
import { deleteFirehoseRoles } from "@/lib/aws/CreateIamRoles";
import { deleteDeliveryStream } from "@/lib/aws/CreateFirehose";
import { removeSubscriptionFilters } from "@/lib/aws/CreateCloudWatch";
import { validateCredentials } from "@/lib/aws/ValidateCredentials";

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
            mappings: true,
            credentials: true
          }
        }
      }
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Flatten mappings into a clean "project" list
    const projects = user.integrations.flatMap(integration => {
      // Parse provisioning details if available
      let provisioningSteps: any[] = [];
      if (integration.provisioningDetails) {
        try {
          provisioningSteps = JSON.parse(integration.provisioningDetails);
        } catch {}
      }

      // Find the step that failed (if any)
      const failedStep = provisioningSteps.find((s: any) => s.status === "failed");

      return integration.mappings.map(mapping => ({
        id: mapping.id,
        integrationId: integration.id,
        name: mapping.repoFullName.split("/")[1] || mapping.repoFullName,
        repo: mapping.repoFullName,
        credentialLabel: integration.credentials.label || "AWS Account",
        credentialRegion: integration.credentials.region || "us-east-1",
        resourceId: mapping.resourceId,
        resourceType: mapping.resourceType,
        resourceLabel: mapping.resourceLabel,
        logGroupName: mapping.logGroupName,
        status: integration.status,
        errorMessage: integration.errorMessage,
        failedStep: failedStep ? {
          step: failedStep.step,
          label: failedStep.label,
          resourceName: failedStep.resourceName,
          error: failedStep.error,
        } : null,
        provisioningSteps,
        s3BucketName: integration.s3BucketName,
        firehoseArn: integration.firehoseArn,
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt,
      }));
    });

    return NextResponse.json({ success: true, projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/integration/mappings
 *
 * Tears down AWS resources for a mapping and removes the integration from the DB.
 * Body: { mappingId: string }
 */
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mappingId } = body;

    if (!mappingId) {
      return NextResponse.json({ error: "Missing mappingId" }, { status: 400 });
    }

    // 1. Load the mapping + integration + credential
    const mapping = await prisma.instanceMapping.findUnique({
      where: { id: mappingId },
      include: {
        integration: {
          include: {
            credentials: true,
            mappings: true,
          },
        },
      },
    });

    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    // Verify ownership
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user || mapping.integration.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const integration = mapping.integration;
    const credential = integration.credentials;
    const isLastMapping = integration.mappings.length <= 1;

    // 2. Tear down AWS resources if this is the last mapping for the integration
    const cleanupErrors: string[] = [];
    if (isLastMapping) {
      try {
        // Remove CloudWatch subscription filters for this mapping's log groups
        if (mapping.logGroupName) {
          await removeSubscriptionFilters(credential, [mapping.logGroupName]);
        }
      } catch (err: any) {
        cleanupErrors.push(`CloudWatch: ${err.message}`);
      }

      try {
        if (integration.firehoseArn) {
          await deleteDeliveryStream(credential, user.id);
        }
      } catch (err: any) {
        cleanupErrors.push(`Firehose: ${err.message}`);
      }

      try {
        const identity = await validateCredentials(credential);
        if (identity) {
          await deleteFirehoseRoles(credential, identity.accountId, credential.region || "us-east-1");
        }
      } catch (err: any) {
        cleanupErrors.push(`IAM: ${err.message}`);
      }

      try {
        if (integration.s3BucketName) {
          await deleteLogBucket(credential, integration.s3BucketName);
        }
      } catch (err: any) {
        cleanupErrors.push(`S3: ${err.message}`);
      }
    } else {
      // Not the last mapping — just remove the CloudWatch subscription for this mapping
      try {
        if (mapping.logGroupName) {
          await removeSubscriptionFilters(credential, [mapping.logGroupName]);
        }
      } catch (err: any) {
        cleanupErrors.push(`CloudWatch: ${err.message}`);
      }
    }

    // 3. Delete the mapping from the database
    await prisma.instanceMapping.delete({ where: { id: mappingId } });

    // 4. If the last mapping was deleted, remove the integration + related repository records
    if (isLastMapping) {
      // Delete incidents & repository for this repo
      const repository = await prisma.repository.findFirst({
        where: { userId: user.id, fullName: mapping.repoFullName },
      });
      if (repository) {
        await prisma.incident.deleteMany({ where: { repositoryId: repository.id } });
        await prisma.repository.delete({ where: { id: repository.id } });
      }

      await prisma.integration.delete({ where: { id: integration.id } });
    }

    return NextResponse.json({
      success: true,
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
      integrationDeleted: isLastMapping,
    });
  } catch (error: any) {
    console.error("Delete Mapping Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
