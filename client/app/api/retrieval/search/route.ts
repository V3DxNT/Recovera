import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding } from "../../../../lib/retrieval/embeddings";
import { searchChunks } from "../../../../lib/retrieval/vectorStore";
import { rerankChunks } from "../../../../lib/retrieval/reranker";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repositoryId, incidentContext, topK = 20, rerankTopK = 5 } = body;

    if (!repositoryId || !incidentContext) {
      return NextResponse.json({ error: "Missing repositoryId or incidentContext" }, { status: 400 });
    }

    // Verify repository exists
    const repo = await prisma.repository.findUnique({
      where: { id: repositoryId }
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // 1. Generate query embedding for the incident context
    const queryEmbedding = await generateEmbedding(incidentContext);

    // 2. Perform vector similarity search
    const vectorResults = await searchChunks(repositoryId, queryEmbedding, topK);

    if (vectorResults.length === 0) {
      return NextResponse.json({ chunks: [] });
    }

    // 3. Rerank the top results using LLM
    const rerankedResults = await rerankChunks(incidentContext, vectorResults, rerankTopK);

    return NextResponse.json({ chunks: rerankedResults });
  } catch (error: unknown) {
    console.error("Retrieval Search Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
