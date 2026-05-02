import type {
  AgentInput,
  DecisionResult,
  ResourceSnapshot,
} from "@/Agentic-AI/agent/types";
import { CloudCredential } from "../../../generated/prisma/client";
import { parseProvisioningError } from "../../awsErrors";
import { fetchResourceState } from "./fetchState";
import { fixIamWildcardAllows } from "./fixIamOverpermission";
import { fixS3PublicAccess } from "./fixS3Public";
import { fixSecurityGroupOpenInternet } from "./fixSgOpenPort";

export async function executeAwsAction(
  input: AgentInput,
  decision: DecisionResult,
  credential: CloudCredential,
): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }> {
  if (decision.path !== "auto_fix") {
    return {
      ok: false,
      message: "AWS executor only runs when decision path is auto_fix.",
    };
  }

  const resource = input.metadata.resource;

  try {
    switch (input.event) {
      case "S3_PUBLIC":
        return await fixS3PublicAccess(resource, credential);
      case "SG_OPEN_PORT":
        return await fixSecurityGroupOpenInternet(resource, credential);
      case "IAM_OVERPERMISSION":
        return await fixIamWildcardAllows(resource, credential);
      case "UNKNOWN":
        return {
          ok: false,
          message: "Cannot execute AWS fix for UNKNOWN event type.",
        };
      default:
        return {
          ok: false,
          message: `No AWS executor mapping for event: ${input.event}`,
        };
    }
  } catch (error: unknown) {
    const raw =
      error instanceof Error ? error.message : "Unexpected executor error";
    return { ok: false, message: parseProvisioningError(raw) };
  }
}

export type AwsAgentRuntime = {
  executeAction?: (
    input: AgentInput,
    decision: DecisionResult,
  ) => Promise<{
    ok: boolean;
    message: string;
    postFixState: ResourceSnapshot;
  }>;
};

/**
 * Runs executeAwsAction then refetches live state for verification.
 */
export function createAwsAgentRuntime(
  credential: CloudCredential,
): AwsAgentRuntime {
  return {
    executeAction: async (input, decision) => {
      const result = await executeAwsAction(input, decision, credential);
      const postFixState = await fetchResourceState(input, credential);
      return {
        ok: result.ok,
        message: result.message,
        postFixState,
      };
    },
  };
}
