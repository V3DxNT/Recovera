/**
 * AWS executor + verifier wiring (mocked SDK).
 */
jest.mock("@/lib/encrypt", () => ({
  decrypt: jest.fn(() => "MOCK_PLAINTEXT_KEY"),
}));

const s3Send = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: s3Send })),
  PutPublicAccessBlockCommand: jest.fn((input: Record<string, unknown>) => input),
  DeleteBucketPolicyCommand: jest.fn((input: Record<string, unknown>) => input),
  GetPublicAccessBlockCommand: jest.fn((input: Record<string, unknown>) => input),
}));

import {
  PutPublicAccessBlockCommand,
  DeleteBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import type { CloudCredential } from "@/generated/prisma/client";
import type { AgentInput, DecisionResult } from "@/Agentic-AI/agent/types";
import { executeAwsAction } from "@/lib/aws/actions/executor";
import { fetchResourceState } from "@/lib/aws/actions/fetchState";
import { verify } from "@/Agentic-AI/verification/verifier";

const fakeCred = {
  id: "cred_test",
  userId: "user_test",
  provider: "aws",
  label: "test",
  accessKeyId: "iv:cipher",
  secretAccessKey: "iv:cipher",
  region: "us-east-1",
  roleArn: null,
  sessionToken: null,
  isActive: true,
  lastVerifiedAT: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as CloudCredential;

const autoFixDecision: DecisionResult = {
  path: "auto_fix",
  action: "generate_fix",
  reason: "high_confidence_safe_action",
  confidence: 0.9,
  safety_class: "safe",
};

describe("executeAwsAction (S3)", () => {
  beforeEach(() => {
    s3Send.mockReset();
    jest.clearAllMocks();
  });

  it("issues PutPublicAccessBlock with all four flags true and attempts DeleteBucketPolicy", async () => {
    s3Send.mockResolvedValue({});

    const input: AgentInput = {
      event: "S3_PUBLIC",
      logs: "s3 public access",
      resource_state: { type: "s3", config: {} },
      metadata: { resource: "my-test-bucket", region: "us-east-1" },
      incident_id: "inc_1",
      incident_status: "pending",
    };

    const result = await executeAwsAction(
      input,
      autoFixDecision,
      fakeCred,
    );

    expect(result.ok).toBe(true);
    expect(PutPublicAccessBlockCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "my-test-bucket",
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
    expect(DeleteBucketPolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: "my-test-bucket" }),
    );
  });
});

describe("fetchResourceState + verify (S3)", () => {
  beforeEach(() => {
    s3Send.mockReset();
  });

  it("returns resolved when public access block is fully enabled", async () => {
    s3Send.mockResolvedValueOnce({
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    });

    const input: AgentInput = {
      event: "S3_PUBLIC",
      logs: "",
      resource_state: { type: "s3", config: {} },
      metadata: { resource: "secure-bucket", region: "us-east-1" },
      incident_id: "inc_2",
      incident_status: "pending",
    };

    const state = await fetchResourceState(input, fakeCred);
    const v = await verify({
      event: "S3_PUBLIC",
      resource: "secure-bucket",
      post_fix_state: state,
      delay_ms: 0,
    });

    expect(v.status).toBe("resolved");
    expect(v.resolved).toBe(true);
  });
});
