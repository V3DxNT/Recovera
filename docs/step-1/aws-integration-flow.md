# AWS Integration — Automated S3 + CloudWatch Setup

> When a user clicks **"Integrate AI Agent"**, AutoSRE automatically provisions an S3 bucket and configures CloudWatch to stream logs into it — all using the user's IAM credentials.

---

## Table of Contents

1. [What Happens When the User Clicks "Integrate"](#1-what-happens-when-the-user-clicks-integrate)
2. [End-to-End Architecture](#2-end-to-end-architecture)
3. [Step-by-Step Flow](#3-step-by-step-flow)
4. [IAM Permissions Required](#4-iam-permissions-required)
5. [Implementation Guide](#5-implementation-guide)
6. [Database Models Involved](#6-database-models-involved)
7. [API Routes](#7-api-routes)
8. [Error Handling & Rollback](#8-error-handling--rollback)
9. [Where This Fits in the Build Roadmap](#9-where-this-fits-in-the-build-roadmap)

---

## 1. What Happens When the User Clicks "Integrate"

From the user's perspective, it's a single button click. Behind the scenes, the AI agent performs **5 automated steps**:

```
User clicks "Integrate AI Agent"
        │
        ▼
┌─────────────────────────────────────────────┐
│  Step 1: Validate IAM Credentials           │
│  → Test the stored keys with AWS STS        │
├─────────────────────────────────────────────┤
│  Step 2: Create a dedicated S3 Bucket       │
│  → recovera-logs-{userId}-{region}          │
├─────────────────────────────────────────────┤
│  Step 3: Set S3 Bucket Policy               │
│  → Allow CloudWatch Logs to write to it     │
├─────────────────────────────────────────────┤
│  Step 4: Create CloudWatch Log Subscription │
│  → Stream logs from user's log groups → S3  │
├─────────────────────────────────────────────┤
│  Step 5: Set up S3 Event Notification       │
│  → Notify our API when new logs arrive      │
└─────────────────────────────────────────────┘
        │
        ▼
  ✅ Integration Complete
  Logs now flow: App → CloudWatch → S3 → AutoSRE API
```

---

## 2. End-to-End Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     USER'S AWS ACCOUNT                               │
│                                                                      │
│   ┌──────────────┐         ┌──────────────────┐                     │
│   │  User's App  │────────▶│   CloudWatch     │                     │
│   │  (EC2/ECS/   │  logs   │   Log Groups     │                     │
│   │   Lambda)    │         │                  │                     │
│   └──────────────┘         └────────┬─────────┘                     │
│                                     │                                │
│                          Subscription Filter                         │
│                          (created by AutoSRE)                        │
│                                     │                                │
│                                     ▼                                │
│                           ┌─────────────────┐                       │
│                           │    S3 Bucket     │                       │
│                           │  recovera-logs-  │                       │
│                           │  {userId}-{region}│                      │
│                           └────────┬────────┘                       │
│                                    │                                 │
└────────────────────────────────────┼─────────────────────────────────┘
                                     │
                          S3 Event Notification
                          (on new object created)
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│                      AUTOSRE AI (Our System)                       │
│                                                                    │
│   ┌───────────────────┐    ┌──────────────┐    ┌───────────────┐  │
│   │  POST /api/ingest │───▶│  Anomaly     │───▶│  LLM Root     │  │
│   │  /logs            │    │  Detector    │    │  Cause        │  │
│   │  (Webhook)        │    │              │    │  Analysis     │  │
│   └───────────────────┘    └──────────────┘    └───────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Step-by-Step Flow

### Step 1: Validate IAM Credentials

Before doing anything, we verify the user's stored IAM credentials are valid and have the right permissions.

```typescript
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { decrypt } from "@/lib/encrypt";

async function validateCredentials(credential: CloudCredential) {
  const sts = new STSClient({
    region: credential.region || "us-east-1",
    credentials: {
      accessKeyId: decrypt(credential.accessKeyId),
      secretAccessKey: decrypt(credential.secretAccessKey),
    },
  });

  // This call will throw if the credentials are invalid
  const identity = await sts.send(new GetCallerIdentityCommand({}));

  return {
    valid: true,
    accountId: identity.Account,
    arn: identity.Arn,
  };
}
```

**What this does:** Calls AWS Security Token Service (STS) to confirm the keys are real and active. Returns the AWS Account ID for reference.

---

### Step 2: Create a Dedicated S3 Bucket

We create a unique S3 bucket in the user's AWS account to store their CloudWatch logs.

```typescript
import { S3Client, CreateBucketCommand, PutBucketEncryptionCommand } from "@aws-sdk/client-s3";

async function createLogBucket(credential: CloudCredential, userId: string) {
  const region = credential.region || "us-east-1";
  const bucketName = `recovera-logs-${userId}-${region}`;

  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: decrypt(credential.accessKeyId),
      secretAccessKey: decrypt(credential.secretAccessKey),
    },
  });

  // 1. Create the bucket
  await s3.send(new CreateBucketCommand({
    Bucket: bucketName,
    // LocationConstraint is required for non-us-east-1 regions
    ...(region !== "us-east-1" && {
      CreateBucketConfiguration: { LocationConstraint: region },
    }),
  }));

  // 2. Enable server-side encryption (AES-256) on the bucket
  await s3.send(new PutBucketEncryptionCommand({
    Bucket: bucketName,
    ServerSideEncryptionConfiguration: {
      Rules: [{
        ApplyServerSideEncryptionByDefault: {
          SSEAlgorithm: "AES256",
        },
      }],
    },
  }));

  return bucketName;
}
```

**What this does:**
- Creates an S3 bucket named `recovera-logs-{userId}-{region}` (globally unique).
- Enables AES-256 encryption on the bucket so logs are encrypted at rest.

---

### Step 3: Set S3 Bucket Policy

CloudWatch Logs needs permission to write objects into the S3 bucket. We set a bucket policy to allow this.

```typescript
import { PutBucketPolicyCommand } from "@aws-sdk/client-s3";

async function setBucketPolicy(s3: S3Client, bucketName: string, accountId: string, region: string) {
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowCloudWatchLogs",
        Effect: "Allow",
        Principal: {
          Service: "logs.amazonaws.com",
        },
        Action: "s3:PutObject",
        Resource: `arn:aws:s3:::${bucketName}/*`,
        Condition: {
          StringEquals: {
            "aws:SourceAccount": accountId,
          },
        },
      },
      {
        Sid: "AllowCloudWatchBucketCheck",
        Effect: "Allow",
        Principal: {
          Service: "logs.amazonaws.com",
        },
        Action: "s3:GetBucketAcl",
        Resource: `arn:aws:s3:::${bucketName}`,
      },
    ],
  };

  await s3.send(new PutBucketPolicyCommand({
    Bucket: bucketName,
    Policy: JSON.stringify(policy),
  }));
}
```

**What this does:** Grants the `logs.amazonaws.com` service permission to:
- `s3:PutObject` — Write log files into the bucket.
- `s3:GetBucketAcl` — Verify it has access before writing.

---

### Step 4: Create CloudWatch Log Subscription

Now we tell CloudWatch to export the user's log groups into the S3 bucket.

```typescript
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateExportTaskCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";

async function subscribeLogGroups(credential: CloudCredential, bucketName: string) {
  const cwLogs = new CloudWatchLogsClient({
    region: credential.region || "us-east-1",
    credentials: {
      accessKeyId: decrypt(credential.accessKeyId),
      secretAccessKey: decrypt(credential.secretAccessKey),
    },
  });

  // 1. List all log groups in the user's account
  const logGroups = await cwLogs.send(new DescribeLogGroupsCommand({}));

  // 2. For each log group, create an export task to S3
  for (const group of logGroups.logGroups || []) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    await cwLogs.send(new CreateExportTaskCommand({
      logGroupName: group.logGroupName,
      from: oneDayAgo,
      to: now,
      destination: bucketName,
      destinationPrefix: `logs/${group.logGroupName}`,
    }));
  }

  return logGroups.logGroups?.map(g => g.logGroupName) || [];
}
```

**What this does:**
- Lists every CloudWatch Log Group in the user's AWS account.
- Creates export tasks that dump the last 24 hours of logs into the S3 bucket.
- Each log group gets its own prefix/folder in S3 (e.g., `logs//api-gateway/`).

> **Note:** For real-time streaming (not just one-time export), you would use a **CloudWatch Subscription Filter** with a Lambda function or Kinesis Firehose that forwards logs to our `/api/ingest/logs` endpoint. This is covered in Phase 3 of the roadmap.

---

### Step 5: S3 Event Notification → AutoSRE API

Finally, we configure S3 to notify our system whenever a new log file lands in the bucket.

```typescript
import { PutBucketNotificationConfigurationCommand } from "@aws-sdk/client-s3";

async function setupS3Notification(s3: S3Client, bucketName: string, webhookUrl: string) {
  // Option A: Direct HTTPS notification (requires SNS topic)
  // Option B: Lambda trigger that calls our API

  // Using SNS → HTTPS subscription to our endpoint:
  await s3.send(new PutBucketNotificationConfigurationCommand({
    Bucket: bucketName,
    NotificationConfiguration: {
      // For MVP, we'll poll S3 periodically instead
      // For production, set up SNS topic → HTTPS → /api/ingest/logs
    },
  }));
}
```

**For MVP (Phase 2):** We poll the S3 bucket every 5 minutes using a background worker.
**For Production (Phase 4):** We set up an SNS topic that sends an HTTPS notification to our `/api/ingest/logs` endpoint every time a new log file arrives.

---

## 4. IAM Permissions Required

The user must create an IAM user/role with **these minimum permissions** for AutoSRE to work:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RecoveraS3Permissions",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:PutBucketPolicy",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketNotification",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::recovera-logs-*",
        "arn:aws:s3:::recovera-logs-*/*"
      ]
    },
    {
      "Sid": "RecoveraCloudWatchPermissions",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:CreateExportTask",
        "logs:PutSubscriptionFilter",
        "logs:DeleteSubscriptionFilter"
      ],
      "Resource": "*"
    },
    {
      "Sid": "RecoveraSTSValidation",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

### Permission Breakdown

| Permission | Why AutoSRE Needs It |
|---|---|
| `s3:CreateBucket` | To create the log storage bucket in the user's account |
| `s3:PutBucketPolicy` | To allow CloudWatch Logs service to write into the bucket |
| `s3:PutEncryptionConfiguration` | To enable AES-256 encryption on the bucket |
| `s3:PutBucketNotification` | To set up event notifications when new logs arrive |
| `s3:GetObject` | To read log files from the bucket for analysis |
| `s3:ListBucket` | To list available log files in the bucket |
| `logs:DescribeLogGroups` | To discover what log groups exist in the user's account |
| `logs:DescribeLogStreams` | To list log streams within a group |
| `logs:GetLogEvents` | To read actual log entries |
| `logs:CreateExportTask` | To export CloudWatch logs into the S3 bucket |
| `logs:PutSubscriptionFilter` | To set up real-time log streaming to S3/Lambda |
| `sts:GetCallerIdentity` | To verify the IAM credentials are valid |

---

## 5. Implementation Guide

### Required npm Packages

```bash
npm install @aws-sdk/client-s3 @aws-sdk/client-cloudwatch-logs @aws-sdk/client-sts
```

### File Structure (within the codebase)

```
client/
├── lib/
│   ├── aws/
│   │   ├── credentials.ts       # Build AWS client from encrypted DB creds
│   │   ├── s3.ts                # S3 bucket creation, policy, notifications
│   │   ├── cloudwatch.ts        # CloudWatch log group discovery & export
│   │   └── validate.ts          # STS credential validation
│   └── encrypt.ts               # Already built — AES-256 encrypt/decrypt
│
├── app/api/
│   ├── integration/
│   │   ├── setup/
│   │   │   └── route.ts         # POST — Full integration flow (the main entry point)
│   │   ├── status/
│   │   │   └── route.ts         # GET — Check integration status
│   │   └── teardown/
│   │       └── route.ts         # DELETE — Remove S3 bucket + subscriptions
│   └── ingest/
│       └── logs/
│           └── route.ts         # POST — Receive logs from S3 notifications
│
└── components/
    ├── IntegrateButton.tsx       # The "Integrate AI Agent" button
    └── IntegrationStatus.tsx     # Shows setup progress + status
```

### The Main Integration API Route

`app/api/integration/setup/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";
import { validateCredentials } from "@/lib/aws/validate";
import { createLogBucket, setBucketPolicy } from "@/lib/aws/s3";
import { subscribeLogGroups } from "@/lib/aws/cloudwatch";

export async function POST(req: NextRequest) {
  // 1. Authenticate the user
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get the user and their cloud credentials
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { cloudCredentials: true },
  });

  const credential = user?.cloudCredentials?.[0];
  if (!credential) {
    return NextResponse.json(
      { error: "No AWS credentials found. Please add them first." },
      { status: 400 }
    );
  }

  try {
    // 3. Validate credentials
    const identity = await validateCredentials(credential);

    // 4. Create S3 bucket
    const bucketName = await createLogBucket(credential, user.id);

    // 5. Set bucket policy for CloudWatch
    await setBucketPolicy(credential, bucketName, identity.accountId);

    // 6. Subscribe CloudWatch log groups
    const logGroups = await subscribeLogGroups(credential, bucketName);

    // 7. Save integration record in DB
    await prisma.integration.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        provider: "aws",
        s3BucketName: bucketName,
        logGroups: logGroups,
        status: "active",
      },
    });

    return NextResponse.json({
      success: true,
      bucketName,
      logGroupsConnected: logGroups.length,
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Integration failed" },
      { status: 500 }
    );
  }
}
```

---

## 6. Database Models Involved

### New Model: `Integration`

This tracks the state of a user's AWS integration.

```prisma
model Integration {
  id            String    @id @default(cuid())
  userId        String
  credentialId  String
  provider      String    // "aws" | "gcp" | "azure"
  s3BucketName  String?   // The bucket created by AutoSRE
  logGroups     String[]  // CloudWatch log groups being monitored
  status        String    @default("pending") // "pending" | "active" | "error" | "teardown"
  errorMessage  String?
  lastSyncAt    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user       User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  credential CloudCredential @relation(fields: [credentialId], references: [id])

  @@unique([userId, provider])
}
```

### Existing Models Used

| Model | Role in This Flow |
|---|---|
| `User` | The authenticated user triggering the integration |
| `CloudCredential` | Stores the encrypted IAM keys used to call AWS APIs |
| `Integration` *(new)* | Tracks what was created (bucket name, log groups, status) |

---

## 7. API Routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/integration/setup` | Run the full integration (validate → S3 → CloudWatch) |
| `GET` | `/api/integration/status` | Check current integration status and connected log groups |
| `DELETE` | `/api/integration/teardown` | Delete the S3 bucket and remove CloudWatch subscriptions |
| `POST` | `/api/integration/refresh` | Re-scan for new CloudWatch log groups and add them |

---

## 8. Error Handling & Rollback

If any step fails during integration, we must **clean up** everything we already created to avoid leaving orphaned resources in the user's AWS account.

```
Step 1 (Validate) fails → Return error, nothing to clean up
Step 2 (Create S3) fails → Return error, nothing to clean up
Step 3 (Bucket Policy) fails → Delete the S3 bucket we just created
Step 4 (CloudWatch) fails → Remove bucket policy, then delete bucket
Step 5 (Notification) fails → Remove subscriptions, remove policy, delete bucket
```

**Implementation pattern:**

```typescript
async function integrateWithRollback(credential: CloudCredential, userId: string) {
  let bucketName: string | null = null;

  try {
    // Step 1
    const identity = await validateCredentials(credential);

    // Step 2
    bucketName = await createLogBucket(credential, userId);

    // Step 3
    await setBucketPolicy(credential, bucketName, identity.accountId);

    // Step 4
    const logGroups = await subscribeLogGroups(credential, bucketName);

    return { success: true, bucketName, logGroups };

  } catch (error) {
    // ROLLBACK: If we created a bucket, delete it
    if (bucketName) {
      try {
        await deleteBucket(credential, bucketName);
      } catch (cleanupError) {
        console.error("Rollback failed:", cleanupError);
      }
    }
    throw error;
  }
}
```

---

## 9. Where This Fits in the Build Roadmap

This feature spans across **Phase 2 and Phase 4** of the main roadmap:

### Phase 2 (Weeks 4–6): Basic Integration

| Task | Details |
|---|---|
| ✅ Build `lib/aws/validate.ts` | STS credential validation |
| ✅ Build `lib/aws/s3.ts` | S3 bucket creation + policy |
| ✅ Build `lib/aws/cloudwatch.ts` | Log group discovery + export |
| ✅ Build `/api/integration/setup` route | The main integration endpoint |
| ✅ Build `IntegrateButton.tsx` component | UI for triggering integration |
| ✅ Add `Integration` model to Prisma | Track integration state in DB |
| ✅ Implement rollback on failure | Clean up AWS resources on error |
| ✅ Build `/api/integration/status` route | Show integration health |

### Phase 4 (Weeks 10–12): Real-Time Streaming

| Task | Details |
|---|---|
| Set up SNS topic in user's account | For real-time S3 event notifications |
| Create Lambda function template | Forwards CloudWatch logs to our API in real-time |
| Build `/api/integration/teardown` | Clean removal of all AWS resources |
| Build `/api/integration/refresh` | Detect and add new log groups automatically |
| Implement periodic log polling worker | Fallback for when SNS isn't configured |
| Add log group selection UI | Let users choose which log groups to monitor |

### Phase 5 (Weeks 13–16): Advanced Cloud Features

| Task | Details |
|---|---|
| Add GCP Cloud Logging support | Same flow but for Google Cloud |
| Add Azure Monitor support | Same flow but for Azure |
| Cloud misconfiguration scanning | Use the same IAM creds to scan for security issues |
| Infrastructure-as-Code fix generation | Generate Terraform/CloudFormation patches |

---

## Summary

The full data pipeline after integration is complete:

```
User's App → CloudWatch Logs → S3 Bucket → AutoSRE Ingestion API
                                                    │
                                            Anomaly Detection
                                                    │
                                            LLM Root Cause Analysis
                                                    │
                                            Decision Engine
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                              Generate PR      Rollback        Alert Engineer
```

The user clicks one button. The AI agent handles everything else.
