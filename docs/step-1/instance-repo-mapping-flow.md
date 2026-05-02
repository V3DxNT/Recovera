# Instance-to-Repo Mapping — How It Works

> When a user clicks "Integrate", Recovera now discovers all AWS resources (EC2, ECS, EKS, Lambda) and lets the user map each one to a GitHub repo. Only the mapped resources get subscribed. Logs are stored in per-repo folders inside a single S3 bucket.

---

## The Flow

```
User clicks "Integrate"
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Credentials                                            │
│  User enters: Access Key ID, Secret Access Key, Region          │
│  → POST /api/integration/setup                                  │
│  → Encrypts keys (AES-256-CBC) → saves to CloudCredential DB   │
│  → Validates with AWS STS (GetCallerIdentity)                   │
│  → Returns: credentialId                                        │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Discovery                                              │
│  → POST /api/integration/discover { credentialId }              │
│  → Queries user's AWS account in parallel:                      │
│     • EC2: DescribeInstances (running only, extracts Name tag)  │
│     • ECS: ListClusters → ListServices → DescribeServices       │
│     • EKS: ListClusters + ECR DescribeRepositories              │
│     • CloudWatch: DescribeLogGroups (catches Lambda + others)   │
│  → Also fetches user's GitHub repos via GitHub API              │
│  → Returns: { resources[], repos[] }                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: User Selects Mappings (Frontend UI)                    │
│                                                                 │
│  Shows discovered resources grouped by type:                    │
│                                                                 │
│  EC2 Instances                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🖥  payment-api-prod (i-0abc...)                           │ │
│  │     Map to repo: [ user/payment-api        ▾ ]            │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ 🖥  auth-server (i-0def...)                                │ │
│  │     Map to repo: [ — Skip —                ▾ ]            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  EKS Services (cluster: my-eks-cluster)                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ☸  payment-api (ECR image)                                 │ │
│  │     Map to repo: [ user/payment-api        ▾ ]            │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ ☸  notification-svc (ECR image)                            │ │
│  │     Map to repo: [ user/notification-svc   ▾ ]            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  • Users can skip resources they don't want to monitor          │
│  • Multiple resources can map to the same repo                  │
│  • Users can type a repo name manually if not imported yet      │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Provisioning                                           │
│  → POST /api/integration/provision { credentialId, mappings[] } │
│                                                                 │
│  1. Create S3 bucket: recovera-{userId}-{region}                │
│  2. Create IAM roles (Firehose + CloudWatch)                    │
│  3. Create Firehose delivery stream → API + S3 backup           │
│  4. Subscribe ONLY the mapped log groups (not all)              │
│  5. Save Integration record to DB                               │
│  6. Save InstanceMapping records (repo ↔ resource)              │
│                                                                 │
│  → Returns: { integrationId, subscribedGroups, mappingCount }   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
                  ✅ Integration Complete
```

---

## How EKS Services Are Discovered

EKS clusters contain multiple microservices. Since we can't directly query the Kubernetes API without kubeconfig, we use **ECR (Elastic Container Registry)** as a proxy:

```
EKS Discovery Flow:
1. eks:ListClusters → ["my-eks-cluster", "staging-cluster"]
2. ecr:DescribeRepositories → ["payment-api", "auth-service", "frontend"]
3. Each ECR image = a deployable service on the cluster
4. Associated log group = /aws/eks/{cluster}/containers
5. User maps each ECR image to a GitHub repo
```

| ECR Image | EKS Cluster | Log Group | Mapped Repo |
|---|---|---|---|
| `payment-api` | my-eks-cluster | `/aws/eks/my-eks-cluster/containers` | `user/payment-api` |
| `auth-service` | my-eks-cluster | `/aws/eks/my-eks-cluster/containers` | `user/auth-service` |
| `frontend` | my-eks-cluster | `/aws/eks/my-eks-cluster/containers` | `user/frontend-app` |

**Note:** Multiple EKS services share the same log group. At ingestion time, Kubernetes metadata (`container_image`, pod labels) in each log line is parsed to route logs to the correct repo. See `docs/repo-log-mapping-strategy.md` for details.

---

## Per-Repo S3 Folder Structure

All logs go into a **single S3 bucket** but are organized into **per-repo folders**:

```
recovera-{userId}-{region}/
│
├── repos/                          ← Organized logs (written by ingest endpoint)
│   ├── payment-api/
│   │   └── 2026/04/28/
│   │       ├── 1714300000000-abc123.json.gz
│   │       └── 1714300060000-def456.json.gz
│   ├── auth-service/
│   │   └── 2026/04/28/
│   │       └── 1714300000000-ghi789.json.gz
│   └── frontend-app/
│       └── 2026/04/28/
│           └── 1714300000000-jkl012.json.gz
│
├── firehose-raw/                   ← Raw Firehose backup (all logs mixed)
│   └── 2026/04/28/...              ← Fallback / disaster recovery
│
└── firehose-errors/                ← Failed delivery records
    └── ...
```

