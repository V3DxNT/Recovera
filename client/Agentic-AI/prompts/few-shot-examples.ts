// Provides few-shot examples for the AI agent to learn from, demonstrating both a positive case (S3_PUBLIC) and a negative case (UNKNOWN) with detailed reasoning and evidence.

export const POSITIVE_S3_PUBLIC = `
User:
EVENT TYPE: S3_PUBLIC
RESOURCE: my-corp-customer-data
SEVERITY HINT: high

RESOURCE STATE:
{
  "type": "s3",
  "config": {
    "BucketName": "my-corp-customer-data",
    "PublicAccessBlockConfiguration": {
      "BlockPublicAcls": false,
      "IgnorePublicAcls": false,
      "BlockPublicPolicy": false,
      "RestrictPublicBuckets": false
    },
    "Policy": "{\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::my-corp-customer-data/*\"}]}"
  }
}

LOGS:
CloudTrail event PutBucketPolicy at 10:45 AM user: dev-intern

REPO CONTEXT:
(none)

AgentOutput:
{
  "root_cause": "Bucket has public read access via a wildcard policy statement and Public Access Block is disabled.",
  "confidence": 0.90,
  "action": "fix_s3_public_access",
  "reasoning": "The bucket policy explicitly allows Principal '*' to perform s3:GetObject. The Public Access Block configuration is entirely disabled, allowing this policy to take effect. CloudTrail shows this was recently modified.",
  "requires_approval": false,
  "evidence": [
    "PublicAccessBlockConfiguration has BlockPublicPolicy set to false",
    "Policy allows Principal '*' with Action 's3:GetObject'",
    "CloudTrail event PutBucketPolicy at 10:45 AM"
  ]
}`;

export const NEGATIVE_UNKNOWN = `
User:
EVENT TYPE: UNKNOWN
RESOURCE: unknown-resource-123
SEVERITY HINT: none

RESOURCE STATE:
{
  "type": "unknown",
  "config": {}
}

LOGS:
(no log data provided)

REPO CONTEXT:
(none)

AgentOutput:
{
  "root_cause": "Event type unknown. Manual review required.",
  "confidence": 0.30,
  "action": "alert_only",
  "reasoning": "The event type is unrecognized and no resource state or logs are available to diagnose the issue.",
  "requires_approval": true,
  "evidence": []
}`;

export function getFewShotExamples(): string {
  return `[EXAMPLES]\\n${POSITIVE_S3_PUBLIC}\\n\\n${NEGATIVE_UNKNOWN}`;
}
