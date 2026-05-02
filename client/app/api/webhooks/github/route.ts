import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { processRepository } from "../../../../workers/repo-indexer";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

function verifySignature(payload: string, signature: string | null) {
  if (!WEBHOOK_SECRET || !signature) return false;

  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (signatureBuffer.length !== digestBuffer.length) return false;

  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    
    // In production, enforce webhook signature verification
    if (WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = req.headers.get("x-github-event");
    const body = JSON.parse(rawBody);

    if (event === "push") {
      const repositoryFullName = body.repository?.full_name;
      const commitSha = body.after;

      if (!repositoryFullName || !commitSha || commitSha === "0000000000000000000000000000000000000000") {
        return NextResponse.json({ message: "Ignored push event without valid SHA" });
      }

      // Find if we track this repository
      const repo = await prisma.repository.findFirst({
        where: { fullName: repositoryFullName }
      });

      if (repo) {
        // Trigger indexing in the background
        console.log(`[Webhook] Triggering indexing for ${repo.fullName} at ${commitSha}`);
        // Note: In Next.js, floating promises in API routes might be killed if deployed to serverless environments (like Vercel).
        // For a robust system, this should push to a queue (e.g., SQS) which triggers the worker.
        // For this implementation, we simulate it asynchronously.
        processRepository(repo.id, commitSha).catch(console.error);

        return NextResponse.json({ message: "Indexing job started" });
      } else {
        return NextResponse.json({ message: "Repository not tracked" });
      }
    }

    return NextResponse.json({ message: "Event ignored" });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
