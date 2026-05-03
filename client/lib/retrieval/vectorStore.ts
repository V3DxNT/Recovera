import * as fs from 'fs/promises';
import * as path from 'path';

export interface VectorEntry {
  id: string;
  vector: number[];
  metadata: {
    content: string;
    filePath: string;
    startLine: number;
    endLine: number;
    repoFullName: string;
  };
}

const STORE_PATH = path.join(process.cwd(), 'data', 'vector-store.json');

export class SimpleVectorStore {
  private entries: VectorEntry[] = [];

  async load() {
    try {
      const data = await fs.readFile(STORE_PATH, 'utf-8');
      this.entries = JSON.parse(data);
    } catch (e) {
      this.entries = [];
    }
  }

  async save() {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(this.entries), 'utf-8');
  }

  async add(entry: VectorEntry) {
    this.entries.push(entry);
  }

  async search(queryVector: number[], limit: number = 5, filter?: (e: VectorEntry) => boolean): Promise<VectorEntry[]> {
    let candidates = this.entries;
    if (filter) {
      candidates = candidates.filter(filter);
    }

    const scored = candidates.map(entry => ({
      entry,
      score: this.cosineSimilarity(queryVector, entry.vector)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.entry);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const vectorStore = new SimpleVectorStore();
