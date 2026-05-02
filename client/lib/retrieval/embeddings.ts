import { getPrimaryConfig } from "../../Agentic-AI/agent/provider-config";

export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getPrimaryConfig();
  const url = `${config.baseUrl}/text-embedding-004:embedContent?key=${config.apiKey}`;

  const payload = {
    model: "models/text-embedding-004",
    content: {
      parts: [{ text }]
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to generate embedding: ${response.statusText}`);
  }

  const data = await response.json();
  const embedding = data?.embedding?.values;

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Invalid response from embedding API");
  }

  return embedding;
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // text-embedding-004 allows up to 100 requests per batch.
  const config = getPrimaryConfig();
  const url = `${config.baseUrl}/text-embedding-004:batchEmbedContents?key=${config.apiKey}`;

  const requests = texts.map((text) => ({
    model: "models/text-embedding-004",
    content: {
      parts: [{ text }]
    }
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  });

  if (!response.ok) {
    throw new Error(`Failed to generate batch embeddings: ${response.statusText}`);
  }

  const data = await response.json();
  const embeddings = data?.embeddings;

  if (!embeddings || !Array.isArray(embeddings)) {
    throw new Error("Invalid response from batch embedding API");
  }

  return embeddings.map((e: any) => e.values);
}
