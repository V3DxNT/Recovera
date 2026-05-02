import {
    CloudWatchLogsClient,
    PutSubscriptionFilterCommand,
    DeleteSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";

/**
 * Subscribe only the user-selected log groups to the Firehose stream.
 * Previously subscribed ALL log groups — now takes an explicit list.
 */
export async function subscribeLogGroups(
    credential: CloudCredential,
    firehoseArn: string,
    cwRoleArn: string,
    selectedLogGroups: string[],
) {
    const cwLogs = new CloudWatchLogsClient({
        region: credential.region || "us-east-1",
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
            ...(credential.sessionToken && {
                sessionToken: decrypt(credential.sessionToken),
            }),
        },
    });

    const subscribed: string[] = [];
    const failed: { name: string; error: string; code: string }[] = [];

    for (const logGroupName of selectedLogGroups) {
        const maxAttempts = 5;

        for (let i = 0; i < maxAttempts; i++) {
            try {
                await cwLogs.send(
                    new PutSubscriptionFilterCommand({
                        logGroupName,
                        filterName: `Recovera-LogStream-Filter`,
                        filterPattern: "", // Send everything
                        destinationArn: firehoseArn,
                        roleArn: cwRoleArn,
                    }),
                );
                subscribed.push(logGroupName);
                break;
            } catch (error: any) {
                const rawMessage =
                    typeof error?.message === "string"
                        ? error.message
                        : "Unknown CloudWatch error";
                const isMissingLogGroup =
                    error?.name === "ResourceNotFoundException" ||
                    /specified log group does not exist/i.test(rawMessage);
                const isRetryable = error?.name === "AccessDeniedException";
                if (i < maxAttempts - 1 && isRetryable) {
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    continue;
                }

                let errorMessage = rawMessage;
                let errorCode = error?.name || "UnknownError";

                if (isMissingLogGroup) {
                    errorCode = "ResourceNotFoundException";
                    errorMessage = `Log group "${logGroupName}" does not exist in region ${credential.region || "us-east-1"}.`;
                } else if (error.name === "LimitExceededException") {
                    errorMessage =
                        "Limit exceeded: Each log group can have at most 2 subscription filters. Please remove one existing filter in the AWS Console.";
                }

                failed.push({
                    name: logGroupName,
                    error: errorMessage,
                    code: errorCode,
                });
                console.warn(
                    `Failed to subscribe log group "${logGroupName}":`,
                    errorMessage,
                );
                break;
            }
        }
    }

    return { subscribed, failed };
}

export async function removeSubscriptionFilters(
    credential: CloudCredential,
    selectedLogGroups: string[],
) {
    const cwLogs = new CloudWatchLogsClient({
        region: credential.region || "us-east-1",
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
        },
    });

    for (const logGroupName of selectedLogGroups) {
        try {
            await cwLogs.send(
                new DeleteSubscriptionFilterCommand({
                    logGroupName,
                    filterName: `Recovera-LogStream-Filter`,
                }),
            );
        } catch (error: any) {
            // If the log group or filter doesn't exist, we can ignore it during cleanup
            if (error.name !== "ResourceNotFoundException") {
                console.warn(
                    `Failed to remove subscription filter from "${logGroupName}" during rollback:`,
                    error.message,
                );
            }
        }
    }
}
