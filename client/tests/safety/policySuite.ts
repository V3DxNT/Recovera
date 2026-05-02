import { evaluatePolicy, PolicyEvaluationRequest } from '../../lib/safety/policyEngine';
import { prisma } from '../../lib/prisma';

// Mock Prisma for testing
(prisma.safetyAuditLog.findMany as any) = async () => [];
(prisma.safetyAuditLog.create as any) = async () => ({});

async function runPolicySuite() {
  console.log("Starting Safety Policy Simulation Suite...\n");

  const tests: { name: string, req: PolicyEvaluationRequest, expected: string }[] = [
    {
      name: "High Confidence, Safe Domain -> ALLOW",
      req: {
        incidentId: "test-inc-1",
        actionType: "fix_generation",
        confidenceScore: 0.95,
        patchDiff: "diff --git a/components/Button.tsx b/components/Button.tsx\n+ // fixed padding"
      },
      expected: "ALLOW_AUTO_PR"
    },
    {
      name: "High Confidence, Sensitive Domain -> REQUIRE_APPROVAL",
      req: {
        incidentId: "test-inc-2",
        actionType: "fix_generation",
        confidenceScore: 0.95,
        patchDiff: "diff --git a/lib/auth.ts b/lib/auth.ts\n+ // fixed auth logic"
      },
      expected: "REQUIRE_HUMAN_APPROVAL"
    },
    {
      name: "Medium Confidence, Safe Domain -> REQUIRE_APPROVAL",
      req: {
        incidentId: "test-inc-3",
        actionType: "fix_generation",
        confidenceScore: 0.75,
        patchDiff: "diff --git a/utils/helpers.ts b/utils/helpers.ts\n+ // fixed regex"
      },
      expected: "REQUIRE_HUMAN_APPROVAL"
    },
    {
      name: "Low Confidence -> BLOCK",
      req: {
        incidentId: "test-inc-4",
        actionType: "fix_generation",
        confidenceScore: 0.50,
        patchDiff: "diff --git a/components/Button.tsx b/components/Button.tsx\n+ // fixed padding maybe?"
      },
      expected: "BLOCK_AND_ALERT"
    }
  ];

  let passed = 0;

  for (const test of tests) {
    console.log(`Running: ${test.name}`);
    const result = await evaluatePolicy(test.req);
    
    if (result.decision === test.expected) {
      console.log(`✅ Passed (Got ${result.decision})`);
      console.log(`   Reasons: ${result.reasonCodes.join(", ") || "None"}`);
      passed++;
    } else {
      console.error(`❌ Failed (Expected ${test.expected}, Got ${result.decision})`);
    }
    console.log("---");
  }

  console.log(`\nSuite Results: ${passed}/${tests.length} passed.`);
  if (passed !== tests.length) {
    process.exit(1);
  }
}

runPolicySuite();
