/**
 * Parse resource identifiers from AgentInput.metadata.resource (plain id or ARN).
 */

export function parseS3BucketName(resource: string): string | null {
  if (!resource || resource === "unknown_resource") return null;
  const arnMatch = resource.match(/^arn:aws:s3:::([^/]+)$/i);
  if (arnMatch) return arnMatch[1];
  // Bucket names are 3–63 chars; allow common patterns without strict validation
  const trimmed = resource.trim();
  if (trimmed.length >= 3 && trimmed.length <= 63 && !trimmed.includes("/"))
    return trimmed;
  return null;
}

export function parseSecurityGroupId(resource: string): string | null {
  if (!resource || resource === "unknown_resource") return null;
  const arnMatch = resource.match(
    /arn:aws:ec2:[a-z0-9-]+:\d+:security-group\/(sg-[a-f0-9]+)/i,
  );
  if (arnMatch) return arnMatch[1];
  if (/^sg-[a-f0-9]{8,17}$/i.test(resource.trim())) return resource.trim();
  return null;
}

export function parseIamRoleName(resource: string): string | null {
  if (!resource || resource === "unknown_resource") return null;
  const trimmed = resource.trim();
  const arnMatch = trimmed.match(
    /arn:aws:iam::\d+:role\/([\w+=,.@-]+)/i,
  );
  if (arnMatch) return decodeURIComponent(arnMatch[1].replace(/\+/g, " "));
  if (!trimmed.includes("/") && trimmed.length > 0) return trimmed;
  return null;
}
