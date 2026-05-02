import { prisma } from "../lib/prisma";
import { chunkCodeFile } from "../lib/retrieval/chunker";
import { generateEmbeddingsBatch } from "../lib/retrieval/embeddings";
import { upsertChunks, UpsertChunkParams } from "../lib/retrieval/vectorStore";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";

// Helper to recursively get all files in a dir
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (file !== ".git" && file !== "node_modules" && file !== "dist" && file !== "build") {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      }
    } else {
      // Basic filter for text files
      const ext = path.extname(file).toLowerCase();
      const validExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".c", ".cpp", ".rs", ".md", ".json", ".yaml", ".yml", ".prisma", ".sh"];
      if (validExts.includes(ext) || file === "Dockerfile" || file === "Makefile") {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

export async function processRepository(repositoryId: string, commitSha: string = "main") {
  // Create an IndexJob
  const job = await prisma.indexJob.create({
    data: {
      repositoryId,
      status: "processing",
      commitSha
    }
  });

  let tempDir = "";

  try {
    const repo = await prisma.repository.findUnique({
      where: { id: repositoryId }
    });

    if (!repo) {
      throw new Error("Repository not found");
    }

    // In a real implementation, we would authenticate using the User's GitHub token.
    // For this prototype, we'll clone public repos directly or assume git is authenticated.
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    const cloneUrl = `https://github.com/${repo.fullName}.git`;
    
    console.log(`[repo-indexer] Cloning ${cloneUrl} into ${tempDir}`);
    execSync(`git clone --depth 1 --branch ${commitSha} ${cloneUrl} .`, { cwd: tempDir, stdio: 'ignore' });

    // Find all target files
    const allFiles = getAllFiles(tempDir);
    console.log(`[repo-indexer] Found ${allFiles.length} files to process.`);

    const chunksToInsert: UpsertChunkParams[] = [];

    // Parse and chunk
    for (const filePath of allFiles) {
      const relativePath = path.relative(tempDir, filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      
      const fileChunks = chunkCodeFile(relativePath, content, 50, 10);
      
      for (const chunk of fileChunks) {
        chunksToInsert.push({
          repositoryId,
          path: chunk.path,
          content: chunk.content,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          commitSha,
          embedding: [] // Will populate next
        });
      }
    }

    console.log(`[repo-indexer] Created ${chunksToInsert.length} total chunks. Generating embeddings...`);

    // Batch generate embeddings
    const batchSize = 100;
    for (let i = 0; i < chunksToInsert.length; i += batchSize) {
      const batch = chunksToInsert.slice(i, i + batchSize);
      const texts = batch.map(c => `File: ${c.path}\n\n${c.content}`);
      
      const embeddings = await generateEmbeddingsBatch(texts);
      
      for (let j = 0; j < batch.length; j++) {
        batch[j].embedding = embeddings[j];
      }
      
      console.log(`[repo-indexer] Embedded batch ${i / batchSize + 1}/${Math.ceil(chunksToInsert.length / batchSize)}`);
    }

    // Upsert chunks into vector store
    console.log(`[repo-indexer] Saving to Vector Store...`);
    await upsertChunks(chunksToInsert);

    // Update job status
    await prisma.indexJob.update({
      where: { id: job.id },
      data: { status: "completed" }
    });

    console.log(`[repo-indexer] Indexing completed successfully for ${repo.fullName}`);

  } catch (error: any) {
    console.error(`[repo-indexer] Indexing failed:`, error);
    await prisma.indexJob.update({
      where: { id: job.id },
      data: { 
        status: "failed",
        error: error.message
      }
    });
  } finally {
    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
