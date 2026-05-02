import { S3Client, CreateBucketCommand, DeleteBucketCommand, BucketLocationConstraint } from "@aws-sdk/client-s3";
import { decrypt } from "../encrypt";
import { CloudCredential } from "../../generated/prisma/client";

export async function createLogBucket(credential: CloudCredential, userId: string) {
    const region = credential.region || "us-east-1";
    // Sanitize userId and region to ensure S3 compatibility (lowercase, alphanumeric, hyphens)
    const sanitizedId = userId.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const sanitizedRegion = region.toLowerCase().replace(/[^a-z0-9]/g, "-");
    
    // Add a short random suffix to avoid global uniqueness collisions
    const suffix = Math.random().toString(36).substring(2, 8);
    let bucketName = `recovera-${sanitizedId}-${sanitizedRegion}-${suffix}`;
    
    // Collapsed consecutive hyphens and ensure it doesn't start/end with one
    bucketName = bucketName.replace(/-+/g, "-").replace(/^-|-$/g, "");

    // Ensure name is within 63 characters
    if (bucketName.length > 63) {
        // Keep the suffix intact if possible
        const prefix = bucketName.substring(0, 63 - suffix.length - 1).replace(/-$/, "");
        bucketName = `${prefix}-${suffix}`;
    }

    const s3 = new S3Client({
        region,
        credentials: {
            accessKeyId: decrypt(credential.accessKeyId),
            secretAccessKey: decrypt(credential.secretAccessKey),
        },
    });

    console.log(`[AWS] Attempting to create S3 bucket: ${bucketName} in region: ${region}`);


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
        },
    });

    try {
        await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
    } catch (error: any) {
        // If the bucket doesn't exist, we can ignore it during cleanup
        if (error.name !== "NoSuchBucket" && error.name !== "NotFound") {
            console.warn(`Failed to delete bucket ${bucketName} during rollback:`, error.message);
        }
    }
}