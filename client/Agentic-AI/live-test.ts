import { config } from "dotenv";
import * as path from "path";

// Load .env from the client directory
config({ path: path.join(__dirname, "..", ".env") });

import { runAgent } from "./agent/index";
import * as fs from "fs";
import { AgentInput } from "./agent/types";

async function main() {
  console.log("Running Live E2E Tests against real LLM APIs (AGENT_MOCK is " + process.env.AGENT_MOCK + ")\n");
  
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is not set in .env!");
    return;
  }
  
  const fixturePath = path.join(__dirname, "tests", "fixtures", "s3-public.input.json");
  const baseInput: AgentInput = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  // --- Scenario 1: Standard S3_PUBLIC ---
  console.log("==========================================");
  console.log("🧪 SCENARIO 1: S3_PUBLIC (Real API Call)");
  console.log("==========================================");
  try {
    const input1 = JSON.parse(JSON.stringify(baseInput));
    
    // Set a good post_fix_state so verification passes if auto_fix is chosen
    input1.resource_state.config.PublicAccessBlockConfiguration = {
      BlockPublicAcls: true,
      BlockPublicPolicy: true
    };

    console.log("Calling runAgent()... This may take a few seconds.");
    const report1 = await runAgent(input1);
    
    console.log("\n✅ REPORT RECEIVED:");
    console.log("Decision Path:", report1.decision_path);
    console.log("Action Taken:", report1.action_taken);
    console.log("Confidence:", report1.confidence);
    console.log("Root Cause:", report1.raw_output?.rootCauseSummary || report1.summary);
    console.log("\n💬 Slack Payload Preview:");
    console.log(JSON.stringify(report1.notification, null, 2));

  } catch (error) {
    console.error("Scenario 1 failed:", error);
  }

  // --- Scenario 2: UNKNOWN Event (Should bypass LLM) ---
  console.log("\n==========================================");
  console.log("🧪 SCENARIO 2: UNKNOWN Event (Bypass check)");
  console.log("==========================================");
  try {
    const input2 = JSON.parse(JSON.stringify(baseInput));
    input2.event = "UNKNOWN";
    
    console.log("Calling runAgent()...");
    const report2 = await runAgent(input2);
    
    console.log("\n✅ REPORT RECEIVED:");
    console.log("Decision Path:", report2.decision_path);
    console.log("Action Taken:", report2.action_taken);
    console.log("Confidence:", report2.confidence);
    console.log("Requires Human Review:", report2.requires_human_review);
  } catch (error) {
    console.error("Scenario 2 failed:", error);
  }

  // --- Scenario 3: Idempotency check ---
  console.log("\n==========================================");
  console.log("🧪 SCENARIO 3: Idempotency (Already Done)");
  console.log("==========================================");
  try {
    const input3 = JSON.parse(JSON.stringify(baseInput));
    input3.incident_status = "done";
    
    console.log("Calling runAgent()...");
    const report3 = await runAgent(input3);
    
    console.log("\n✅ REPORT RECEIVED:");
    console.log("Skip Reason:", report3.skip_reason);
    console.log("Summary:", report3.summary);
  } catch (error) {
    console.error("Scenario 3 failed:", error);
  }

  console.log("\n🎉 Live tests completed.");
}

main();
