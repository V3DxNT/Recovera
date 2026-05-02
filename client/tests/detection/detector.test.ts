import { processNormalizedEvent, detectEventType } from "../../lib/detection/detector";
import { runAgent } from "../../Agentic-AI/agent";
// Mock runAgent
jest.mock("../../Agentic-AI/agent", () => ({
  runAgent: jest.fn(async (input: any) => {
    return {
      incident_id: input.incident_id,
      summary: "Mock report",
      rootCauseSummary: "Mocked cause",
      recommendedAction: "alert_only",
      failureMechanism: "Crash",
      likelyFiles: [],
      likelySubsystem: "Unknown",
      verification: {
        resolved: false,
        evidence: "none",
        checked_at: new Date().toISOString(),
        status: "pending"
      },
      confidence: 0.9,
      risk_score: 0.5,
      requires_human_review: false,
      notification: { text: "Mock", blocks: [] },
      raw_output: {
        rootCauseSummary: "Mocked cause",
        confidence: 0.9,
        recommendedAction: "alert_only",
        failureMechanism: "Crash",
        likelyFiles: [],
        likelySubsystem: "Unknown"
      },
      generated_at: new Date().toISOString()
    };
  })
}));

// Mock Prisma
jest.mock("../../lib/prisma", () => {
  const mockFindUnique = jest.fn();
  const mockIncidentUpsert = jest.fn();
  const mockEventUpsert = jest.fn();
  const mockEventUpdate = jest.fn();
  const mockAuditUpsert = jest.fn();
  const mockRepoFindFirst = jest.fn();
  const mockRepoCreate = jest.fn();
  const mockUserFindFirst = jest.fn();
  const mockIncidentUpdate = jest.fn();
  const mockTransaction = jest.fn(async (cb) => cb({
    incidentEvent: { update: mockEventUpdate },
    detectionAudit: { upsert: mockAuditUpsert },
    incident: { update: mockIncidentUpdate }
  }));

  return {
    prisma: {
      incidentEvent: {
        findUnique: mockFindUnique,
        upsert: mockEventUpsert,
        update: mockEventUpdate
      },
      incident: {
        upsert: mockIncidentUpsert,
        update: mockIncidentUpdate
      },
      repository: {
        findFirst: mockRepoFindFirst,
        create: mockRepoCreate
      },
      user: {
        findFirst: mockUserFindFirst,
        create: jest.fn()
      },
      $transaction: mockTransaction
    },
    __mocks__: {
      mockFindUnique,
      mockIncidentUpsert,
      mockEventUpsert,
      mockRepoFindFirst,
      mockTransaction,
      mockEventUpdate,
      mockAuditUpsert
    }
  };
});

const { __mocks__ } = require("../../lib/prisma");
const { mockFindUnique, mockIncidentUpsert, mockEventUpsert, mockRepoFindFirst, mockTransaction, mockAuditUpsert, mockEventUpdate } = __mocks__;


describe("Detector & Brain Bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("processNormalizedEvent - new event triggers Incident upsert and runAgent", async () => {
    const log = {
      eventId: "evt_1",
      integrationId: "int_1",
      provider: "aws" as const,
      requestId: null,
      recordId: null,
      logGroupName: "/aws/lambda/test",
      logStreamName: null,
      resourceId: null,
      resourceType: "lambda" as const,
      serviceName: null,
      repoFullName: "test/repo",
      messageRaw: "Error: S3 Access Denied",
      messageParsed: {},
      timestamp: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      parseStatus: "ok" as const
    };

    mockFindUnique.mockResolvedValue(null);
    mockRepoFindFirst.mockResolvedValue({ id: "mock_repo_1", fullName: "test/repo" });
    mockIncidentUpsert.mockResolvedValue({ id: "inc_123", status: "open" });
    mockEventUpsert.mockResolvedValue({ id: "ev_123", processingStatus: "pending" });

    await processNormalizedEvent(log as any);

    // Verify idempotency check
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    
    // Verify incident upsert
    expect(mockIncidentUpsert).toHaveBeenCalledTimes(1);
    expect(mockEventUpsert).toHaveBeenCalledTimes(1);
    
    // Verify runAgent invocation
    expect(runAgent).toHaveBeenCalledTimes(1);
    
    const agentInput = (runAgent as jest.Mock).mock.calls[0][0];
    expect(agentInput.event).toBe("S3_PUBLIC");
    expect(agentInput.incident_id).toBe("inc_123");
    
    // Verify transaction ran and Audit was upserted
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditUpsert).toHaveBeenCalledTimes(1);
    expect(mockEventUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { processingStatus: "processed" } }));
  });

  test("processNormalizedEvent - duplicate event skips processing", async () => {
    const log = {
      eventId: "evt_2",
      integrationId: null,
      provider: "aws" as const,
      requestId: null,
      recordId: null,
      logGroupName: null,
      logStreamName: null,
      resourceId: null,
      resourceType: "unknown" as const,
      serviceName: null,
      repoFullName: null,
      messageRaw: "Duplicate error",
      messageParsed: null,
      timestamp: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      parseStatus: "ok" as const
    };

    // Mock existing event
    mockFindUnique.mockResolvedValue({ id: "existing", processingStatus: "processed" });

    await processNormalizedEvent(log as any);

    // Verify it checked the db
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    
    // Verify it skipped upsert and runAgent
    expect(mockIncidentUpsert).toHaveBeenCalledTimes(0);
    expect(runAgent).toHaveBeenCalledTimes(0);
  });
  
  test("processNormalizedEvent - failed event retries processing", async () => {
    const log = {
      eventId: "evt_3",
      resourceType: "lambda" as const,
      messageRaw: "Error",
    };
    mockFindUnique.mockResolvedValue({ id: "existing", processingStatus: "failed" });
    mockRepoFindFirst.mockResolvedValue({ id: "mock_repo_1", fullName: "test/repo" });
    mockIncidentUpsert.mockResolvedValue({ id: "inc_123", status: "open" });
    mockEventUpsert.mockResolvedValue({ id: "ev_123", processingStatus: "pending" });

    await processNormalizedEvent(log as any);

    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockIncidentUpsert).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
