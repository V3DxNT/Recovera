// Core verification logic for the AI agent, 
// responsible for validating whether the proposed fix for a given event 
// has been successfully implemented. 
// It checks the resource configuration against expected criteria based on the event type 
// (e.g., S3 public access, IAM overpermission, security group open ports) 
// and returns a structured result indicating whether the issue is resolved, along with evidence and status. 
// The verifier also handles edge cases like unknown events and provides detailed feedback for pending or error states.

import { VerificationInput, VerificationResult } from "../agent/types";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function verify(input: VerificationInput): Promise<VerificationResult> {
  const delayMs = input.delay_ms ?? 3000;
  await delay(delayMs);

  const checkedAt = new Date().toISOString();

  try {
    const { config } = input.post_fix_state;

    if (!config || Object.keys(config).length === 0) {
      return {
        resolved: null,
        evidence: "Empty resource configuration provided for verification.",
        checked_at: checkedAt,
        status: "pending"
      };
    }

    if (input.event === "UNKNOWN") {
      return {
        resolved: null,
        evidence: "UNKNOWN event cannot be verified automatically.",
        checked_at: checkedAt,
        status: "pending"
      };
    }

    if (input.event === "S3_PUBLIC") {
      const pubBlock = config.PublicAccessBlockConfiguration as Record<string, boolean> | undefined;
      
      const blockPublicAcls = pubBlock?.BlockPublicAcls === true;
      const blockPublicPolicy = pubBlock?.BlockPublicPolicy === true;
      
      if (blockPublicAcls && blockPublicPolicy) {
        return {
          resolved: true,
          evidence: "BlockPublicAcls and BlockPublicPolicy are both enabled.",
          checked_at: checkedAt,
          status: "resolved"
        };
      } else {
        return {
          resolved: false,
          evidence: "Public Access Block is not fully enabled.",
          checked_at: checkedAt,
          status: "unresolved"
        };
      }
    }

    if (input.event === "IAM_OVERPERMISSION") {
      const policyDocStr = config.PolicyDocument as string | undefined;
      if (!policyDocStr) {
        return {
          resolved: false,
          evidence: "No PolicyDocument found in config.",
          checked_at: checkedAt,
          status: "unresolved"
        };
      }

      try {
        const policyDoc = typeof policyDocStr === "string" ? JSON.parse(policyDocStr) : policyDocStr;
        const statements = Array.isArray(policyDoc.Statement) ? policyDoc.Statement : [policyDoc.Statement];
        
        const hasWildcardAllow = statements.some((s: any) => s.Effect === "Allow" && (s.Action === "*" || (Array.isArray(s.Action) && s.Action.includes("*"))));
        
        if (hasWildcardAllow) {
          return {
            resolved: false,
            evidence: "Policy still contains an Allow statement with a wildcard Action.",
            checked_at: checkedAt,
            status: "unresolved"
          };
        } else {
          return {
            resolved: true,
            evidence: "No wildcard Allow statements found in the policy.",
            checked_at: checkedAt,
            status: "resolved"
          };
        }
      } catch (e) {
        return {
          resolved: null,
          evidence: "Failed to parse PolicyDocument.",
          checked_at: checkedAt,
          status: "error"
        };
      }
    }

    if (input.event === "SG_OPEN_PORT") {
      const rules = config.IpPermissions as Array<any> | undefined;
      if (!rules) {
        return {
          resolved: false,
          evidence: "No IpPermissions found in config.",
          checked_at: checkedAt,
          status: "unresolved"
        };
      }

      const hasOpenCidr = rules.some((rule: any) => {
        const ranges = rule.IpRanges || [];
        return ranges.some((r: any) => r.CidrIp === "0.0.0.0/0");
      });

      if (hasOpenCidr) {
        return {
          resolved: false,
          evidence: "Security group still has a rule allowing 0.0.0.0/0.",
          checked_at: checkedAt,
          status: "unresolved"
        };
      } else {
        return {
          resolved: true,
          evidence: "No rules found allowing 0.0.0.0/0.",
          checked_at: checkedAt,
          status: "resolved"
        };
      }
    }

    return {
      resolved: null,
      evidence: `No specific verification logic implemented for event type: ${input.event}`,
      checked_at: checkedAt,
      status: "pending"
    };

  } catch (error: any) {
    return {
      resolved: null,
      evidence: `Verification error: ${error.message || "Unknown error"}`,
      checked_at: checkedAt,
      status: "error"
    };
  }
}
