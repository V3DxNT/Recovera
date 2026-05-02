# Repo-to-Log Mapping Strategy — EKS Multi-Service Environments

> How Recovera identifies which GitHub repo produced which log line, even when multiple services run on the same EKS cluster and share a single CloudWatch Log Group.

---

## The Problem

A typical user has multiple GitHub repos deployed as separate microservices on one EKS cluster:

| GitHub Repo | Deployed As | Container Image |
|---|---|---|
| `user/payment-api` | EKS Deployment `payment-api` | `ECR/payment-api:v1.2` |
| `user/auth-service` | EKS Deployment `auth-service` | `ECR/auth-service:v3.0` |
| `user/notification-svc` | EKS Deployment `notification-svc` | `ECR/notification-svc:v2.1` |
| `user/frontend-app` | EKS Deployment `frontend` | `ECR/frontend-app:v4.0` |

All their logs flow into a **single CloudWatch Log Group** (`/aws/eks/cluster/containers`) via Fluent Bit, then into Recovera via Firehose as one mixed stream. Recovera must sort them.

---

## The Solution: Parse Kubernetes Metadata at Ingestion

Every log entry from EKS (when using Fluent Bit, which is the AWS default) includes a `kubernetes` metadata object. This object contains the **container image name**, **pod name**, **namespace**, and **labels** — all of which identify the source service.

### What a Raw Log Entry Looks Like

```json
{
  "log": "ERROR: Failed to charge card ending in 4242",
  "stream": "stderr",
  "time": "2026-04-27T09:15:32.456Z",
  "kubernetes": {
    "pod_name": "payment-api-7b9f4d6c8-xk2m9",
    "namespace_name": "production",
    "container_name": "payment-api",
    "container_image": "123456.dkr.ecr.us-east-1.amazonaws.com/payment-api:v1.2",
    "labels": {
      "app.kubernetes.io/name": "payment-api",
      "app.kubernetes.io/version": "v1.2"
    }
  }
}
```

The field `kubernetes.container_image` contains the ECR repo name (`payment-api`), which matches the GitHub repo name. **This is the primary key for mapping.**

---

## Implementation Plan

### Step 1: The Integration & InstanceMapping Database Models

Instead of a generic `RepoMapping`, we use a structured `Integration` model that groups multiple `InstanceMapping` records. This explicitly links a GitHub repository to a specific AWS resource *before* logs even start streaming.

Add this to `prisma/schema.prisma`:

```prisma
model Integration {
  id           String            @id @default(cuid())
  userId       String
  credentialId String
  provider     String
  status       String
  mappings     InstanceMapping[]

  @@unique([userId, provider, credentialId])
}

model InstanceMapping {
  id              String      @id @default(cuid())
  integrationId   String
  repoFullName    String      // e.g., "user/payment-api"
  logGroupName    String      // e.g., "/aws/ecs/payment-api"
  resourceId      String      // e.g., "arn:aws:ecs:..."
  resourceType    String      // "ecs" | "ec2" | "lambda" | "eks"
  resourceLabel   String      // Display name
  confidence      Float       // 1.0 for exact match
  source          String      // "auto" | "manual"
  status          String      // "confirmed"

  integration Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  @@unique([integrationId, logGroupName, resourceId])
}
```

**Why map resources proactively?**
By mapping the AWS resource (and its associated log group) to the GitHub repo during the import phase, we establish a deterministic link. When logs arrive from that specific `logGroupName` or `resourceId`, we immediately know which repo they belong to, without relying purely on Kubernetes metadata parsing.

---

### Step 2: Build the Image Name Extractor

Create `client/lib/aws/parseLogMetadata.ts`:

