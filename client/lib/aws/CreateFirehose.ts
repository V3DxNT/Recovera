import { 
    FirehoseClient, 
    CreateDeliveryStreamCommand, 
    DescribeDeliveryStreamCommand,
    DeleteDeliveryStreamCommand 
} from "@aws-sdk/client-firehose";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";

export async function createDeliveryStream(
    credential: CloudCredential,
    userId: string,
    firehoseRoleArn: string,
    bucketName: string,
    ingestUrl: string
) {
    const region = credential.region || "us-east-1";
    const firehose = new FirehoseClient({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
            ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) })
        },
    });

    const streamName = `AutoSRE-LogStream-${userId}-${region}`;

    const maxCreateAttempts = 5;
    for (let i = 0; i < maxCreateAttempts; i++) {
        try {
            const createStream = new CreateDeliveryStreamCommand({
                DeliveryStreamName: streamName,
                DeliveryStreamType: "DirectPut",
                HttpEndpointDestinationConfiguration: {
                    EndpointConfiguration: {
                        Url: ingestUrl,
                        Name: "AutoSRE-Ingest-Endpoint",
                    },
                    S3BackupMode: "AllData",
                    S3Configuration: {
                        RoleARN: firehoseRoleArn,
                        BucketARN: `arn:aws:s3:::${bucketName}`,
                        Prefix: "firehose-raw/",
                        ErrorOutputPrefix: "firehose-errors/",
                        BufferingHints: {
                            SizeInMBs: 5,
                            IntervalInSeconds: 300,
                        },
                    },
                    RoleARN: firehoseRoleArn,
                    BufferingHints: {
                        SizeInMBs: 1,
                        IntervalInSeconds: 60,
                    },
                    RetryOptions: {
                        DurationInSeconds: 300,
                    },
                },
            });

            await firehose.send(createStream);
            break; // Success
        } catch (error: any) {
            const isRetryable = error.name === "AccessDeniedException" || error.name === "InvalidArgumentException";
            if (i < maxCreateAttempts - 1 && isRetryable) {
                console.log(`Waiting for IAM roles to propagate (attempt ${i + 1}/${maxCreateAttempts})...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            if (error.name !== "ResourceInUseException") {
                throw error;
            }
            break; // Already exists
        }
    }

    // Wait until stream is active (max ~60 seconds)
    const maxAttempts = 12;
    let attempts = 0;
    let isActive = false;
    while (!isActive && attempts < maxAttempts) {
        attempts++;
        const describe = await firehose.send(new DescribeDeliveryStreamCommand({
            DeliveryStreamName: streamName
        }));
        if (describe.DeliveryStreamDescription?.DeliveryStreamStatus === "ACTIVE") {
            isActive = true;
        } else {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    if (!isActive) {
        throw new Error(`Firehose stream "${streamName}" failed to reach ACTIVE status after ${maxAttempts} attempts.`);
    }

    const describe = await firehose.send(new DescribeDeliveryStreamCommand({
        DeliveryStreamName: streamName
    }));

    return describe.DeliveryStreamDescription!.DeliveryStreamARN!;
}

export async function deleteDeliveryStream(credential: CloudCredential, userId: string) {
    const region = credential.region || "us-east-1";
    const firehose = new FirehoseClient({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
        },
    });

    const streamName = `AutoSRE-LogStream-${userId}-${region}`;

    try {
        await firehose.send(new DeleteDeliveryStreamCommand({
            DeliveryStreamName: streamName,
            AllowForceDelete: true
        }));
    } catch (error) {
        console.warn(`Failed to delete Firehose stream ${streamName} during rollback:`, error);
    }
}
