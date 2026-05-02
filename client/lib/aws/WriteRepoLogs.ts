import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";
import { gzipSync } from "zlib";

interface TaggedLogBatch {
  repoFullName: string;   // "user/payment-api"
  logs: any[];            // array of log entries for this repo
}

/**
 * Writes tagged log batches to per-repo S3 folders.
 * 
 * Structure:
 *   repos/{repoName}/{YYYY}/{MM}/{DD}/{timestamp}-{batchId}.json.gz
 * 
 * Example:
 *   repos/payment-api/2026/04/28/1714300000000-abc123.json.gz
 */
export async function writeRepoLogs(
  credential: CloudCredential,
  bucketName: string,
  batches: TaggedLogBatch[]
) {
  const s3 = new S3Client({
    region: credential.region || "us-east-1",
    credentials: {
      accessKeyId: decrypt(credential.accessKeyId),
      secretAccessKey: decrypt(credential.secretAccessKey),
      ...(credential.sessionToken && { sessionToken: decrypt(credential.sessionToken) })
    },
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const timestamp = now.getTime();

  const results = [];

  for (const batch of batches) {
    if (!batch.logs.length) continue;

    // Extract repo name from full name: "user/payment-api" → "payment-api"
    const repoName = batch.repoFullName.includes("/")
      ? batch.repoFullName.split("/").pop()!
      : batch.repoFullName;

    const batchId = Math.random().toString(36).substring(2, 10);
    const key = `repos/${repoName}/${year}/${month}/${day}/${timestamp}-${batchId}.json.gz`;

    const jsonContent = JSON.stringify(batch.logs, null, 0);
    const gzipped = gzipSync(Buffer.from(jsonContent, "utf-8"));

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: gzipped,
      ContentEncoding: "gzip",
      ContentType: "application/json",
    }));

    results.push({ repo: batch.repoFullName, key, logCount: batch.logs.length });
  }

  return results;
}
