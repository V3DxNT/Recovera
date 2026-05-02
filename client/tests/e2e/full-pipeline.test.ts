import { prisma } from "../../lib/prisma";
import { processLocalQueue } from "../../lib/detection/detector";

async function runScenarioA() {
  console.log("=== Starting Scenario A: E2E Happy Path ===");

  // 1. Ingest Log (Mocked Payload)
  console.log("\n[1] Ingesting Mock Log...");
  const logPayload = {
    requestId: "e2e-req-1",
    timestamp: Date.now(),
    records: [
      {
        recordId: "e2e-rec-1",
        data: Buffer.from(JSON.stringify({
          message: "SyntaxError: Unexpected token in JSON at position 0 at (utils/math.ts:15:10)",
          logGroup: "/aws/lambda/test-function"
        })).toString("base64")
      }
    ]
  };

  const ingestRes = await fetch("http://localhost:3000/api/ingest/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(logPayload)
  });
  
  if (!ingestRes.ok) throw new Error(`Ingest Failed: ${await ingestRes.text()}`);
  console.log("✅ Log ingested successfully.");

  // 2. Process Queue & Run RCA
  console.log("\n[2] Processing Detection Queue & RCA Agent...");
  await processLocalQueue(); // This will create the Incident and run the LLM Agent
  
  // Find the incident
  const incident = await prisma.incident.findFirst({
    orderBy: { createdAt: "desc" }
  });

  if (!incident) throw new Error("Incident was not created by the detector.");
  console.log(`✅ Incident Created: ${incident.id}`);

  // Force confidence high enough to pass safety checks for Scenario A
  await prisma.incident.update({
    where: { id: incident.id },
    data: { confidence: 0.95 }
  });

  // 3. Fix Generation
  console.log("\n[3] Triggering Fix Generation...");
  const fixRes = await fetch(`http://localhost:3000/api/incidents/${incident.id}/fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  
  if (!fixRes.ok) throw new Error(`Fix Generation Failed: ${await fixRes.text()}`);
  const fixData = await fixRes.json();
  console.log(`✅ Fix Generated. Patch ID: ${fixData.patch.id}`);
  console.log(`   Validation Status: ${fixData.patch.validationStatus}`);

  if (fixData.patch.validationStatus !== "passed") {
    throw new Error("Fix validation failed, cannot proceed to PR creation.");
  }

  // 4. PR Creation & Safety Gate
  console.log("\n[4] Triggering PR Creation (Safety Layer)...");
  
  const { evaluatePolicy } = await import("../../lib/safety/policyEngine");
  const policyResult = await evaluatePolicy({
    incidentId: incident.id,
    actionType: "pr_creation",
    confidenceScore: incident.confidence,
    patchDiff: fixData.patch.patchDiff,
  });

  console.log(`✅ Safety Policy Result: ${policyResult.decision}`);
  if (policyResult.decision !== "ALLOW_AUTO_PR") {
    throw new Error(`Policy blocked PR creation: ${policyResult.reasonCodes.join(", ")}`);
  }
  
  console.log("\n🎉 Scenario A Completed Successfully!");
}

runScenarioA().catch(console.error).finally(() => process.exit(0));
