import { generateFix, MockIncident, MockRCA, MockCodeContext } from '../../lib/ai/fixGenerator';
import { validatePatch } from '../../lib/ai/patchValidator';

const mockIncident: MockIncident = {
  id: "inc-test-123",
  title: "TypeError: Cannot read properties of null (reading 'id')",
  severity: "high",
  fingerprint: "hash_test_123",
  eventCount: 42
};

const mockRCA: MockRCA = {
  rootCauseSummary: "A null object is being accessed without a null check.",
  failureMechanism: "The `getUser` function returns null if the user does not exist, but the caller assumes it always returns an object and accesses `.id`.",
  likelySubsystem: "Auth Service",
  fixStrategy: ["Add an early return or null check before accessing `user.id`."]
};

const mockContext: MockCodeContext[] = [
  {
    path: "src/services/auth.ts",
    content: `
function authenticate(token: string) {
  const user = getUser(token);
  // BUG: user might be null here
  return { id: user.id, token };
}

function getUser(token: string) {
  if (token === "invalid") return null;
  return { id: "u-1" };
}
    `
  }
];

async function runReplay() {
  console.log("Starting AI Replay Suite...\n");

  try {
    console.log("Generating fix...");
    const fix = await generateFix(mockIncident, mockRCA, mockContext);
    
    console.log("\n--- Generated Patch ---");
    console.log(fix.patchDiff);
    console.log("-----------------------\n");
    
    console.log("Summary:", fix.changeSummary);
    console.log("Risk Score:", fix.riskScore);

    console.log("\nValidating patch...");
    const validation = validatePatch(fix.patchDiff);
    
    if (validation.valid) {
      console.log("✅ Patch passed static validation.");
    } else {
      console.error("❌ Patch failed static validation:", validation.reason);
      process.exit(1);
    }
    
    console.log("\nReplay Suite completed successfully.");
  } catch (error) {
    console.error("\n❌ Replay Suite failed:", error);
    process.exit(1);
  }
}

// Execute the suite
runReplay();
