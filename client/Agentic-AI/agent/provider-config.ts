// Adds LLM provider config for Gemini as primary and Groq as fallback, with env-based validation.

export type LLMProvider = "gemini" | "groq";

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function getPrimaryConfig(): ProviderConfig {
  const isMock = process.env.AGENT_MOCK === "true";
  const apiKey = process.env.GEMINI_API_KEY || "";
  
  if (!apiKey && !isMock) {
    throw new Error("GEMINI_API_KEY environment variable is required when AGENT_MOCK is not true");
  }

  return {
    provider: "gemini",
    apiKey,
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  };
}

export function getFallbackConfig(): ProviderConfig {
  const isMock = process.env.AGENT_MOCK === "true";
  const apiKey = process.env.GROQ_API_KEY || "";
  
  if (!apiKey && !isMock) {
    throw new Error("GROQ_API_KEY environment variable is required when AGENT_MOCK is not true");
  }

  return {
    provider: "groq",
    apiKey,
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    baseUrl: "https://api.groq.com/openai/v1",
  };
}

export function getActiveProvider(): LLMProvider {
  try {
    getPrimaryConfig();
    return "gemini";
  } catch {
    return "groq";
  }
}
