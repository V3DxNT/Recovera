import { embed } from 'ai';
import { google } from '@ai-sdk/google';

/**
 * Generates an embedding for a given text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: google('text-embedding-004'), // or 'models/embedding-001'
    value: text,
  });
  return embedding;
}

/**
 * Generates embeddings for a batch of texts.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings = await Promise.all(texts.map(text => generateEmbedding(text)));
  return embeddings;
}
