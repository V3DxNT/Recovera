import { 
    IAMClient, 
    CreateRoleCommand, 
    PutRolePolicyCommand, 
    GetRoleCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand,
    UpdateAssumeRolePolicyCommand 
} from "@aws-sdk/client-iam";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";

export async function createFirehoseRoles(credential: CloudCredential, bucketName: string, accountId: string, region: string) {
    const iam = new IAMClient({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
            ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) })
        },
    });

    // ── 1. Firehose Role ──────────────────────────────────────────────
    const firehoseRoleName = `AutoSRE-FirehoseRole-${accountId}-${region}`;
    let firehoseRoleArn = "";

    const firehoseTrustPolicy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: { Service: "firehose.amazonaws.com" },
            Action: "sts:AssumeRole",
        }],
    });

    try {
        const firehoseRole = await iam.send(new CreateRoleCommand({
            RoleName: firehoseRoleName,
            AssumeRolePolicyDocument: firehoseTrustPolicy,
        }));
        firehoseRoleArn = firehoseRole.Role!.Arn!;
        console.log(`[IAM] Created Firehose role: ${firehoseRoleName}`);
    } catch (error: any) {
        if (error.name === "EntityAlreadyExistsException") {
            const role = await iam.send(new GetRoleCommand({ RoleName: firehoseRoleName }));
            firehoseRoleArn = role.Role!.Arn!;
            console.log(`[IAM] Firehose role already exists, updating policies...`);
        } else {
            throw error;
        }
    }

    // Always update trust + inline policy (idempotent)
    try {
        await iam.send(new UpdateAssumeRolePolicyCommand({
            RoleName: firehoseRoleName,
            PolicyDocument: firehoseTrustPolicy,
        }));
    } catch (e: any) {
        if (e.name === "AccessDenied" || e.name === "AccessDeniedException") {
            console.warn(`[IAM] Warning: User is not authorized to update trust policy for ${firehoseRoleName}. Skipping...`);
        } else {
            throw e;
        }
    }

    const firehosePolicy = {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "s3:AbortMultipartUpload",
                    "s3:GetBucketLocation",
                    "s3:GetObject",
                    "s3:ListBucket",
                    "s3:ListBucketMultipartUploads",
                    "s3:PutObject"
                ],
                Resource: [
                    `arn:aws:s3:::${bucketName}`,
                    `arn:aws:s3:::${bucketName}/*`
                ]
            }
        ]
    };

    try {
        await iam.send(new PutRolePolicyCommand({
            RoleName: firehoseRoleName,
            PolicyName: "AutoSRE-Firehose-S3-Policy",
            PolicyDocument: JSON.stringify(firehosePolicy),
        }));
        console.log(`[IAM] Firehose role policies updated.`);
    } catch (e: any) {
        if (e.name === "AccessDenied" || e.name === "AccessDeniedException") {
            console.warn(`[IAM] Warning: User is not authorized to update inline policy for ${firehoseRoleName}. Skipping...`);
        } else {
            throw e;
        }
    }

    // ── 2. CloudWatch Logs Role ───────────────────────────────────────
    const cwRoleName = `AutoSRE-CloudWatchRole-${accountId}-${region}`;
    let cwRoleArn = "";

    // Use BOTH the regional and global principal so CW Logs can assume
    // this role regardless of how the service identifies itself.
    const cwTrustPolicy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: {
                Service: [
                    "logs.amazonaws.com",
                    `logs.${region}.amazonaws.com`,
                ],
            },
            Action: "sts:AssumeRole",
        }],
    });

    try {
        const cwRole = await iam.send(new CreateRoleCommand({
            RoleName: cwRoleName,
            AssumeRolePolicyDocument: cwTrustPolicy,
        }));
        cwRoleArn = cwRole.Role!.Arn!;
        console.log(`[IAM] Created CloudWatch role: ${cwRoleName}`);
    } catch (error: any) {
        if (error.name === "EntityAlreadyExistsException") {
            const role = await iam.send(new GetRoleCommand({ RoleName: cwRoleName }));
            cwRoleArn = role.Role!.Arn!;
            console.log(`[IAM] CloudWatch role already exists, updating policies...`);
        } else {
            throw error;
        }
    }

    // Always update trust + inline policy (idempotent)
    try {
        await iam.send(new UpdateAssumeRolePolicyCommand({
            RoleName: cwRoleName,
            PolicyDocument: cwTrustPolicy,
        }));
    } catch (e: any) {
        if (e.name === "AccessDenied" || e.name === "AccessDeniedException") {
            console.warn(`[IAM] Warning: User is not authorized to update trust policy for ${cwRoleName}. Skipping...`);
        } else {
            throw e;
        }
    }

    const cwPolicy = {
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: ["firehose:PutRecord", "firehose:PutRecordBatch"],
            Resource: [
                `arn:aws:firehose:${region}:${accountId}:deliverystream/AutoSRE-LogStream-*`
            ]
        }]
    };

    try {
        await iam.send(new PutRolePolicyCommand({
            RoleName: cwRoleName,
            PolicyName: "AutoSRE-CW-Firehose-Policy",
            PolicyDocument: JSON.stringify(cwPolicy),
        }));
        console.log(`[IAM] CloudWatch role policies updated.`);
    } catch (e: any) {
        if (e.name === "AccessDenied" || e.name === "AccessDeniedException") {
            console.warn(`[IAM] Warning: User is not authorized to update inline policy for ${cwRoleName}. Skipping...`);
        } else {
            throw e;
        }
    }

    // IAM roles propagation is now handled by retry logic in downstream creation steps

    return { firehoseRoleArn, cwRoleArn };
}

export async function deleteFirehoseRoles(credential: CloudCredential, accountId: string, region: string) {
    const iam = new IAMClient({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
        },
    });

    const firehoseRoleName = `AutoSRE-FirehoseRole-${accountId}-${region}`;
    const cwRoleName = `AutoSRE-CloudWatchRole-${accountId}-${region}`;

    const cleanup = async (roleName: string, policyName: string) => {
        try {
            await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: policyName }));
        } catch (e) {}
        try {
            await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
        } catch (e) {}
    };

    await Promise.all([
        cleanup(firehoseRoleName, "AutoSRE-Firehose-S3-Policy"),
        cleanup(cwRoleName, "AutoSRE-CW-Firehose-Policy"),
    ]);
}
