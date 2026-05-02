import { prisma } from "../prisma";

export interface UpsertChunkParams {
  repositoryId: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  commitSha: string;
  embedding: number[];
}

export async function upsertChunks(chunks: UpsertChunkParams[]) {
  // We need to use Prisma raw queries to insert the vector embeddings correctly.
  
  // First, delete old chunks for this repository (we can optimize this later to only delete stale paths)
  if (chunks.length > 0) {
    await prisma.codeChunk.deleteMany({
      where: {
        repositoryId: chunks[0].repositoryId
      }
    });
  }

  // Insert chunks in batches
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    // We cannot use prisma.codeChunk.createMany with Unsupported types easily in Prisma 5+,
    // so we use raw queries.
    for (const chunk of batch) {
      await prisma.$executeRaw`
        INSERT INTO "CodeChunk" ("id", "repositoryId", "path", "content", "startLine", "endLine", "commitSha", "embedding", "createdAt")
        VALUES (
          gen_random_uuid(), 
          ${chunk.repositoryId}, 
          ${chunk.path}, 
          ${chunk.content}, 
          ${chunk.startLine}, 
          ${chunk.endLine}, 
          ${chunk.commitSha}, 
          ${chunk.embedding}::vector, 
          NOW()
        )
      `;
    }
  }
}

export interface SearchResult {
  id: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  commitSha: string;
  distance: number;
}

export async function searchChunks(repositoryId: string, queryEmbedding: number[], topK: number = 20): Promise<SearchResult[]> {
  // Using Euclidean distance (<->) or Cosine distance (<=>)
  // Gemini text-embedding-004 output is normalized, so <=> (Cosine distance) is typically preferred.
  
  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT 
      "id", 
      "path", 
      "content", 
      "startLine", 
      "endLine", 
      "commitSha",
      ("embedding" <=> ${queryEmbedding}::vector) as "distance"
    FROM "CodeChunk"
    WHERE "repositoryId" = ${repositoryId}
    ORDER BY "embedding" <=> ${queryEmbedding}::vector
    LIMIT ${topK}
  `;

  return results;
}
