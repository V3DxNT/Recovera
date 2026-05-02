import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';

// Mocked interfaces for dependencies that are built in Steps 2, 3, and 4
export interface MockIncident {
  id: string;
  title: string;
  severity: string;
  fingerprint: string;
  eventCount: number;
}

export interface MockRCA {
  rootCauseSummary: string;
  failureMechanism: string;
  likelySubsystem: string;
  fixStrategy: string[];
}

export interface MockCodeContext {
  path: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

export const fixOutputSchema = z.object({
  patchDiff: z.string().describe("A unified diff representing the exact code changes needed to fix the issue."),
  changeSummary: z.string().describe("A clear, concise summary explaining what the patch does."),
  riskScore: z.number().min(0).max(1).describe("A risk score from 0.0 (safest) to 1.0 (riskiest) estimating the likelihood of this patch breaking something else.")
});

export type FixOutput = z.infer<typeof fixOutputSchema>;

/**
 * Generates a fix patch for an incident using Gemini as primary, falling back to Groq.
 */
export async function generateFix(
  incident: MockIncident,
  rca: MockRCA,
  context: MockCodeContext[]
): Promise<FixOutput> {
  const systemPrompt = `You are an expert Site Reliability Engineer and software developer.
Your task is to generate a fix for a verified incident based on the provided Root Cause Analysis (RCA) and codebase context.

Constraints:
1. Provide your response exactly in the JSON format requested.
2. The \`patchDiff\` must be a valid, standard unified diff that can be cleanly applied using \`git apply\`.
3. Do not modify more than 3 files.
4. Keep changes focused. Change no more than 120 lines total.
5. Do not modify files in blocked paths like \`prisma/migrations\`, \`.env\`, or core auth/payment logic unless explicitly instructed.
6. The fix must directly address the RCA's \`fixStrategy\`.
`;

  const userPrompt = `
Incident:
ID: ${incident.id}
Title: ${incident.title}
Severity: ${incident.severity}

Root Cause Analysis:
Summary: ${rca.rootCauseSummary}
Mechanism: ${rca.failureMechanism}
Fix Strategy:
${rca.fixStrategy.map(s => `- ${s}`).join('\n')}

Code Context (Files to consider modifying):
${context.map(c => `--- ${c.path} ---\n${c.content}\n`).join('\n')}

Please generate the fix diff, summary, and risk score.
`;

  try {
    // Try primary provider (Gemini 2.5 is state of the art)
    const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    const result = await generateObject({
      model: google(primaryModel),
      system: systemPrompt,
      prompt: userPrompt,
      schema: fixOutputSchema,
    });

    return result.object;
  } catch (error) {
    console.warn(`Primary AI provider (Gemini: ${process.env.GEMINI_MODEL}) failed. Falling back to Groq.`, error);
    
    try {
      // Fallback to Groq (Llama 3.3)
      const fallbackModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      const fallbackResult = await generateObject({
        model: groq(fallbackModel),
        system: systemPrompt,
        prompt: userPrompt,
        schema: fixOutputSchema,
        // Groq often requires specific settings for structured output
        // but @ai-sdk/groq handles most of it.
      });

      return fallbackResult.object;
    } catch (fallbackError) {
      console.error("Both primary and fallback AI providers failed.", fallbackError);
      throw new Error("Failed to generate fix patch via AI providers.");
    }
  }
}