```typescript
/**
 * Extracts the service/repo name from a Fluent Bit log entry's
 * Kubernetes metadata.
 *
 * Input:  "123456.dkr.ecr.us-east-1.amazonaws.com/payment-api:v1.2"
 * Output: "payment-api"
 */
export function extractServiceName(logEntry: any): string | null {
  // Priority 1: Kubernetes container image (most reliable)
  const image = logEntry?.kubernetes?.container_image;
  if (image) {
    // Strip registry prefix: "123456.dkr.ecr.../payment-api:v1.2" → "payment-api:v1.2"
    const withoutRegistry = image.includes("/")
      ? image.split("/").pop()!
      : image;
    // Strip tag: "payment-api:v1.2" → "payment-api"
    return withoutRegistry.split(":")[0];
  }

  // Priority 2: Kubernetes label (standard k8s label)
  const label = logEntry?.kubernetes?.labels?.["app.kubernetes.io/name"];
  if (label) return label;

  // Priority 3: Container name from metadata
  const containerName = logEntry?.kubernetes?.container_name;
  if (containerName) return containerName;

  // Priority 4: Pod name prefix (strip the random hash suffix)
  // "payment-api-7b9f4d6c8-xk2m9" → "payment-api"
  const podName = logEntry?.kubernetes?.pod_name;
  if (podName) {
    // Kubernetes pod names: {deployment}-{replicaset-hash}-{pod-hash}
    // Remove the last two dash-separated segments
    const parts = podName.split("-");
    if (parts.length > 2) {
      return parts.slice(0, -2).join("-");
    }
    return podName;
  }

  return null;
}

/**
 * Extracts additional metadata useful for log routing.
 */
export function extractLogMetadata(logEntry: any) {
  return {
    serviceName: extractServiceName(logEntry),
    namespace: logEntry?.kubernetes?.namespace_name || null,
    podName: logEntry?.kubernetes?.pod_name || null,
    containerImage: logEntry?.kubernetes?.container_image || null,
    logMessage: logEntry?.log || null,
    stream: logEntry?.stream || null, // "stdout" or "stderr"
    timestamp: logEntry?.time || null,
  };
}
```

---

### Step 3: UI-Driven Resource Discovery & Auto-Matching

Instead of waiting for logs to arrive and auto-matching in the background, we proactively discover and map resources during the repository import flow using `InstanceSelectModal.tsx`.

1. **Discovery (`/api/integration/discover`)**: When a user clicks "Import" on a GitHub repo, the backend uses the AWS SDK to scan their account for EC2 instances, ECS clusters/services, EKS clusters, Lambda functions, and standalone Log Groups.
2. **Auto-Matching**: The UI compares the GitHub repository name (e.g., `payment-api`) with the discovered AWS resource names.
   - **Exact Match**: The resource is automatically highlighted for the user.
   - **No Match**: The user is presented with a searchable list of all discovered resources to manually select the correct one.
3. **Provisioning (`/api/integration/provision` & `/api/integration/mappings`)**: Once the user confirms the selection, the system saves the `InstanceMapping` to the database and optionally provisions the necessary log streaming infrastructure (e.g., Kinesis Firehose subscriptions) targeted specifically at that resource's log group.

---

### Step 4: Update the Ingest Endpoint

Modify `client/app/api/ingest/logs/route.ts` to parse, tag, and route incoming logs:

