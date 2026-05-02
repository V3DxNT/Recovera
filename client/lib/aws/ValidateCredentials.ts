import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";

export async function validateCredentials(credential: CloudCredential) {
    const region = credential.region || "us-east-1";
    const stsClient = new STSClient({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
            ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) })
        },
    });

    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    return {
        accountId: identity.Account!,
        arn: identity.Arn!,
        userId: identity.UserId!,
    };
}
