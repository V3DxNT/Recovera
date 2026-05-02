// Core LLM caller logic for the AI agent, with robust error handling, retry logic, and support for both Gemini (primary) and Groq (fallback) providers. It formats the input for the LLM, makes API calls with timeouts, and gracefully handles failures by switching providers or throwing detailed errors.

import { AgentInput } from "./types";
import { getPrimaryConfig, getFallbackConfig, LLMProvider } from "./provider-config";
import { LLMError } from "./errors";

const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

function formatUserMessage(input: AgentInput): string {
  return `EVENT TYPE: ${input.event}
RESOURCE: ${input.metadata.resource}
SEVERITY HINT: ${input.metadata.severity_hint || "none"}

RESOURCE STATE:
${JSON.stringify(input.resource_state, null, 2)}

LOGS:
${input.logs || "(no log data provided)"}

REPO CONTEXT:
${input.repo_context || "(none)"}`;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function callGemini(userMessage: string, systemPrompt: string): Promise<string> {
  const config = getPrimaryConfig();
  if (process.env.AGENT_MOCK === "true") return ""; // handled gracefully above
  const url = `${config.baseUrl}/${config.model}:generateContent?key=${config.apiKey}`;
  
  const payload = {
    generationConfig: { responseMimeType: "application/json" },
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }]
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, TIMEOUT_MS);

      if (!response.ok) {
        if (attempt === MAX_RETRIES) {
          throw new LLMError("api_error", "gemini", `Gemini API error: ${response.statusText}`, response.status);
        }
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        if (attempt === MAX_RETRIES) {
          throw new LLMError("api_error", "gemini", "Gemini returned empty candidates array");
        }
        continue;
      }
      return text;
    } catch (error: any) {
      if (error.name === "AbortError") {
        if (attempt === MAX_RETRIES) throw new LLMError("timeout", "gemini", "Gemini request timed out");
      } else if (attempt === MAX_RETRIES && error instanceof LLMError) {
        throw error;
      } else if (attempt === MAX_RETRIES) {
        throw new LLMError("api_error", "gemini", error.message || "Unknown error");
      }
    }
  }
  throw new LLMError("api_error", "gemini", "Exhausted retries");
}

async function callGroq(userMessage: string, systemPrompt: string): Promise<string> {
  const config = getFallbackConfig();
  if (process.env.AGENT_MOCK === "true") return "";
  const url = `${config.baseUrl}/chat/completions`;

  const payload = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    response_format: { type: "json_object" }
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(payload)
      }, TIMEOUT_MS);

      if (!response.ok) {
        if (attempt === MAX_RETRIES) {
          throw new LLMError("api_error", "groq", `Groq API error: ${response.statusText}`, response.status);
        }
        continue;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      
      if (!text) {
        if (attempt === MAX_RETRIES) {
          throw new LLMError("api_error", "groq", "Groq returned empty choices array");
        }
        continue;
      }
      return text;
    } catch (error: any) {
      if (error.name === "AbortError") {
        if (attempt === MAX_RETRIES) throw new LLMError("timeout", "groq", "Groq request timed out");
      } else if (attempt === MAX_RETRIES && error instanceof LLMError) {
        throw error;
      } else if (attempt === MAX_RETRIES) {
        throw new LLMError("api_error", "groq", error.message || "Unknown error");
      }
    }
  }
  throw new LLMError("api_error", "groq", "Exhausted retries");
}

export async function callLLM(input: AgentInput, systemPrompt: string): Promise<string> {
  const userMessage = formatUserMessage(input);
  
  if (process.env.AGENT_MOCK === "true") {
    return JSON.stringify({
      rootCauseSummary: "Mocked root cause summary",
      failureMechanism: "Mocked failure mechanism",
      likelySubsystem: "Mocked subsystem",
      likelyFiles: [{ path: "mocked/path.ts", reason: "Mocked reason", confidence: 0.90 }],
      fixStrategy: ["Step 1", "Step 2"],
      recommendedAction: "generate_fix",
      confidence: 0.90,
      evidence: ["Mocked evidence log-123"]
    });
  }

  try {
    return await callGemini(userMessage, systemPrompt);
  } catch (geminiError) {
    try {
      return await callGroq(userMessage, systemPrompt);
    } catch (groqError) {
      console.error("Gemini Error:", geminiError);
      console.error("Groq Error:", groqError);
      throw new LLMError("both_providers_failed", "none", "Both Gemini and Groq providers failed.");
    }
  }
}
