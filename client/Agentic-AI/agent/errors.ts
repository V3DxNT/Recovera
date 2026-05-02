// Defines custom error classes for the AI agent, including LLMError for language model issues, AgentError for general agent errors, and VerificationError for verification failures. Each error class includes relevant details to aid in debugging and handling failures gracefully.

import { LLMProvider } from "./provider-config";

export class LLMError extends Error {
  kind = "LLMError" as const;
  reason: "timeout" | "api_error" | "both_providers_failed";
  provider: LLMProvider | "none";
  statusCode?: number;

  constructor(
    reason: "timeout" | "api_error" | "both_providers_failed",
    provider: LLMProvider | "none",
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.reason = reason;
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

export class AgentError extends Error {
  kind: string = "AgentError";
}

export class VerificationError extends AgentError {
  kind = "VerificationError";
}
