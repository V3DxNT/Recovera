import {
  GetRolePolicyCommand,
  IAMClient,
  ListRolePoliciesCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { CloudCredential } from "../../../generated/prisma/client";
import { parseProvisioningError } from "../../awsErrors";
import { getAwsSdkCredentials } from "./credentials";
import { parseIamRoleName } from "./resourceIds";

function statementHasWildcardAllow(stmt: unknown): boolean {
  if (!stmt || typeof stmt !== "object") return false;
  const s = stmt as {
    Effect?: string;
    Action?: string | string[];
  };
  if (s.Effect !== "Allow") return false;
  if (s.Action === "*") return true;
  if (Array.isArray(s.Action) && s.Action.includes("*")) return true;
  return false;
}

function normalizeStatements(policy: {
  Statement?: unknown;
}): unknown[] {
  const st = policy.Statement;
  if (!st) return [];
  return Array.isArray(st) ? st : [st];
}

function stripWildcardAllowStatements(policy: {
  Version?: string;
  Statement?: unknown;
}): { doc: Record<string, unknown>; removed: boolean } {
  const statements = normalizeStatements(policy);
  const filtered = statements.filter((s) => !statementHasWildcardAllow(s));
  const removed = filtered.length !== statements.length;

  let Statement: unknown =
    filtered.length === 0 ? [] : filtered.length === 1 ? filtered[0] : filtered;

  return {
    doc: {
      Version: policy.Version || "2012-10-17",
      Statement,
    },
    removed,
  };
}

export async function fixIamWildcardAllows(
  resource: string,
  credential: CloudCredential,
): Promise<{ ok: boolean; message: string }> {
  const roleName = parseIamRoleName(resource);
  if (!roleName) {
    return {
      ok: false,
      message: "Could not determine IAM role name from resource identifier.",
    };
  }

  const client = new IAMClient({
    credentials: getAwsSdkCredentials(credential),
  });

  try {
    const listed = await client.send(
      new ListRolePoliciesCommand({ RoleName: roleName }),
    );
    const names = listed.PolicyNames ?? [];
    if (names.length === 0) {
      return {
        ok: true,
        message: `Role "${roleName}" has no inline policies.`,
      };
    }

    let updated = 0;
    const errors: string[] = [];

    for (const policyName of names) {
      const gp = await client.send(
        new GetRolePolicyCommand({
          RoleName: roleName,
          PolicyName: policyName,
        }),
      );

      const encoded = gp.PolicyDocument ?? "{}";
      let parsed: { Version?: string; Statement?: unknown };
      try {
        parsed = JSON.parse(decodeURIComponent(encoded)) as typeof parsed;
      } catch {
        errors.push(`${policyName}: invalid policy JSON`);
        continue;
      }

      const { doc, removed } = stripWildcardAllowStatements(parsed);
      if (!removed) continue;

      const stmts = normalizeStatements(doc);
      if (stmts.length === 0) {
        errors.push(
          `${policyName}: removing wildcard Allows would leave an empty policy; requires manual review.`,
        );
        continue;
      }

      await client.send(
        new PutRolePolicyCommand({
          RoleName: roleName,
          PolicyName: policyName,
          PolicyDocument: JSON.stringify(doc),
        }),
      );
      updated++;
    }

    if (errors.length > 0 && updated === 0) {
      return {
        ok: false,
        message: errors.join(" "),
      };
    }

    return {
      ok: true,
      message:
        updated > 0
          ? `Updated ${updated} inline policy/policies on role "${roleName}". ${errors.join(" ")}`.trim()
          : `No wildcard Allow Action("*") statements found on inline policies for "${roleName}".`,
    };
  } catch (error: unknown) {
    const raw =
      error instanceof Error ? error.message : "Unknown IAM error";
    return {
      ok: false,
      message: parseProvisioningError(raw),
    };
  }
}
