import { CloudCredential } from "../../../generated/prisma/client";
import { decrypt } from "../../encrypt";

export function getAwsSdkCredentials(credential: CloudCredential) {
  return {
    accessKeyId: decrypt(credential.accessKeyId),
    secretAccessKey: decrypt(credential.secretAccessKey),
    ...(credential.sessionToken
      ? { sessionToken: decrypt(credential.sessionToken) }
      : {}),
  };
}

export function getAwsRegion(credential: CloudCredential): string {
  return credential.region || "us-east-1";
}
