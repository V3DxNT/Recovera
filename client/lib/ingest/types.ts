export type ParseStatus = "ok" | "partial" | "failed";

export interface FirehoseInputRecord {
  recordId?: string;
  data: string;
}

export interface FirehoseBatchInput {
  requestId?: string;
  timestamp?: number;
  records: FirehoseInputRecord[];
}

export interface NormalizedLogEvent {
  eventId: string;
  integrationId: string | null;
  provider: "aws";
  requestId: string | null;
  recordId: string | null;
  logGroupName: string | null;
  logStreamName: string | null;
  resourceId: string | null;
  resourceType: "ec2" | "ecs" | "eks" | "lambda" | "unknown";
  serviceName: string | null;
  repoFullName: string | null;
  messageRaw: string;
  messageParsed: Record<string, unknown> | null;
  timestamp: string;
  ingestedAt: string;
  parseStatus: ParseStatus;
}

export interface DeadLetterEvent {
  requestId: string | null;
  recordId: string | null;
  reason: string;
  payloadPreview: string;
  failedAt: string;
}
