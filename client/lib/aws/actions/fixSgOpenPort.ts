import {
  DescribeSecurityGroupsCommand,
  EC2Client,
  RevokeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";
import { CloudCredential } from "../../../generated/prisma/client";
import { parseProvisioningError } from "../../awsErrors";
import { getAwsRegion, getAwsSdkCredentials } from "./credentials";
import { parseSecurityGroupId } from "./resourceIds";

function ruleAllowsOpenInternet(rule: {
  IpRanges?: Array<{ CidrIp?: string }>;
  Ipv6Ranges?: Array<{ CidrIpv6?: string }>;
}): boolean {
  const ipv4 = rule.IpRanges?.some((r) => r.CidrIp === "0.0.0.0/0");
  const ipv6 = rule.Ipv6Ranges?.some((r) => r.CidrIpv6 === "::/0");
  return Boolean(ipv4 || ipv6);
}

export async function fixSecurityGroupOpenInternet(
  resource: string,
  credential: CloudCredential,
): Promise<{ ok: boolean; message: string }> {
  const groupId = parseSecurityGroupId(resource);
  if (!groupId) {
    return {
      ok: false,
      message: "Could not determine security group id from resource identifier.",
    };
  }

  const region = getAwsRegion(credential);
  const client = new EC2Client({
    region,
    credentials: getAwsSdkCredentials(credential),
  });

  try {
    const described = await client.send(
      new DescribeSecurityGroupsCommand({
        GroupIds: [groupId],
      }),
    );

    const sg = described.SecurityGroups?.[0];
    if (!sg) {
      return { ok: false, message: `Security group ${groupId} not found.` };
    }

    const toRevoke =
      sg.IpPermissions?.filter(ruleAllowsOpenInternet) ?? [];

    if (toRevoke.length === 0) {
      return {
        ok: true,
        message: `Security group ${groupId} has no ingress rules allowing 0.0.0.0/0 or ::/0.`,
      };
    }

    await client.send(
      new RevokeSecurityGroupIngressCommand({
        GroupId: groupId,
        IpPermissions: toRevoke,
      }),
    );

    return {
      ok: true,
      message: `Revoked ${toRevoke.length} open ingress rule(s) from ${groupId}.`,
    };
  } catch (error: unknown) {
    const raw =
      error instanceof Error ? error.message : "Unknown EC2 error";
    return {
      ok: false,
      message: parseProvisioningError(raw),
    };
  }
}
