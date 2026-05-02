import {
  DescribeSecurityGroupsCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import {
  GetRolePolicyCommand,
  IAMClient,
  ListRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import { GetPublicAccessBlockCommand, S3Client } from "@aws-sdk/client-s3";
import type { AgentInput, ResourceSnapshot } from "@/Agentic-AI/agent/types";
import { CloudCredential } from "../../../generated/prisma/client";
import { getAwsRegion, getAwsSdkCredentials } from "./credentials";
import {
  parseIamRoleName,
  parseS3BucketName,
  parseSecurityGroupId,
} from "./resourceIds";

export async function fetchResourceState(
  input: AgentInput,
  credential: CloudCredential,
): Promise<ResourceSnapshot> {
  const region = input.metadata.region || getAwsRegion(credential);

  try {
    switch (input.event) {
      case "S3_PUBLIC": {
        const bucket = parseS3BucketName(input.metadata.resource);
        if (!bucket) {
          return { type: "s3", config: {} };
        }
        const client = new S3Client({
          region,
          credentials: getAwsSdkCredentials(credential),
        });
        try {
          const out = await client.send(
            new GetPublicAccessBlockCommand({ Bucket: bucket }),
          );
          const pub = out.PublicAccessBlockConfiguration;
          return {
            type: "s3",
            config: {
              PublicAccessBlockConfiguration: {
                BlockPublicAcls: pub?.BlockPublicAcls === true,
                IgnorePublicAcls: pub?.IgnorePublicAcls === true,
                BlockPublicPolicy: pub?.BlockPublicPolicy === true,
                RestrictPublicBuckets: pub?.RestrictPublicBuckets === true,
              },
            },
          };
        } catch (e: unknown) {
          const name = (e as { name?: string }).name;
          if (
            name === "NoSuchPublicAccessBlockConfiguration" ||
            /NoSuchPublicAccessBlockConfiguration/i.test(
              e instanceof Error ? e.message : "",
            )
          ) {
            return { type: "s3", config: {} };
          }
          throw e;
        }
      }
      case "SG_OPEN_PORT": {
        const groupId = parseSecurityGroupId(input.metadata.resource);
        if (!groupId) {
          return { type: "security_group", config: {} };
        }
        const client = new EC2Client({
          region,
          credentials: getAwsSdkCredentials(credential),
        });
        const described = await client.send(
          new DescribeSecurityGroupsCommand({ GroupIds: [groupId] }),
        );
        const sg = described.SecurityGroups?.[0];
        return {
          type: "security_group",
          config: {
            IpPermissions: sg?.IpPermissions ?? [],
          },
        };
      }
      case "IAM_OVERPERMISSION": {
        const roleName = parseIamRoleName(input.metadata.resource);
        if (!roleName) {
          return { type: "iam", config: {} };
        }
        const client = new IAMClient({
          credentials: getAwsSdkCredentials(credential),
        });
        const listed = await client.send(
          new ListRolePoliciesCommand({ RoleName: roleName }),
        );
        const names = listed.PolicyNames ?? [];
        if (names.length === 0) {
          return { type: "iam", config: {} };
        }

        const allStatements: unknown[] = [];
        for (const policyName of names) {
          const gp = await client.send(
            new GetRolePolicyCommand({
              RoleName: roleName,
              PolicyName: policyName,
            }),
          );
          const encoded = gp.PolicyDocument ?? "{}";
          try {
            const doc = JSON.parse(decodeURIComponent(encoded)) as {
              Statement?: unknown;
            };
            const stmts = Array.isArray(doc.Statement)
              ? doc.Statement
              : doc.Statement
                ? [doc.Statement]
                : [];
            allStatements.push(...stmts);
          } catch {
            // skip malformed
          }
        }

        const merged = {
          Version: "2012-10-17",
          Statement:
            allStatements.length === 0
              ? []
              : allStatements.length === 1
                ? allStatements[0]
                : allStatements,
        };

        return {
          type: "iam",
          config: {
            PolicyDocument: JSON.stringify(merged),
          },
        };
      }
      default:
        return {
          type: input.resource_state.type,
          config: input.resource_state.config,
        };
    }
  } catch {
    return {
      type: input.resource_state.type,
      config: {},
    };
  }
}
