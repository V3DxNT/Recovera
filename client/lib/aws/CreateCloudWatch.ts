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
    selectedLogGroups: string[]
) {
    const cwLogs = new CloudWatchLogsClient({
        region: credential.region || "us-east-1",
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey)
        },
    });

    const subscribed: string[] = [];

    for (const logGroupName of selectedLogGroups) {
        const maxAttempts = 5;
        let success = false;

        for (let i = 0; i < maxAttempts; i++) {
            try {
                await cwLogs.send(new PutSubscriptionFilterCommand({
                    logGroupName,
                    filterName: `Recovera-LogStream-Filter`,
                    filterPattern: "", // Send everything
                    destinationArn: firehoseArn,
                    roleArn: cwRoleArn,
                }));
                subscribed.push(logGroupName);
                success = true;
                break;
            } catch (error: any) {
                const isRetryable = error.name === "AccessDeniedException" || error.name === "InvalidParameterException";
                if (i < maxAttempts - 1 && isRetryable) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                
                if (error.name === "LimitExceededException") {
                    console.error(`Limit exceeded for log group "${logGroupName}": Each log group can have at most 2 subscription filters.`);
                } else {
                    console.warn(`Failed to subscribe log group "${logGroupName}":`, error.message);
                }
                break;
            }
        }
    }

    return subscribed;
}

export async function removeSubscriptionFilters(
    credential: CloudCredential,
    selectedLogGroups: string[]
) {
    const cwLogs = new CloudWatchLogsClient({
        region: credential.region || "us-east-1",
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey)
        },
    });

    for (const logGroupName of selectedLogGroups) {
        try {
            await cwLogs.send(new DeleteSubscriptionFilterCommand({
                logGroupName,
                filterName: `Recovera-LogStream-Filter`,
            }));
        } catch (error) {
            console.warn(`Failed to remove subscription filter from "${logGroupName}" during rollback:`, error);
        }
    }
}
