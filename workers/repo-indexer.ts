import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { chunkFile, getLanguageFromExtension } from '../client/lib/retrieval/chunker';
import { generateEmbedding } from '../client/lib/retrieval/embeddings';
import { vectorStore } from '../client/lib/retrieval/vectorStore';

const execAsync = promisify(exec);

export async function indexRepository(repoFullName: string, githubToken: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'recovera-index-'));
  
  try {
    console.log(`[Indexer] Cloning ${repoFullName}...`);
    const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoFullName}.git`;
    await execAsync(`git clone --depth 1 ${cloneUrl} .`, { cwd: tempDir });

    const files = await getFiles(tempDir);
    console.log(`[Indexer] Found ${files.length} files. Indexing...`);

    await vectorStore.load();

    for (const file of files) {
      const relativePath = path.relative(tempDir, file);
      if (shouldIgnore(relativePath)) continue;

      const content = await fs.readFile(file, 'utf-8');
      const language = getLanguageFromExtension(relativePath);
      const chunks = chunkFile(relativePath, content, language);

      for (const chunk of chunks) {
        const embedding = await generateEmbedding(chunk.content);
        await vectorStore.add({
          id: `${repoFullName}:${relativePath}:${chunk.startLine}`,
          vector: embedding,
          metadata: {
            content: chunk.content,
            filePath: relativePath,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            repoFullName
          }
        });
      }
    }

    await vectorStore.save();
    console.log(`[Indexer] Successfully indexed ${repoFullName}.`);

  } catch (error) {
    console.error(`[Indexer] Failed to index ${repoFullName}:`, error);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function getFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((res) => {
    const resPath = path.resolve(dir, res.name);
    return res.isDirectory() ? getFiles(resPath) : resPath;
  }));
  return Array.prototype.concat(...files);
}

function shouldIgnore(filePath: string): boolean {
  const ignorePatterns = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'package-lock.json',
    'yarn.lock',
    '.env',
    '.ico',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg'
  ];
  return ignorePatterns.some(p => filePath.includes(p));
}
