import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processIngestPayload } from "@/lib/ingest/process";
import { maybeRecordIngestAlert, recordIngestMetrics } from "@/lib/ingest/metrics";

function extractIntegrationHint(req: Request): {
  firehoseArn: string | null;
  integrationId: string | null;
} {
  const firehoseArn =
    req.headers.get("x-amz-firehose-source-arn") ||
    req.headers.get("x-firehose-delivery-stream-arn");
  const integrationId = req.headers.get("x-recovera-integration-id");
  return { firehoseArn, integrationId };
}

async function resolveIntegrationId(hints: {
  firehoseArn: string | null;
  integrationId: string | null;
}): Promise<string | null> {
  if (hints.integrationId) return hints.integrationId;
  if (!hints.firehoseArn) return null;

  const integration = await prisma.integration.findFirst({
    where: {
      firehoseArn: hints.firehoseArn,
      status: "active",
    },
    select: { id: true },
  });
  return integration?.id ?? null;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const hints = extractIntegrationHint(req);
    const integrationId = await resolveIntegrationId(hints);
    const result = await processIngestPayload({ body, integrationId });
    const durationMs = Date.now() - startedAt;
    await recordIngestMetrics({
      requestId: result.requestId,
      processed: result.processed,
      accepted: result.accepted,
      failed: result.failed,
      durationMs,
    });
    await maybeRecordIngestAlert({
      requestId: result.requestId,
      processed: result.processed,
      failed: result.failed,
    });

    return NextResponse.json(
      {
        success: true,
        requestId: result.requestId,
        integrationId,
        processed: result.processed,
        accepted: result.accepted,
        failed: result.failed,
        failedIds: result.failedIds,
        durationMs,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process ingest payload";
    console.error("Ingest logs route failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
