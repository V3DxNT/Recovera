// Integration tests for the Recovera Agentic AI module, 
// covering various scenarios such as happy paths, 
// edge cases, and failure modes. The tests mock the LLM responses to 
// simulate different conditions and verify that the agent behaves as expected, 
// including decision paths, error handling, and report generation. Each test case corresponds to a 
// specific scenario outlined in the test plan, ensuring comprehensive coverage of the agent's functionality.

import { runAgent } from "../agent/index";
import { AgentInput, DiagnosticReport } from "../agent/types";
import * as llmCaller from "../agent/llm-caller";
import * as fs from "fs";
import * as path from "path";

// Helper to load fixture
function loadFixture(name: string): AgentInput {
  const filePath = path.join(__dirname, "fixtures", name);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as AgentInput;
}

// Mock the LLM caller
jest.mock("../agent/llm-caller", () => ({
  callLLM: jest.fn()
}));

describe("Recovera Agentic AI - Integration Tests", () => {
  const mockCallLLM = llmCaller.callLLM as jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.AGENT_MOCK = "false";
  });

  // 1. S3_PUBLIC happy path
  it("Scenario 1: S3_PUBLIC happy path results in auto_fix", async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      rootCauseSummary: "Public bucket",
      failureMechanism: "Fix it",
      likelySubsystem: "S3",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "generate_fix",
      confidence: 0.90,
      evidence: ["CloudTrail"]
    }));

    const input = loadFixture("s3-public.input.json");
    // Ensure verification passes by giving it a "fixed" state
    input.resource_state.config.PublicAccessBlockConfiguration = {
      BlockPublicAcls: true,
      BlockPublicPolicy: true
    };

    const report = await runAgent(input);
    
    expect(report.decision_path).toBe("auto_fix");
    expect(report.requires_human_review).toBe(false);
  });

  // 2. Low confidence
  it("Scenario 2: Low confidence results in alert_only", async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      rootCauseSummary: "Maybe public bucket",
      failureMechanism: "Not sure",
      likelySubsystem: "S3",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "generate_fix",
      confidence: 0.50, // low confidence
      evidence: []
    }));

    const input = loadFixture("s3-public.input.json");
    const report = await runAgent(input);
    
    expect(report.confidence).toBeLessThanOrEqual(0.60);
    expect(report.decision_path).toBe("alert_only");
  });

  // 3. Malformed LLM response
  it("Scenario 3: Malformed LLM response resolves safely to alert_only", async () => {
    mockCallLLM.mockResolvedValueOnce("THIS IS NOT JSON");

    const input = loadFixture("s3-public.input.json");
    const report = await runAgent(input);
    
    expect(report.action_taken).toBe("alert_only");
    expect(report.decision_path).toBe("alert_only");
    expect(report.raw_output.failureMechanism).toContain("failed to produce a valid structured response");
  });

  // 4. Blocked action
  it("Scenario 4: Blocked action routes to alert_only", async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      rootCauseSummary: "Unknown issue",
      failureMechanism: "Doing something weird",
      likelySubsystem: "Unknown",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "some_unauthorized_action", // Coerced to "unknown", which is "blocked"
      confidence: 0.95,
      evidence: []
    }));

    const input = loadFixture("s3-public.input.json");
    const report = await runAgent(input);
    
    expect(report.decision_path).toBe("alert_only");
    expect(report.raw_output.recommendedAction).toBe("unknown"); // Due to coercion
  });

  // 5. High confidence, needs-approval action
  it("Scenario 5: High confidence but needs-approval action routes to approval_required", async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      rootCauseSummary: "Overpermissive IAM",
      failureMechanism: "Needs restriction",
      likelySubsystem: "IAM",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "rollback", // needs_approval class
      confidence: 0.90,
      evidence: []
    }));

    const input = loadFixture("s3-public.input.json");
    const report = await runAgent(input);
    
    expect(report.decision_path).toBe("approval_required");
  });

  // 6. Verification failure
  it("Scenario 6: Verification failure triggers human review", async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      rootCauseSummary: "Public bucket",
      failureMechanism: "Fix it",
      likelySubsystem: "S3",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "generate_fix",
      confidence: 0.90,
      evidence: []
    }));

    const input = loadFixture("s3-public.input.json");
    // Leave state broken to simulate failed fix
    input.resource_state.config.PublicAccessBlockConfiguration = {
      BlockPublicAcls: false,
      BlockPublicPolicy: false
    };

    const report = await runAgent(input);
    
    expect(report.verification.resolved).toBe(false);
    expect(report.requires_human_review).toBe(true);
  });

  // 7. Both providers fail
  it("Scenario 7: Both LLM providers fail resolves safely", async () => {
    mockCallLLM.mockRejectedValueOnce(new Error("Network Error")); // Simulating failure inside llmCaller
    
    const input = loadFixture("s3-public.input.json");
    const report = await runAgent(input);
    
    expect(report.decision_path).toBe("alert_only");
    // Handled by top level catch
    expect(report.raw_output.failureMechanism).toContain("Agent execution failed");
  });

  // 8. UNKNOWN event
  it("Scenario 8: UNKNOWN event short-circuits LLM call", async () => {
    const input = loadFixture("s3-public.input.json");
    input.event = "UNKNOWN";

    const report = await runAgent(input);
    
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(report.confidence).toBe(0.30);
    expect(report.decision_path).toBe("alert_only");
  });

  // 9. Mock mode
  it("Scenario 9: Mock mode bypasses execution", async () => {
    process.env.AGENT_MOCK = "true";
    const input = loadFixture("s3-public.input.json");

    const report = await runAgent(input);
    
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(report.summary).toContain("Mock report generated");
    expect(report.generated_at).toBeDefined();
  });

  // 10. Confidence boundary 0.85
  it("Scenario 10: Confidence boundary 0.85 triggers auto_fix", async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      rootCauseSummary: "Public bucket",
      failureMechanism: "Fix it",
      likelySubsystem: "S3",
      likelyFiles: [],
      fixStrategy: [],
      recommendedAction: "generate_fix",
      confidence: 0.85,
      evidence: []
    }));

    const input = loadFixture("s3-public.input.json");
    input.resource_state.config.PublicAccessBlockConfiguration = {
      BlockPublicAcls: true,
      BlockPublicPolicy: true
    };

    const report = await runAgent(input);
    
    expect(report.decision_path).toBe("auto_fix");
  });

  // 11. SlackPayload shape
  it("Scenario 11: SlackPayload has 6 blocks", async () => {
    process.env.AGENT_MOCK = "true";
    const input = loadFixture("s3-public.input.json");
    const report = await runAgent(input);
    
    expect(report.notification.blocks.length).toBeGreaterThanOrEqual(1); // Mocks have 1 block currently, but real logic generates 6
    
    // Testing real logic
    process.env.AGENT_MOCK = "false";
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      rootCauseSummary: "Test", failureMechanism: "R", likelySubsystem: "S3", likelyFiles: [], fixStrategy: [], recommendedAction: "generate_fix", confidence: 0.9, evidence: []
    }));
    mockCallLLM.mockResolvedValueOnce("Summary sentence 1. Summary sentence 2."); // Summary call

    const realReport = await runAgent(input);
    expect(realReport.notification.blocks.length).toBe(6);
  });

  // 12. Idempotency guard
  it("Scenario 12: Idempotency guard skips execution when status is done", async () => {
    const input = loadFixture("s3-public.input.json");
    input.incident_status = "done";

    const report = await runAgent(input);
    
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(report.skip_reason).toBe("already_resolved");
  });

});
