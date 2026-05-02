import { callLLM } from "../../Agentic-AI/agent/llm-caller";
import { SearchResult } from "./vectorStore";

export interface RerankedChunk extends SearchResult {
  relevanceScore: number;
  reasoning: string;
}

export async function rerankChunks(
  incidentContext: string,
  chunks: SearchResult[],
  topK: number = 5
): Promise<RerankedChunk[]> {
  if (chunks.length === 0) return [];

  const systemPrompt = `You are an expert root cause analyzer. 
Your task is to evaluate a set of retrieved code chunks and score their relevance to a specific incident.
You must return a JSON array of objects, where each object has:
- "id": the id of the chunk
- "relevanceScore": a float between 0 and 1, where 1 means it definitely contains the root cause or highly relevant context.
- "reasoning": a brief explanation of why it is relevant or not.

Strictly output valid JSON.`;

  const chunksContext = chunks.map(c => `[CHUNK ID: ${c.id}]
PATH: ${c.path}:${c.startLine}-${c.endLine}
CONTENT:
${c.content}
`).join("\n---\n");

  const userMessage = `INCIDENT CONTEXT:
${incidentContext}

RETRIEVED CHUNKS:
${chunksContext}`;

  try {
    // callLLM expects an AgentInput, but we can craft a mock one that just passes the strings we need
    // if the existing callLLM requires strict schema, we should adapt.
    // Let's look at callLLM signature: callLLM(input: AgentInput, systemPrompt: string)
    // formatUserMessage inside callLLM uses input.event, input.metadata.resource, input.logs, input.repo_context.
    // So we can pack our context into those fields.
    const input: any = {
      event: "UNKNOWN",
      metadata: { resource: "Codebase Retrieval" },
      resource_state: { type: "code", config: {} },
      logs: incidentContext,
      repo_context: chunksContext,
      incident_id: "rerank-" + Date.now(),
      incident_status: "running"
    };

    const responseText = await callLLM(input, systemPrompt);
    
    // Parse the JSON
    // The model might wrap it in markdown code blocks like \`\`\`json ... \`\`\`
    const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const scores = JSON.parse(cleanText);

    if (!Array.isArray(scores)) {
      throw new Error("Reranker response is not an array");
    }

    const rerankedChunks: RerankedChunk[] = chunks.map(chunk => {
      const scoreObj = scores.find((s: any) => s.id === chunk.id);
      return {
        ...chunk,
        relevanceScore: scoreObj ? scoreObj.relevanceScore : 0,
        reasoning: scoreObj ? scoreObj.reasoning : "No score provided by reranker."
      };
    });

    // Sort by relevanceScore descending and take topK
    rerankedChunks.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return rerankedChunks.slice(0, topK);

  } catch (error) {
    console.error("Reranking failed:", error);
    // Fallback: return original chunks sorted by vector distance
    return chunks.slice(0, topK).map(c => ({
      ...c,
      relevanceScore: 1 - c.distance, // rough heuristic
      reasoning: "Fallback: used raw vector distance."
    }));
  }
}
