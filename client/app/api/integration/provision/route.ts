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

function normalizeLogGroupName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const sentinelValues = new Set(["unknown", "n/a", "na", "none", "null", "undefined"]);
  if (sentinelValues.has(normalized.toLowerCase())) return null;

  return normalized;
}

/**
 * Provisioning step tracking — records which resources were created,
 * their names/ARNs, and whether each step succeeded or failed.
 */
interface ProvisioningStep {
  step: string;            // "s3" | "iam" | "firehose" | "cloudwatch" | "db"
  label: string;           // Human-readable label
  status: "pending" | "success" | "failed" | "skipped";
  resourceName?: string;   // The actual name/ARN of the created resource
  error?: string;          // Error message if failed
  suggestion?: string;     // How to fix it
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

  // Step tracker — initialized as pending
  const steps: ProvisioningStep[] = [
    { step: "validate", label: "Validate AWS Credentials", status: "pending" },
    { step: "s3", label: "Create S3 Log Bucket", status: "pending" },
    { step: "iam", label: "Create IAM Roles", status: "pending" },
    { step: "firehose", label: "Create Firehose Delivery Stream", status: "pending" },
    { step: "cloudwatch", label: "Subscribe CloudWatch Log Groups", status: "pending" },
    { step: "db", label: "Save Integration & Mappings", status: "pending" },
  ];

  const markStep = (
    stepId: string, 
    status: ProvisioningStep["status"], 
    resourceName?: string, 
    error?: string,
    suggestion?: string
  ) => {
    const s = steps.find(s => s.step === stepId);
    if (s) {
      s.status = status;
      if (resourceName) s.resourceName = resourceName;
      if (error) s.error = error;
      if (suggestion) s.suggestion = suggestion;
    }
  };

  const getFailedStep = () => steps.find(s => s.status === "failed");

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
    try {
      identity = await validateCredentials(credential);
      markStep("validate", "success", identity.accountId);
    } catch (err: any) {
      markStep(
        "validate", 
        "failed", 
        undefined, 
        err.message, 
        "Check Access Key ID and Secret Access Key. Ensure the user has 'sts:GetCallerIdentity' permissions."
      );
      throw err;
    }

    // 2. Create S3 bucket
    try {
      bucketName = await createLogBucket(credential, user.id);
      createdResources.push("s3");
      markStep("s3", "success", bucketName);
    } catch (err: any) {
      markStep(
        "s3", 
        "failed", 
        undefined, 
        err.message, 
        "Check S3 permissions (s3:CreateBucket) or verify if the bucket name is globally unique."
      );
      throw err;
    }

    // 3. Create IAM Roles
    let firehoseRoleArn = "";
    let cwRoleArn = "";
    try {
      const roles = await createFirehoseRoles(
        credential, bucketName, identity.accountId, region
      );
      firehoseRoleArn = roles.firehoseRoleArn;
      cwRoleArn = roles.cwRoleArn;
      createdResources.push("iam");
      markStep("iam", "success", `FirehoseRole, CloudWatchRole (${region})`);
    } catch (err: any) {
      markStep(
        "iam", 
        "failed", 
        undefined, 
        err.message, 
        "Ensure permissions for 'iam:CreateRole', 'iam:PutRolePolicy', and 'iam:GetRole'."
      );
      throw err;
    }

    // 4. Create Firehose delivery stream
    let firehoseArn = "";
    try {
      firehoseArn = await createDeliveryStream(
        credential, user.id, firehoseRoleArn, bucketName, ingestUrl
      );
      createdResources.push("firehose");
      markStep("firehose", "success", `AutoSRE-LogStream-${user.id}-${region}`);
    } catch (err: any) {
      markStep(
        "firehose", 
        "failed", 
        `AutoSRE-LogStream-${user.id}-${region}`, 
        err.message,
        "Check permissions for 'firehose:CreateDeliveryStream'. This can also fail if the IAM roles from the previous step haven't propagated yet."
      );
      throw err;
    }

    // 5. Subscribe ONLY the selected log groups
    uniqueLogGroups = [
      ...new Set(
        mappings
          .map((m) => normalizeLogGroupName(m.logGroupName))
          .filter((g): g is string => Boolean(g))
      ),
    ];
    
    if (uniqueLogGroups.length === 0) {
      console.log("[AWS] No valid log groups to subscribe.");
      createdResources.push("cloudwatch");
      markStep("cloudwatch", "success", "No log groups selected/available");
    } else {
      try {
        const { subscribed, failed } = await subscribeLogGroups(
          credential, firehoseArn, cwRoleArn, uniqueLogGroups
        );
      
      if (failed.length > 0) {
        const missingLogGroups = failed.filter(
          (f) => f.code === "ResourceNotFoundException" || /does not exist/i.test(f.error)
        );
        const blockingFailures = failed.filter((f) => !missingLogGroups.includes(f));

        if (blockingFailures.length > 0) {
          const hasLimitError = blockingFailures.some(f => f.code === "LimitExceededException");
          const errorMessage = `${subscribed.length} subscribed, ${blockingFailures.length} failed. First error: ${blockingFailures[0].error}`;
          const suggestion = hasLimitError 
            ? "One or more log groups have 2 subscription filters. Remove one in the AWS Console and try again."
            : "Check IAM permissions for 'logs:PutSubscriptionFilter'.";
            
          markStep("cloudwatch", "failed", uniqueLogGroups.join(", "), errorMessage, suggestion);
          throw new Error(errorMessage);
        }

        const skippedNames = missingLogGroups.map((f) => f.name).join(", ");
        createdResources.push("cloudwatch");
        markStep(
          "cloudwatch",
          "skipped",
          subscribed.join(", ") || skippedNames || uniqueLogGroups.join(", "),
          `${missingLogGroups.length} selected log group(s) were not found and were skipped.`,
          "Verify that selected resources are writing to CloudWatch Logs in this region, then retry provisioning."
        );
      } else {
        createdResources.push("cloudwatch");
        markStep("cloudwatch", "success", uniqueLogGroups.join(", "));
      }
    } catch (err: any) {
      if (steps.find(s => s.step === "cloudwatch")?.status !== "failed") {
        markStep("cloudwatch", "failed", uniqueLogGroups.join(", "), err.message);
      }
      throw err;
    }
    }

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
      subscribedLogGroups: uniqueLogGroups,
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
