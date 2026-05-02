import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { createLogBucket, deleteLogBucket } from "@/lib/aws/CreateS3Bucket";
import { createFirehoseRoles, deleteFirehoseRoles } from "@/lib/aws/CreateIamRoles";
import { createDeliveryStream, deleteDeliveryStream } from "@/lib/aws/CreateFirehose";
import { subscribeLogGroups, removeSubscriptionFilters } from "@/lib/aws/CreateCloudWatch";
import { validateCredentials } from "@/lib/aws/ValidateCredentials";

interface MappingInput {
  repoFullName: string;   // "user/payment-api"
  logGroupName: string;   // "/aws/eks/cluster/containers"
  resourceId?: string;    // instance ID, ARN, or image name
  resourceType: string;   // "ec2" | "ecs" | "eks" | "lambda" | "log_group"
  resourceLabel?: string; // friendly name
}

/**
 * POST /api/integration/provision
 * 
 * Phase 2 — Provisions AWS infrastructure and saves instance-to-repo mappings.
 * Only subscribes the log groups that the user explicitly mapped.
 */
export async function POST(req: Request) {
  const createdResources: string[] = [];
  let bucketName: string | undefined;
  let identity: any | undefined;
  let uniqueLogGroups: string[] = [];
  let credentialId: string | undefined;

  try {
    // 0. Validate Environment Variables
    const ingestUrl = process.env.INGEST_API_URL;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!ingestUrl || !encryptionKey) {
      return NextResponse.json(
        { error: "Server configuration error: Missing INGEST_API_URL or ENCRYPTION_KEY" },
        { status: 500 }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    credentialId = body.credentialId;
    const mappings = body.mappings as MappingInput[];

    if (!credentialId || !mappings?.length) {
      return NextResponse.json(
        { error: "credentialId and at least one mapping are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const credential = await prisma.cloudCredential.findFirst({
      where: { id: credentialId, userId: user.id },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    const region = credential.region || "us-east-1";

    // 1. Validate credentials
    identity = await validateCredentials(credential);

    // 2. Create S3 bucket
    bucketName = await createLogBucket(credential, user.id);
    createdResources.push("s3");

    // 3. Create IAM Roles
    const { firehoseRoleArn, cwRoleArn } = await createFirehoseRoles(
      credential, bucketName, identity.accountId, region
    );
    createdResources.push("iam");

    // 4. Create Firehose delivery stream
    const firehoseArn = await createDeliveryStream(
      credential, user.id, firehoseRoleArn, bucketName, ingestUrl
    );
    createdResources.push("firehose");

    // 5. Subscribe ONLY the selected log groups
    uniqueLogGroups = [...new Set(mappings.map(m => m.logGroupName))];
    const subscribedGroups = await subscribeLogGroups(
      credential, firehoseArn, cwRoleArn, uniqueLogGroups
    );
    createdResources.push("cloudwatch");

    // 6. Save Integration record
    const integration = await prisma.integration.upsert({
      where: {
        userId_provider_credentialId: {
          userId: user.id,
          provider: "aws",
          credentialId: credential.id,
        },
      },
      update: {
        s3BucketName: bucketName,
        firehoseArn,
        status: "active",
        errorMessage: null,
        lastSyncAt: new Date(),
      },
      create: {
        userId: user.id,
        credentialId: credential.id,
        provider: "aws",
        s3BucketName: bucketName,
        firehoseArn,
        status: "active",
        lastSyncAt: new Date(),
      },
    });

    // 7. Save InstanceMappings
    for (const mapping of mappings) {
      // 7.1 Ensure Repository record exists
      const repoName = mapping.repoFullName.split("/")[1] || mapping.repoFullName;
      const repository = await prisma.repository.upsert({
        where: {
          userId_fullName: {
            userId: user.id,
            fullName: mapping.repoFullName,
          },
        },
        update: {
          name: repoName,
        },
        create: {
          userId: user.id,
          fullName: mapping.repoFullName,
          name: repoName,
          htmlUrl: `https://github.com/${mapping.repoFullName}`,
        },
      });

      // 7.2 Create/Update mapping
      await prisma.instanceMapping.upsert({
        where: {
          integrationId_logGroupName_resourceId: {
            integrationId: integration.id,
            logGroupName: mapping.logGroupName,
            resourceId: mapping.resourceId || "global",
          },
        },
        update: {
          repositoryId: repository.id,
          repoFullName: mapping.repoFullName,
          resourceId: mapping.resourceId,
          resourceType: mapping.resourceType,
          resourceLabel: mapping.resourceLabel,
        },
        create: {
          integrationId: integration.id,
          repositoryId: repository.id,
          repoFullName: mapping.repoFullName,
          logGroupName: mapping.logGroupName,
          resourceId: mapping.resourceId,
          resourceType: mapping.resourceType,
          resourceLabel: mapping.resourceLabel,
        },
      });
    }

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      bucketName,
      subscribedGroups,
      mappingCount: mappings.length,
    });
  } catch (error: any) {
    console.error("Provisioning Error:", error);

    // ROLLBACK FEATURE: If anything goes wrong, attempt to cleanup AWS resources
    try {
      if (credentialId) {
        const user = await prisma.user.findFirst({
          where: { cloudCredentials: { some: { id: credentialId } } }
        });
        const credential = await prisma.cloudCredential.findUnique({ where: { id: credentialId } });

        if (credential && user) {
          const region = credential.region || "us-east-1";

          console.log("Initiating automatic rollback of AWS resources...");

          if (createdResources.includes("cloudwatch") && uniqueLogGroups.length > 0) {
            await removeSubscriptionFilters(credential, uniqueLogGroups);
          }
          if (createdResources.includes("firehose")) {
            await deleteDeliveryStream(credential, user.id);
          }
          if (createdResources.includes("iam") && identity) {
            await deleteFirehoseRoles(credential, identity.accountId, region);
          }
          if (createdResources.includes("s3") && bucketName) {
            await deleteLogBucket(credential, bucketName);
          }

          console.log("Rollback completed.");
        }
      }
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }

    // Update integration status to failed
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (user) {
          await prisma.integration.updateMany({
            where: { userId: user.id, provider: "aws" },
            data: { status: "failed", errorMessage: error.message }
          });
        }
      }
    } catch (e) {
      console.error("Failed to update integration status after error:", e);
    }

    return NextResponse.json(
      { error: `Provisioning failed. Resources were rolled back. Error: ${error.message}` },
      { status: 500 }
    );
  }
}
