import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";
import {
    CloudWatchLogsClient,
    DescribeSubscriptionFiltersCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
    FirehoseClient,
    DescribeDeliveryStreamCommand,
} from "@aws-sdk/client-firehose";
import {
    IAMClient,
    GetRoleCommand,
} from "@aws-sdk/client-iam";
import {
    S3Client,
    ListObjectsV2Command,
} from "@aws-sdk/client-s3";

interface DiagnosticResult {
    step: string;
    status: "ok" | "warning" | "error";
    detail: string;
}

/**
 * GET /api/integration/diagnose
 *
 * Runs a live diagnostic on the CloudWatch → Firehose → S3 pipeline.
 * Returns a list of checks with pass/fail status for each component.
 */
export async function GET() {
    const results: DiagnosticResult[] = [];

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 1. Check Integration record
        const integration = await prisma.integration.findFirst({
            where: { userId: user.id, provider: "aws" },
            include: { credentials: true, mappings: true },
        });

        if (!integration) {
            results.push({ step: "integration", status: "error", detail: "No AWS integration found. Run provisioning first." });
            return NextResponse.json({ results });
        }

        results.push({
            step: "integration",
            status: integration.status === "active" ? "ok" : "warning",
            detail: `Integration status: ${integration.status}, bucket: ${integration.s3BucketName}, firehoseArn: ${integration.firehoseArn}`,
        });

        const credential = integration.credentials;
        const region = credential.region || "us-east-1";
        const credentials = {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
            ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) }),
        };

        const iam = new IAMClient({ region, credentials });
        const cw = new CloudWatchLogsClient({ region, credentials });
        const firehose = new FirehoseClient({ region, credentials });
        const s3 = new S3Client({ region, credentials });

        // 2. Check IAM Roles
        const accountId = integration.firehoseArn?.split(":")[4] || "unknown";

        // 2a. Firehose role
        const firehoseRoleName = `AutoSRE-FirehoseRole-${accountId}-${region}`;
        try {
            const role = await iam.send(new GetRoleCommand({ RoleName: firehoseRoleName }));
            const trustDoc = decodeURIComponent(role.Role?.AssumeRolePolicyDocument || "");
            const hasFirehosePrincipal = trustDoc.includes("firehose.amazonaws.com");
            results.push({
                step: "iam_firehose_role",
                status: hasFirehosePrincipal ? "ok" : "error",
                detail: hasFirehosePrincipal
                    ? `Firehose role exists with correct trust policy`
                    : `Firehose role trust policy missing firehose.amazonaws.com principal. Trust: ${trustDoc}`,
            });
        } catch (e: any) {
            results.push({ step: "iam_firehose_role", status: "error", detail: `Firehose role not found: ${e.message}` });
        }

        // 2b. CloudWatch role
        const cwRoleName = `AutoSRE-CloudWatchRole-${accountId}-${region}`;
        try {
            const role = await iam.send(new GetRoleCommand({ RoleName: cwRoleName }));
            const trustDoc = decodeURIComponent(role.Role?.AssumeRolePolicyDocument || "");
            const hasGlobalPrincipal = trustDoc.includes("logs.amazonaws.com");
            const hasRegionalPrincipal = trustDoc.includes(`logs.${region}.amazonaws.com`);
            results.push({
                step: "iam_cw_role",
                status: hasGlobalPrincipal ? "ok" : "error",
                detail: `CW role trust policy — global: ${hasGlobalPrincipal}, regional: ${hasRegionalPrincipal}. Full: ${trustDoc}`,
            });
        } catch (e: any) {
            results.push({ step: "iam_cw_role", status: "error", detail: `CloudWatch role not found: ${e.message}` });
        }

        // 3. Check Firehose delivery stream
        if (integration.firehoseArn) {
            const streamName = integration.firehoseArn.split("/").pop() || "";
            try {
                const desc = await firehose.send(new DescribeDeliveryStreamCommand({ DeliveryStreamName: streamName }));
                const status = desc.DeliveryStreamDescription?.DeliveryStreamStatus;
                results.push({
                    step: "firehose_stream",
                    status: status === "ACTIVE" ? "ok" : "error",
                    detail: `Firehose stream "${streamName}" status: ${status}`,
                });

                // Check destinations
                const destinations = desc.DeliveryStreamDescription?.Destinations || [];
                if (destinations.length > 0) {
                    const dest = destinations[0];
                    const httpDest = dest.HttpEndpointDestinationDescription;
                    const s3Dest = httpDest?.S3DestinationDescription;
                    results.push({
                        step: "firehose_config",
                        status: "ok",
                        detail: `HTTP endpoint: ${httpDest?.EndpointConfiguration?.Url || "N/A"}, S3 backup: ${s3Dest?.BucketARN || "N/A"}, S3BackupMode: ${httpDest?.S3BackupMode || "N/A"}`,
                    });
                }
            } catch (e: any) {
                results.push({ step: "firehose_stream", status: "error", detail: `Firehose error: ${e.message}` });
            }
        } else {
            results.push({ step: "firehose_stream", status: "error", detail: "No Firehose ARN in integration record" });
        }

        // 4. Check subscription filters on mapped log groups
        for (const mapping of integration.mappings) {
            try {
                const filters = await cw.send(new DescribeSubscriptionFiltersCommand({
                    logGroupName: mapping.logGroupName,
                }));
                const subFilters = filters.subscriptionFilters || [];
                const ourFilter = subFilters.find(f => f.filterName === "Recovera-LogStream-Filter");

                if (ourFilter) {
                    const pointsToOurFirehose = ourFilter.destinationArn === integration.firehoseArn;
                    results.push({
                        step: `subscription_filter:${mapping.logGroupName}`,
                        status: pointsToOurFirehose ? "ok" : "warning",
                        detail: pointsToOurFirehose
                            ? `Subscription filter active, pointing to correct Firehose`
                            : `Subscription filter exists but points to: ${ourFilter.destinationArn} (expected: ${integration.firehoseArn})`,
                    });
                } else {
                    results.push({
                        step: `subscription_filter:${mapping.logGroupName}`,
                        status: "error",
                        detail: `No "Recovera-LogStream-Filter" found. Existing filters: ${subFilters.map(f => f.filterName).join(", ") || "none"}`,
                    });
                }
            } catch (e: any) {
                results.push({
                    step: `subscription_filter:${mapping.logGroupName}`,
                    status: "error",
                    detail: `Error checking log group "${mapping.logGroupName}": ${e.message}`,
                });
            }
        }

        // 5. Check S3 bucket for actual data
        if (integration.s3BucketName) {
            try {
                const objects = await s3.send(new ListObjectsV2Command({
                    Bucket: integration.s3BucketName,
                    MaxKeys: 5,
                }));
                const count = objects.KeyCount || 0;
                const keys = (objects.Contents || []).map(o => o.Key).join(", ");
                results.push({
                    step: "s3_data",
                    status: count > 0 ? "ok" : "warning",
                    detail: count > 0
                        ? `Found ${count} objects in bucket. Sample keys: ${keys}`
                        : `Bucket "${integration.s3BucketName}" is empty. Logs have not arrived yet.`,
                });
            } catch (e: any) {
                results.push({ step: "s3_data", status: "error", detail: `S3 error: ${e.message}` });
            }
        }

        return NextResponse.json({ results });
    } catch (error: any) {
        return NextResponse.json(
            { error: `Diagnostic failed: ${error.message}`, results },
            { status: 500 }
        );
    }
}
