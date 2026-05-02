# Step 2: Log Processing and Issue Detection Completion

## Overview
This document outlines the final architectural design and implemented components for the Log Processing and Issue Detection module. This step bridges the gap between normalized log events and the automated RCA provided by the Agentic AI brain.

## Key Design Principles
1. **Idempotency via Distinct Scopes**: 
   - `eventId` serves as the strict log-level deduplication key within the `IncidentEvent` model.
   - `incident.id` provides the higher-level grouping key, derived from the versioned fingerprint (`v1_<sha256>`).
2. **Replay-Safe Processing**:
   - The local log processor safely moves the active queue (`.recovera-ingest/queue.ndjson`) to an ephemeral processing lock (`queue.processing-${Date.now()}.ndjson`) before executing. This avoids race conditions between competing background workers.
3. **Transaction & Retry Safety**:
   - Agent execution is wrapped in a transactional pattern. The `IncidentEvent` is marked as `pending` before `runAgent()` is invoked.
   - If execution fails or crashes, a fallback `catch` block downgrades the status to `failed`, allowing safe retry sweeps later.
   - Upon success, the `DiagnosticReport` is securely persisted in Prisma as JSON within the `DetectionAudit` table, and the status switches to `processed`.

## Implemented Components
1. **Schema Updates (`client/prisma/schema.prisma`)**:
   - **`Incident`**: Aggregates grouped events and maintains current severity and RCA status.
   - **`IncidentEvent`**: Represents individual, processed log payloads. Enforces `@unique` constraints on `eventId` and tracks `processingStatus`.
   - **`DetectionAudit`**: Stores execution history and serialized `DiagnosticReport` payloads to track automated remediation confidence and steps.
2. **Detector (`client/lib/detection/detector.ts`)**:
   - Exposes `processLocalQueue()` function handling the lock-read-parse-delete flow.
   - Exposes `processNormalizedEvent(log)` doing event routing, deduplication, Prisma upserts, `runAgent()` invocation, and transactional persistence.
3. **Test Suite (`client/tests/detection/detector.test.ts`)**:
   - Fully mocks Prisma `$transaction` bindings and `runAgent` module.
   - Verifies 3 essential cases:
     - New log events successfully insert into DB, trigger `runAgent`, and commit the successful audit log.
     - Duplicate processed log events are skipped natively.
     - Failed (previously crashed) log events resume processing upon queue replay.

## Definition of Done Validation
- ✅ Deterministic classification for basic failures is mapped (`S3_PUBLIC`, `IAM_OVERPERMISSION`, etc.).
- ✅ Strict idempotency prevents double-RCA for the same normalized log event.
- ✅ The database state accurately reflects both the incident group and the individual payload tracking.
- ✅ Automated retry hooks ensure agentic pipelines do not bleed out silently.