### How Per-Repo Writes Work

```
1. Firehose delivers log batch to POST /api/ingest/logs
2. Ingest endpoint parses each log entry:
   - For EKS logs: extracts service name from kubernetes.container_image
   - For EC2/ECS/Lambda: matches log group name to InstanceMapping table
3. Groups logs by repo
4. Writes each group to S3: repos/{repoName}/YYYY/MM/DD/{timestamp}.json.gz
5. Firehose independently writes raw backup to firehose-raw/
```

---

## Database Models

### Integration (one per AWS account connection)

```
Integration
├── id
├── userId
├── credentialId        → links to CloudCredential
├── provider            = "aws"
├── s3BucketName        = "recovera-{userId}-{region}"
├── firehoseArn
├── status              = "active" | "pending" | "error"
├── mappings[]          → InstanceMapping records
└── @@unique([userId, provider, credentialId])
```

### InstanceMapping (one per resource-to-repo association)

```
InstanceMapping
├── id
├── integrationId       → links to Integration
├── repoFullName        = "user/payment-api"
├── logGroupName        = "/aws/eks/cluster/containers"
├── resourceId          = "i-0abc123" or ARN or ECR image name
├── resourceType        = "ec2" | "ecs" | "eks" | "lambda" | "log_group"
├── resourceLabel       = "payment-api-prod" (friendly name)
└── @@unique([integrationId, logGroupName])
```

---

## Files Changed

```
client/
├── prisma/schema.prisma                          # Added InstanceMapping model
│
├── lib/aws/
│   ├── DiscoverResources.ts                      # NEW — EC2/ECS/EKS/CW discovery
│   ├── WriteRepoLogs.ts                          # NEW — Per-repo S3 folder writes
│   ├── CreateCloudWatch.ts                        # MODIFIED — Selective subscription
│   ├── CreateFirehose.ts                          # MODIFIED — S3 prefix → firehose-raw/
│   ├── CreateS3Bucket.ts                          # Unchanged
│   ├── CreateIamRoles.ts                          # Unchanged
│   └── ValidateCredentials.ts                     # Unchanged
│
├── app/api/integration/
│   ├── setup/route.ts                             # MODIFIED — Phase 1 only (creds + validate)
│   ├── discover/route.ts                          # NEW — Resource discovery endpoint
│   └── provision/route.ts                         # NEW — Phase 2 (infra + mappings)
│
└── components/
    └── IntegrateModal.tsx                          # TO UPDATE — Add selecting + provisioning steps
```

---

## API Endpoints

| Method | Route | Purpose | Input | Output |
|--------|-------|---------|-------|--------|
| POST | `/api/integration/setup` | Phase 1: Validate + store credentials | `{ accessKeyId, secretAccessKey, region }` | `{ credentialId }` |
| POST | `/api/integration/discover` | Discover AWS resources + GitHub repos | `{ credentialId }` | `{ resources[], repos[] }` |
| POST | `/api/integration/provision` | Phase 2: Provision infra + save mappings | `{ credentialId, mappings[] }` | `{ integrationId, subscribedGroups }` |

---

## IAM Permissions Required

The user must attach this policy to their IAM user. **New permissions** for resource discovery are marked with `← NEW`:

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
        "s3:CreateBucket", "s3:PutObject", "s3:GetObject",
        "s3:GetBucketLocation", "s3:ListBucket",
        "s3:AbortMultipartUpload", "s3:ListBucketMultipartUploads"
      ],
      "Resource": ["arn:aws:s3:::recovera-*", "arn:aws:s3:::recovera-*/*"]
    },
    {
      "Sid": "RecoveraIAM",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:PutRolePolicy", "iam:GetRole", "iam:PassRole"],
      "Resource": ["arn:aws:iam::*:role/AutoSRE-*"]
    },
    {
      "Sid": "RecoveraFirehose",
      "Effect": "Allow",
      "Action": ["firehose:CreateDeliveryStream", "firehose:DescribeDeliveryStream"],
      "Resource": ["arn:aws:firehose:*:*:deliverystream/AutoSRE-LogStream-*"]
    },
    {
      "Sid": "RecoveraCloudWatch",
      "Effect": "Allow",
      "Action": ["logs:DescribeLogGroups", "logs:PutSubscriptionFilter"],
      "Resource": "*"
    },
    {
      "Sid": "RecoveraDiscovery",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ecs:ListClusters", "ecs:ListServices", "ecs:DescribeServices",
        "eks:ListClusters", "eks:DescribeCluster",
        "ecr:DescribeRepositories"
      ],
      "Resource": "*"
    }
  ]
}
```
