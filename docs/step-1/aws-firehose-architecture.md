# AWS Real-Time Log Integration — Full Architecture & Flow

> **One-click integration.** When a user clicks "Integrate AI Agent", Recovera programmatically provisions IAM roles, an S3 backup bucket, a Kinesis Data Firehose delivery stream, and CloudWatch subscription filters — all within the user's own AWS account. Logs begin streaming in real-time to the Recovera API within ~60 seconds.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [How the Initial Integration Works (Step-by-Step)](#2-how-the-initial-integration-works-step-by-step)
3. [The Continuous Data Flow](#3-the-continuous-data-flow)
4. [File-by-File Implementation Reference](#4-file-by-file-implementation-reference)
5. [IAM Permissions Required from the User](#5-iam-permissions-required-from-the-user)
6. [Database Schema](#6-database-schema)
7. [Security Model](#7-security-model)
8. [Error Handling & Rollback](#8-error-handling--rollback)
9. [Environment Variables](#9-environment-variables)

---

## 1. High-Level Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         USER'S AWS ACCOUNT                               │
│                                                                          │
│  ┌──────────────┐         ┌──────────────────┐                          │
│  │  User's App  │────────▶│   CloudWatch     │                          │
│  │  (EC2/ECS/   │  logs   │   Log Groups     │                          │
│  │   Lambda)    │         │                  │                          │
│  └──────────────┘         └────────┬─────────┘                          │
│                                    │                                     │
│                     Subscription Filter (per log group)                   │
│                     filterName: "AutoSRE-Firehose-Filter"                │
│                     filterPattern: "" (all events)                        │
│                     role: AutoSRE-CloudWatchRole-{acctId}-{region}        │
│                                    │                                     │
│                                    ▼                                     │
│                 ┌──────────────────────────────────────┐                 │
│                 │  Kinesis Data Firehose                │                 │
│                 │  AutoSRE-LogStream-{userId}-{region}  │                 │
│                 │  Type: DirectPut                      │                 │
│                 │  role: AutoSRE-FirehoseRole-{...}     │                 │
│                 └──────┬──────────────────┬─────────────┘                │
│                        │                  │                               │
│         ┌──────────────┘                  └──────────────┐               │
│         │ HTTP Endpoint                   │ S3 Backup     │               │
│         │ (Primary Destination)           │ (All Data)    │               │
│         │ Buffer: 1 MB / 60 sec           │ Buffer: 5 MB  │               │
│         │ Retry: 300 sec                  │ / 300 sec     │               │
│         ▼                                 ▼               │               │
│   ┌──────────────┐              ┌──────────────────┐     │               │
│   │ Recovera API │              │    S3 Bucket      │     │               │
│   │ /api/ingest  │              │ recovera-{userId} │     │               │
│   │ /logs        │              │ -${region}        │     │               │
│   └──────┬───────┘              │ Prefix:           │     │               │
│          │                      │  firehose-logs/   │     │               │
│          │                      │  firehose-errors/ │     │               │
│          │                      └──────────────────┘     │               │
└──────────┼──────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        RECOVERA (Our Platform)                          │
│                                                                         │
│  ┌───────────────────┐   ┌──────────────┐   ┌───────────────────────┐  │
│  │  POST /api/ingest │──▶│  Anomaly     │──▶│  LLM Root Cause       │  │
│  │  /logs            │   │  Detector    │   │  Analysis (AI Agent)  │  │
│  │  (Receives JSON)  │   │              │   │                       │  │
│  └───────────────────┘   └──────────────┘   └───────────┬───────────┘  │
│                                                         │               │
│                                          ┌──────────────┼──────────┐   │
│                                          ▼              ▼          ▼   │
│                                    Generate PR    Rollback     Alert   │
│                                    (Auto-fix)     Deploy       Team    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. How the Initial Integration Works (Step-by-Step)

When the user submits their IAM credentials via the `IntegrateModal` component, a single `POST /api/integration/setup` call triggers the entire provisioning pipeline. Here is exactly what happens, in order:

### Step 1 — Encrypt & Store IAM Credentials

**File:** `lib/encrypt.ts`, `app/api/integration/setup/route.ts`

The user provides their AWS `accessKeyId`, `secretAccessKey`, and `region` from the frontend. Before anything touches the database, both keys are encrypted using **AES-256-CBC** with a random IV per value.

```
User Input (plaintext)
     │
     ▼
encrypt(accessKeyId)     → "{iv_hex}:{ciphertext_hex}"
encrypt(secretAccessKey) → "{iv_hex}:{ciphertext_hex}"
     │
     ▼
Upsert into CloudCredential table (PostgreSQL)
```

The encryption key is sourced from `process.env.ENCRYPTION_KEY` (a 32-byte hex string). Each encrypted value stores its own IV as a prefix, so every encryption operation produces a unique ciphertext even for the same plaintext.

---

### Step 2 — Validate Credentials with AWS STS

**File:** `lib/aws/ValidateCredentials.ts`

Before provisioning any infrastructure, we verify the keys are real and active by calling `sts:GetCallerIdentity`.

```
STSClient({ region, credentials: { decrypt(accessKeyId), decrypt(secretAccessKey) } })
     │
     ▼
GetCallerIdentityCommand({})
     │
     ▼
Returns: { accountId, arn, userId }
```

If this call fails (expired keys, wrong keys, insufficient permissions), the entire integration aborts immediately — no AWS resources are created, no cleanup needed.

---

### Step 3 — Create S3 Backup Bucket

**File:** `lib/aws/CreateS3Bucket.ts`

We create a deterministic S3 bucket in the user's AWS account. The bucket serves as a **backup destination** for Firehose — all log data that flows through the stream is also persisted here for long-term retention and disaster recovery.

```
Bucket Name: "recovera-{userId}-{region}"
     │
     ▼
CreateBucketCommand({ Bucket, CreateBucketConfiguration })
     │
     ▼
If BucketAlreadyOwnedByYou → Reuse (idempotent)
If BucketAlreadyExists     → Reuse (idempotent)
Otherwise                  → Throw error, abort
```

**Design decisions:**
- The bucket name is deterministic (`recovera-{userId}-{region}`), so re-running the setup for the same user simply reuses the existing bucket instead of creating duplicates.
- The `CreateBucketConfiguration.LocationConstraint` is only set for non-`us-east-1` regions (AWS requirement).

---

### Step 4 — Create IAM Roles

**File:** `lib/aws/CreateIamRoles.ts`

Two IAM roles are created in the user's account. These roles follow the **principle of least privilege** — each is scoped to only the actions it needs.

#### Role A: Firehose Role (`AutoSRE-FirehoseRole-{accountId}-{region}`)

This role is assumed by the Kinesis Firehose service. It grants Firehose permission to write backup data to the S3 bucket.

```
Trust Policy (who can assume this role):
  → Principal: firehose.amazonaws.com
  → Action: sts:AssumeRole

Permissions Policy (what the role can do):
  → s3:AbortMultipartUpload
  → s3:GetBucketLocation
  → s3:GetObject
  → s3:ListBucket
  → s3:ListBucketMultipartUploads
  → s3:PutObject
  → Scoped to: arn:aws:s3:::{bucketName} and arn:aws:s3:::{bucketName}/*
```

#### Role B: CloudWatch Role (`AutoSRE-CloudWatchRole-{accountId}-{region}`)

This role is assumed by the CloudWatch Logs service. It grants CloudWatch permission to forward log events into the Firehose stream.

```
Trust Policy:
  → Principal: logs.{region}.amazonaws.com
  → Action: sts:AssumeRole

Permissions Policy:
  → firehose:PutRecord
  → firehose:PutRecordBatch
  → Scoped to: arn:aws:firehose:{region}:{accountId}:deliverystream/AutoSRE-LogStream-*
```

**Important:** After creating both roles, the code waits **5 seconds** (`await new Promise(resolve => setTimeout(resolve, 5000))`) for IAM role propagation. AWS IAM is eventually consistent — using a newly created role immediately can cause `AccessDenied` errors.

Both role creation operations are idempotent: if the role already exists (`EntityAlreadyExistsException`), the existing ARN is fetched via `GetRoleCommand` and reused.

---

### Step 5 — Create Kinesis Data Firehose Delivery Stream

**File:** `lib/aws/CreateFirehose.ts`

This is the core of the real-time pipeline. We create a Firehose **Delivery Stream** that:
1. Receives log records from CloudWatch (via DirectPut).
2. Sends them to the Recovera HTTP endpoint (primary destination).
3. Backs them up to S3 (secondary destination).

```
Stream Name: "AutoSRE-LogStream-{userId}-{region}"
Type: DirectPut

┌───────────────────────────────────────────────────────────┐
│           HTTP Endpoint Destination (Primary)             │
│  URL:       process.env.INGEST_API_URL                    │
│  Name:      "AutoSRE-Ingest-Endpoint"                     │
│  Buffer:    1 MB or 60 seconds (whichever comes first)    │
│  Retry:     300 seconds on failure                        │
│  Role:      AutoSRE-FirehoseRole-{accountId}-{region}     │
├───────────────────────────────────────────────────────────┤
│             S3 Backup Destination (All Data)              │
│  Bucket:    arn:aws:s3:::{bucketName}                     │
│  Prefix:    firehose-logs/                                │
│  Errors:    firehose-errors/                              │
│  Buffer:    5 MB or 300 seconds                           │
│  Role:      AutoSRE-FirehoseRole-{accountId}-{region}     │
└───────────────────────────────────────────────────────────┘
```

After creating the stream, the code **polls for ACTIVE status** (up to 12 attempts, 5 seconds apart = ~60 seconds max). The Firehose ARN is returned and stored in the database.

If the stream already exists (`ResourceInUseException`), it is reused.

---

### Step 6 — Attach CloudWatch Subscription Filters

**File:** `lib/aws/CreateCloudWatch.ts`

The final step connects the user's actual logs to the pipeline. We iterate through **every CloudWatch Log Group** in the user's account and attach a subscription filter that forwards all events to the Firehose stream.

```
For each Log Group in the user's account:
     │
     ▼
PutSubscriptionFilterCommand({
  logGroupName:    group.logGroupName,
  filterName:      "AutoSRE-Firehose-Filter",
  filterPattern:   "",                    ← Empty = send ALL log events
  destinationArn:  firehoseArn,           ← The Firehose stream from Step 5
  roleArn:         cwRoleArn,             ← The CloudWatch role from Step 4
})
```

**Pagination:** CloudWatch's `DescribeLogGroups` API returns a maximum of 50 log groups per call. The code paginates through all pages using `nextToken` to ensure no log group is missed.

The list of connected log group names is returned and stored in the `Integration` record.

---

### Step 7 — Persist Integration Record

**File:** `app/api/integration/setup/route.ts`

Once all AWS resources are provisioned, the integration state is saved to PostgreSQL:

```
Integration.upsert({
  userId,
  provider: "aws",
  credentialId: credential.id,
  s3BucketName: bucketName,
  firehoseArn: firehoseArn,
  logGroups: [...logGroupNames],
  status: "active",
  lastSyncAt: now()
})
```

---

## 3. The Continuous Data Flow

After provisioning completes, logs stream automatically with **zero ongoing user interaction**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. LOG GENERATION                                                   │
│    User's app (EC2/ECS/Lambda) writes to stdout/stderr              │
│    → CloudWatch agent captures these into Log Groups                │
│                                                                     │
│ 2. INTERCEPTION                                                     │
│    CloudWatch Subscription Filter (filterPattern: "") captures      │
│    ALL new log events in real-time                                  │
│                                                                     │
│ 3. FORWARDING                                                       │
│    CloudWatch → PutRecord/PutRecordBatch → Kinesis Firehose         │
│    (using AutoSRE-CloudWatchRole for auth)                          │
│                                                                     │
│ 4. BUFFERING                                                        │
│    Firehose buffers logs until either:                              │
│    → 1 MB of data accumulated, OR                                   │
│    → 60 seconds have elapsed (whichever comes first)                │
│                                                                     │
│ 5. DELIVERY                                                         │
│    Firehose makes HTTP POST to Recovera's /api/ingest/logs          │
│    → JSON payload with base64-encoded, gzip-compressed log data     │
│    → On failure: retries for up to 300 seconds                      │
│    → Simultaneously: writes ALL data to S3 backup bucket            │
│                                                                     │
│ 6. PROCESSING                                                       │
│    Recovera API receives logs → Anomaly Detection → LLM Analysis    │
│    → Auto-remediation (PR generation, rollback, alerting)           │
└─────────────────────────────────────────────────────────────────────┘
```

**Latency:** From log generation to Recovera receiving it: **~60–90 seconds** (dominated by the Firehose buffer interval).

---

## 4. File-by-File Implementation Reference

```
client/
├── lib/
│   ├── encrypt.ts                         # AES-256-CBC encrypt/decrypt
│   ├── prisma.ts                          # Prisma client singleton
│   └── aws/
│       ├── ValidateCredentials.ts         # STS GetCallerIdentity
│       ├── CreateS3Bucket.ts              # S3 bucket creation (idempotent)
│       ├── CreateIamRoles.ts              # Firehose + CloudWatch IAM roles
│       ├── CreateFirehose.ts              # Kinesis Firehose delivery stream
│       └── CreateCloudWatch.ts            # Subscription filters on all log groups
│
├── app/api/
│   └── integration/
│       └── setup/
│           └── route.ts                   # POST — Orchestrates the full pipeline
│
├── prisma/
│   └── schema.prisma                      # User, CloudCredential, Integration models
│
└── components/
    └── IntegrateModal.tsx                  # Frontend UI for credential input
```

### Execution Order (within `POST /api/integration/setup`)

| Step | File Called | AWS Service | Action |
|------|-----------|-------------|--------|
| 1 | `encrypt.ts` | — | Encrypt `accessKeyId` & `secretAccessKey` |
| 2 | `route.ts` | PostgreSQL | Upsert `CloudCredential` record |
| 3 | `ValidateCredentials.ts` | STS | `GetCallerIdentity` — verify keys |
| 4 | `CreateS3Bucket.ts` | S3 | `CreateBucket` — backup bucket |
| 5 | `CreateIamRoles.ts` | IAM | `CreateRole` × 2 + `PutRolePolicy` × 2 |
| 6 | `CreateFirehose.ts` | Firehose | `CreateDeliveryStream` + poll for ACTIVE |
| 7 | `CreateCloudWatch.ts` | CloudWatch | `PutSubscriptionFilter` × N log groups |
| 8 | `route.ts` | PostgreSQL | Upsert `Integration` record |

---

## 5. IAM Permissions Required from the User

The user must attach this policy to the IAM user whose credentials they provide:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RecoveraSTS",
      "Effect": "Allow",
      "Action": ["sts:GetCallerIdentity"],
      "Resource": "*"
    },
    {
      "Sid": "RecoveraS3",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:PutBucketPolicy",
        "s3:PutEncryptionConfiguration",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:PutObject",
        "s3:GetBucketLocation",
        "s3:AbortMultipartUpload",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::recovera-*",
        "arn:aws:s3:::recovera-*/*"
      ]
    },
    {
      "Sid": "RecoveraIAM",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:GetRole",
        "iam:PassRole"
      ],
      "Resource": [
        "arn:aws:iam::*:role/AutoSRE-*"
      ]
    },
    {
      "Sid": "RecoveraFirehose",
      "Effect": "Allow",
      "Action": [
        "firehose:CreateDeliveryStream",
        "firehose:DescribeDeliveryStream"
      ],
      "Resource": [
        "arn:aws:firehose:*:*:deliverystream/AutoSRE-LogStream-*"
      ]
    },
    {
      "Sid": "RecoveraCloudWatch",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:PutSubscriptionFilter",
        "logs:DeleteSubscriptionFilter"
      ],
      "Resource": "*"
    }
  ]
}
```

### Permission Breakdown

| Permission | Used By | Why |
|---|---|---|
| `sts:GetCallerIdentity` | Step 2 | Validate IAM keys and get Account ID |
| `s3:CreateBucket` | Step 3 | Create the backup S3 bucket |
| `s3:PutObject`, `s3:GetObject`, etc. | Firehose Role | Firehose writes backup data to S3 |
| `iam:CreateRole` | Step 4 | Create Firehose + CloudWatch roles |
| `iam:PutRolePolicy` | Step 4 | Attach inline policies to both roles |
| `iam:GetRole` | Step 4 | Retrieve existing role ARN (idempotent path) |
| `iam:PassRole` | Step 5 | Pass roles to Firehose + CloudWatch services |
| `firehose:CreateDeliveryStream` | Step 5 | Create the Kinesis Firehose stream |
| `firehose:DescribeDeliveryStream` | Step 5 | Poll for ACTIVE status |
| `logs:DescribeLogGroups` | Step 6 | Discover all log groups |
| `logs:PutSubscriptionFilter` | Step 6 | Attach real-time forwarding filters |

---

## 6. Database Schema

### CloudCredential (stores encrypted IAM keys)

```prisma
model CloudCredential {
  id               String        @id @default(cuid())
  userId           String
  provider         String                         // "aws"
  label            String?                        // "My AWS Account"
  accessKeyId      String        @db.Text         // AES-256-CBC encrypted
  secretAccessKey  String        @db.Text         // AES-256-CBC encrypted
  region           String                         // e.g. "us-east-1"
  roleArn          String?       @db.Text
  sessionToken     String?       @db.Text
  isActive         Boolean       @default(true)
  lastVerifiedAT   DateTime?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  user             User          @relation(...)
  integrations     Integration[]

  @@unique([userId, provider, label])
}
```

### Integration (tracks provisioned AWS resources)

```prisma
model Integration {
  id           String          @id @default(cuid())
  userId       String
  credentialId String
  provider     String                              // "aws"
  s3BucketName String?                             // "recovera-{userId}-{region}"
  firehoseArn  String?                             // Full ARN of the Firehose stream
  logGroups    String[]                            // List of connected log group names
  status       String                              // "pending" | "active" | "error"
  errorMessage String?
  lastSyncAt   DateTime?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  user         User            @relation(...)
  credentials  CloudCredential @relation(...)

  @@unique([userId, provider])
}
```

### Entity Relationship

```text
User (1) ──────▶ (N) CloudCredential
  │                       │
  │                       │
  ▼                       ▼
User (1) ──────▶ (N) Integration ◀──── (1) CloudCredential
```

A user can have multiple cloud credentials (multi-account support), but only one active integration per provider (enforced by `@@unique([userId, provider])`).

---

## 7. Security Model

| Concern | How It's Handled |
|---|---|
| **Credentials at rest** | AES-256-CBC encrypted with per-value random IV. Key stored in `ENCRYPTION_KEY` env var. |
| **Credentials in transit** | HTTPS between client ↔ Next.js API. AWS SDK uses HTTPS + SigV4 signing. |
| **Least privilege (Firehose Role)** | Can ONLY write to the specific `recovera-*` S3 bucket. Cannot read other resources. |
| **Least privilege (CW Role)** | Can ONLY put records into `AutoSRE-LogStream-*` Firehose streams. |
| **Resource isolation** | Bucket names and stream names include `userId`, preventing cross-tenant collisions. |
| **Idempotency** | All resource creation is idempotent — re-running setup reuses existing resources. |
| **S3 backup encryption** | S3 bucket data encrypted at rest (AWS-managed keys by default). |

---

## 8. Error Handling & Rollback

The setup route tracks every AWS resource it creates in a `createdResources[]` array. If any step fails:

```text
Step 1 (Encrypt/Store Creds) fails → No AWS resources created. DB transaction rolls back.
Step 2 (STS Validate) fails        → No AWS resources created. Creds already in DB but safe.
Step 3 (S3 Bucket) fails           → No cleanup needed (bucket didn't get created).
Step 4 (IAM Roles) fails           → Bucket exists but is empty. Logged for manual cleanup.
Step 5 (Firehose) fails            → Bucket + Roles exist. Logged for manual cleanup.
Step 6 (CloudWatch) fails          → All infra exists, but no log groups subscribed. Logged.
Step 7 (DB Persist) fails          → AWS resources exist but integration not tracked. Logged.
```

On failure, the route logs all created resources to the console:

```
⚠️  Partial resources were created before failure. Manual cleanup may be required:
   - S3 Bucket: recovera-cuid123-us-east-1
   - Firehose IAM Role: arn:aws:iam::123456789012:role/AutoSRE-FirehoseRole-...
   - CloudWatch IAM Role: arn:aws:iam::123456789012:role/AutoSRE-CloudWatchRole-...
   - Firehose Stream: arn:aws:firehose:us-east-1:123456789012:deliverystream/...
```

> **Future improvement:** Implement automated rollback (delete created resources on failure) via a teardown function. Currently tracked in the roadmap.

---

## 9. Environment Variables

| Variable | Purpose | Example |
|---|---|---|
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-CBC encryption of IAM credentials | `a1b2c3d4...` (64 hex chars) |
| `INGEST_API_URL` | The public HTTPS URL that Firehose will POST log data to | `https://app.recovera.io/api/ingest/logs` |
| `DATABASE_URL` | PostgreSQL connection string (used by Prisma) | `postgresql://user:pass@localhost:5432/recovera` |

---

## Summary

```text
User clicks "Integrate"
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. Encrypt IAM keys (AES-256-CBC) → store in PostgreSQL        │
│  2. Validate keys (STS GetCallerIdentity)                       │
│  3. Create S3 bucket (recovera-{userId}-{region})               │
│  4. Create 2 IAM roles (Firehose + CloudWatch)                  │
│  5. Create Firehose delivery stream → HTTP + S3 destinations    │
│  6. Subscribe ALL CloudWatch log groups → Firehose              │
│  7. Save integration record to DB (status: "active")            │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
  ✅ Integration Complete
  Logs now flow in real-time:
  App → CloudWatch → Firehose → Recovera API + S3 Backup
```

The user clicks one button. The AI agent handles everything else.
