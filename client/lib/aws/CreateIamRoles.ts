import { 
    IAMClient, 
    CreateRoleCommand, 
    PutRolePolicyCommand, 
    GetRoleCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand 
} from "@aws-sdk/client-iam";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";

export async function createFirehoseRoles(credential: CloudCredential, bucketName: string, accountId: string, region: string) {
    const iam = new IAMClient({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
        },
    });

    // 1. Create Role for Firehose
    const firehoseRoleName = `AutoSRE-FirehoseRole-${accountId}-${region}`;
    let firehoseRoleArn = "";

    try {
        const createFirehoseRole = new CreateRoleCommand({
            RoleName: firehoseRoleName,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "firehose.amazonaws.com" },
                    Action: "sts:AssumeRole",
                }],
            }),
        });
        const firehoseRole = await iam.send(createFirehoseRole);
        firehoseRoleArn = firehoseRole.Role!.Arn!;

        // Attach Policy to Firehose Role
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

        await iam.send(new PutRolePolicyCommand({
            RoleName: firehoseRoleName,
            PolicyName: "AutoSRE-Firehose-S3-Policy",
            PolicyDocument: JSON.stringify(firehosePolicy),
        }));

    } catch (error: any) {
        if (error.name === "EntityAlreadyExistsException") {
            const role = await iam.send(new GetRoleCommand({ RoleName: firehoseRoleName }));
            firehoseRoleArn = role.Role!.Arn!;
        } else {
            throw error;
        }
    }

    // 2. Create Role for CloudWatch Logs
    const cwRoleName = `AutoSRE-CloudWatchRole-${accountId}-${region}`;
    let cwRoleArn = "";

    try {
        const createCwRole = new CreateRoleCommand({
            RoleName: cwRoleName,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: `logs.${region}.amazonaws.com` },
                    Action: "sts:AssumeRole",
                }],
            }),
        });
        const cwRole = await iam.send(createCwRole);
        cwRoleArn = cwRole.Role!.Arn!;

        // Attach Policy to CloudWatch Role (Allows writing to Firehose)
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

        await iam.send(new PutRolePolicyCommand({
            RoleName: cwRoleName,
            PolicyName: "AutoSRE-CW-Firehose-Policy",
            PolicyDocument: JSON.stringify(cwPolicy),
        }));

    } catch (error: any) {
        if (error.name === "EntityAlreadyExistsException") {
            const role = await iam.send(new GetRoleCommand({ RoleName: cwRoleName }));
            cwRoleArn = role.Role!.Arn!;
        } else {
            throw error;
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
