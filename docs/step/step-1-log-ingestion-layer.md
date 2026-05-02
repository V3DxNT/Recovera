# Step 1: Log Ingestion Layer

## Objective
Build a reliable log ingress path from AWS runtime sources into Recovera so downstream detection receives normalized, deduplicated, replayable events.

## Current Implementation Status
**Status: Partially Implemented**

Implemented in codebase:
- Credential bootstrap and validation (`STS GetCallerIdentity`).
- Provisioning for S3 backup bucket, IAM roles, Firehose delivery stream, and CloudWatch subscription filters.
- Selective log group subscription during integration provisioning.

Key files:
- `client/app/api/integration/setup/route.ts`
- `client/app/api/integration/provision/route.ts`
- `client/lib/aws/CreateS3Bucket.ts`
- `client/lib/aws/CreateIamRoles.ts`
- `client/lib/aws/CreateFirehose.ts`
- `client/lib/aws/CreateCloudWatch.ts`

Missing:
- Runtime ingestion API (`POST /api/ingest/logs`) that accepts Firehose record batches.
- Normalized event persistence contract and ingest queue handoff.
- Ingest observability + dead-letter queue strategy.

## Technical Design

### Source and Transport Topology
1. Service logs emit into CloudWatch Log Groups (EC2/ECS/EKS/Lambda).
2. CloudWatch subscription filters push records into Firehose (`DirectPut` stream).
3. Firehose sends batched payloads to:
   - Primary: Recovera `POST /api/ingest/logs`
   - Backup: S3 (`firehose-logs/YYYY/MM/DD/`, `firehose-errors/YYYY/MM/DD/`)

### Ingest API Contract
Endpoint: `POST /api/ingest/logs`

Expected body (Firehose-style):
- `requestId`: string
- `timestamp`: number
- `records`: array of
  - `recordId`: string
  - `data`: base64 string

Processing pipeline (per record):
1. Base64 decode
2. gzip decompress when content is compressed
3. JSON parse
4. Normalize into internal envelope
5. Persist raw + normalized pointers
6. Publish to processing queue

### Normalized Event Envelope (Suggested)
- `eventId` (deterministic hash: `sha256(source + timestamp + message + logStream)`)
- `integrationId`
- `provider` (`aws`)
- `logGroupName`
- `logStreamName`
- `resourceId` (optional)
- `resourceType` (`ec2` | `ecs` | `eks` | `lambda` | `unknown`)
- `messageRaw`
- `messageParsed` (JSON/object if structured log)
- `timestamp`
- `ingestedAt`
- `parseStatus` (`ok` | `partial` | `failed`)

### Reliability Requirements
- At-least-once delivery assumption (duplicates are expected).
- Idempotent writes using deterministic `eventId`.
- DLQ storage for malformed records with reason code.
- Fast ACK path to avoid Firehose retries due to slow downstream compute.

## Implementation Checklist

- [x] Provision Firehose + IAM + CloudWatch subscription path
- [x] Create `client/app/api/ingest/logs/route.ts`
- [x] Add Firehose payload parser + validation utilities
- [x] Add normalized event schema/type in `client/lib/ingest/types.ts`
- [x] Persist ingestion artifacts (raw pointer + normalized event)
- [x] Publish normalized events to queue for Step 2 worker
- [x] Add dedup logic keyed by deterministic `eventId`
- [x] Implement dead-letter storage and retry metadata
- [x] Add ingest metrics (TPS, parse failure %, p95 latency)
- [x] Add alerting on ingest failures/backlog growth
- [x] Add integration tests with real Firehose fixture payloads

## Verification Criteria (Definition of Done)
- Firehose delivery to `/api/ingest/logs` is stable under burst traffic.
- Parse success rate >=99% for supported payload formats.
- Duplicate records do not create duplicate downstream events.
- Failed records are queryable and replayable.
- S3 backup is enabled and partitioned by date/source.

## Operational Risks and Controls
- **Payload drift risk:** AWS payload variants break parser.
  - Control: contract tests with sampled production payloads.
- **Throughput spikes:** API timeout causes Firehose retry storm.
  - Control: minimal synchronous work + async queue handoff.
- **Data quality degradation:** malformed JSON floods pipeline.
  - Control: strict parse status tracking + DLQ reason analytics.
