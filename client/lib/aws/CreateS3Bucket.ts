import { S3Client, CreateBucketCommand, DeleteBucketCommand, BucketLocationConstraint } from "@aws-sdk/client-s3";
import { decrypt } from "../encrypt";
import { CloudCredential } from "../../generated/prisma/client";

export async function createLogBucket(credential: CloudCredential, userId: string) {
    const region = credential.region || "us-east-1";
    // Sanitize userId and region to ensure S3 compatibility (lowercase, alphanumeric, hyphens)
    const sanitizedId = userId.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const sanitizedRegion = region.toLowerCase().replace(/[^a-z0-9]/g, "-");
    
    let bucketName = `recovera-${sanitizedId}-${sanitizedRegion}`;
    
    // Ensure name is within 63 characters
    if (bucketName.length > 63) {
        bucketName = bucketName.substring(0, 63);
    }
    // Remove trailing hyphens if any
    bucketName = bucketName.replace(/-+$/, "");

    const s3 = new S3Client({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
            ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) })
        },
    });

    try {
        await s3.send(new CreateBucketCommand({
            Bucket: bucketName,
            ...(region !== "us-east-1" && {
                CreateBucketConfiguration: {
                    LocationConstraint: region as BucketLocationConstraint,
                },
            }),
        }));
    } catch (error: any) {
        // Bucket already exists — that's fine, we reuse it
        if (error.name !== "BucketAlreadyOwnedByYou" && error.name !== "BucketAlreadyExists") {
            throw error;
        }
    }

    return bucketName;
}

export async function deleteLogBucket(credential: CloudCredential, bucketName: string) {
    const region = credential.region || "us-east-1";
    const s3 = new S3Client({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
            ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) })
        },
    });

    try {
        await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
    } catch (error) {
        console.warn(`Failed to delete bucket ${bucketName} during rollback:`, error);
    }
}