```typescript
import { NextResponse } from "next/server";
import { extractLogMetadata } from "@/lib/aws/parseLogMetadata";
import { resolveRepoMapping } from "@/lib/aws/repoMapper";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Firehose sends a batch of records
    const records = body.records || [body];

    const processedLogs = [];

    for (const record of records) {
      // Firehose sends base64-encoded, gzip-compressed data
      // After decoding, each record is a JSON log entry from Fluent Bit
      const logEntry = typeof record === "string" ? JSON.parse(record) : record;

      // Extract Kubernetes metadata
      const metadata = extractLogMetadata(logEntry);

      if (!metadata.serviceName) {
        // No Kubernetes metadata — store as untagged
        processedLogs.push({
          ...metadata,
          repo: null,
          tagged: false,
        });
        continue;
      }

      // Resolve which GitHub repo this service belongs to
      // (uses cached mapping or auto-matches on first encounter)
      const userId = body.userId; // Passed in Firehose config or looked up
      const repoFullName = await resolveRepoMapping(
        userId,
        metadata.serviceName,
        body.logGroupName || "unknown"
      );

      processedLogs.push({
        ...metadata,
        repo: repoFullName,
        tagged: true,
      });
    }

    // At this point, processedLogs contains entries like:
    // { serviceName: "payment-api", repo: "user/payment-api", logMessage: "ERROR: ...", ... }
    // { serviceName: "auth-service", repo: "user/auth-service", logMessage: "WARN: ...", ... }
    //
    // → Pass to anomaly detector
    // → Store in logs table partitioned by repo

    return NextResponse.json({
      success: true,
      processed: processedLogs.length,
      tagged: processedLogs.filter(l => l.tagged).length,
      untagged: processedLogs.filter(l => !l.tagged).length,
    });

  } catch (error: any) {
    console.error("Log ingestion error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### Step 5: Log Resolution Strategy

When logs flow into Firehose, they are processed in batches. We use the saved `InstanceMapping` records to resolve the repository.

1. **Look up by Log Group**: The most reliable way is matching the incoming `logGroup` to a confirmed `InstanceMapping.logGroupName`.
2. **Look up by Metadata**: For shared log groups (like EKS), we fall back to parsing the Kubernetes metadata (e.g., `kubernetes.container_image`) to find the specific service, which is cross-referenced with `InstanceMapping.resourceId` or `resourceLabel`.

---

## How It Works End-to-End

**1. The Setup Phase (Proactive Mapping):**
```text
1. User clicks "Import" on "user/payment-api" in the Recovera dashboard.
2. System checks for existing AWS IAM Credentials (prompts if missing).
3. Backend scans AWS account and returns a list of resources.
4. UI automatically matches the "payment-api" ECS service.
5. User confirms -> Database stores InstanceMapping (repo: "user/payment-api", resourceId: "ecs-payment-api").
```

**2. The Ingestion Phase (Log Routing):**
```text
1. Firehose delivers log batch to /api/ingest/logs.
2. System extracts the log group or Kubernetes metadata.
3. System checks the InstanceMapping table.
4. Exact match found -> Logs are immediately tagged with "user/payment-api".
5. Tagged logs are passed to the anomaly detector and saved.
```

**When auto-matching fails during setup:**
```text
1. User imports "user/payment-worker".
2. AWS returns an EC2 instance named "worker-node-1". No auto-match.
3. User manually selects "worker-node-1" from the search UI.
4. Database stores InstanceMapping (repo: "user/payment-worker", resourceId: "worker-node-1").
5. Future logs from "worker-node-1" are correctly routed to "user/payment-worker".
```

---

## File Structure After Implementation

```
client/
├── lib/aws/
│   ├── parseLogMetadata.ts       # Extract service name from Fluent Bit metadata
│   └── repoMapper.ts             # Match service names to GitHub repos
│
├── app/api/
│   ├── ingest/logs/route.ts      # Receives Firehose data, tags each log with repo
│   └── repo-mappings/route.ts    # GET/PATCH for dashboard mapping UI
│
├── prisma/schema.prisma          # RepoMapping model added
│
└── components/
    └── RepoMappingTable.tsx      # Dashboard UI for viewing/confirming mappings
```

---

## Priority Order of Identification Methods

When extracting the service name from a log entry, we try these fields in order:

| Priority | Field | Example Value | Reliability |
|---|---|---|---|
| 1 | `kubernetes.container_image` | `ECR/payment-api:v1.2` | Highest — always set by Kubernetes |
| 2 | `kubernetes.labels["app.kubernetes.io/name"]` | `payment-api` | High — standard label, but optional |
| 3 | `kubernetes.container_name` | `payment-api` | Medium — set in Deployment spec |
| 4 | `kubernetes.pod_name` (prefix) | `payment-api-7b9f...` | Medium — requires hash stripping |
| 5 | CloudWatch Log Stream name | `payment-api-7b9f...` | Fallback — same as pod name |
| 6 | CloudWatch Log Group name | `/aws/eks/cluster/containers` | Useless — shared by all services |

---

## When Fluent Bit Is NOT Installed

If the user's EKS cluster doesn't use Fluent Bit (rare but possible), there is no `kubernetes` metadata in the logs. In this case:

1. **ECR Scan**: Call `ecr:DescribeRepositories` to list all ECR repos, match names against GitHub repos. This tells you what services exist, but can't tag individual log lines.

2. **EKS API**: Call `eks:DescribeCluster` → authenticate to the Kubernetes API → list Deployments → read container images and labels. This requires additional IAM permissions (`eks:DescribeCluster`) and Kubernetes RBAC setup.

3. **Manual Mapping Only**: The user maps each Log Group or Log Stream to a repo in the dashboard. This is the simplest fallback but requires the most user effort.

> **Recommendation:** Require Fluent Bit as a prerequisite for EKS integration. It's already the AWS-recommended default, and most production EKS clusters have it installed. If they don't have it, show a setup guide in the onboarding flow.
