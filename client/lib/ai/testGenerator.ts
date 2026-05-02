import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { z } from 'zod';
import { MockIncident, MockRCA, MockCodeContext } from './fixGenerator';

export const testOutputSchema = z.object({
  testFileContent: z.string().describe("The exact content of the unit/integration test file to verify the fix."),
  testFilePath: z.string().describe("The suggested relative path where this test file should be written (e.g., 'tests/bug-123.test.ts')."),
  explanation: z.string().describe("A brief explanation of how this test reproduces the incident and verifies the fix.")
});

export type TestOutput = z.infer<typeof testOutputSchema>;

/**
 * Generates a regression test for a generated patch.
 */
export async function generateRegressionTest(
  incident: MockIncident,
  rca: MockRCA,
  context: MockCodeContext[],
  patchDiff: string
): Promise<TestOutput> {
  const systemPrompt = `You are an expert Software Engineer in Test (SDET).
Your task is to generate a regression test that fails without the provided patch, and passes with the patch applied.
You should write the test using a standard testing framework (like Jest, Vitest, or Node's native test runner) appropriate for the code provided.

Constraints:
1. Provide the entire test file content, ready to be saved and executed.
2. Provide a suggested file path for the test.
3. Keep the test focused specifically on the root cause and the failure mechanism provided in the RCA.
4. Provide response exactly in the JSON format requested.
`;

  const userPrompt = `
Incident ID: ${incident.id}
Failure Mechanism: ${rca.failureMechanism}

Code Context:
${context.map(c => `--- ${c.path} ---\n${c.content}\n`).join('\n')}

The patch proposed to fix this is:
${patchDiff}

Please generate the regression test.
`;

  try {
    const result = await generateObject({
      model: google('gemini-2.5-pro'),
      system: systemPrompt,
      prompt: userPrompt,
      schema: testOutputSchema,
    });

    return result.object;
  } catch (error) {
    console.warn("Primary AI provider (Gemini) failed. Falling back to Grok.", error);
    try {
      const fallbackResult = await generateObject({
        model: xai('grok-2-latest'),
        system: systemPrompt,
        prompt: userPrompt,
        schema: testOutputSchema,
      });
      return fallbackResult.object;
    } catch (fallbackError) {
      console.error("Both primary and fallback AI providers failed.", fallbackError);
      throw new Error("Failed to generate regression test via AI providers.");
    }
  }
}
