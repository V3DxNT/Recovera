import { S3Client, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3";
import { CloudCredential } from "../../../generated/prisma/client";

export async function fixS3PublicAccess(
  bucketName: string,
  credential: CloudCredential
): Promise<{ ok: boolean; message: string }> {
  try {
    const client = new S3Client({
      region: credential.region,
      credentials: {
        accessKeyId: credential.accessKeyId,
        secretAccessKey: credential.secretAccessKey,
        sessionToken: credential.sessionToken || undefined,
      },
    });

    console.log(`[AWS Executor] Applying Public Access Block to bucket: ${bucketName}`);

    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      })
    );

    return {
      ok: true,
      message: `Successfully applied Public Access Block to bucket ${bucketName}.`,
    };
  } catch (error: any) {
    console.error(`[AWS Executor] Failed to fix S3 public access for ${bucketName}:`, error);
    return {
      ok: false,
      message: `Failed to apply Public Access Block: ${error.message}`,
    };
  }
}
