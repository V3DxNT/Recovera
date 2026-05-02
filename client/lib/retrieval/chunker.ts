export interface CodeChunkData {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * A simple line-based chunker. 
 * Splits code into chunks of ~`linesPerChunk` lines, with `overlapLines` overlap.
 */
export function chunkCodeFile(path: string, content: string, linesPerChunk: number = 50, overlapLines: number = 10): CodeChunkData[] {
  const lines = content.split("\n");
  const chunks: CodeChunkData[] = [];
  
  if (lines.length === 0) return chunks;

  let startLine = 0;

  while (startLine < lines.length) {
    const endLine = Math.min(startLine + linesPerChunk, lines.length);
    const chunkLines = lines.slice(startLine, endLine);
    
    chunks.push({
      path,
      content: chunkLines.join("\n"),
      startLine: startLine + 1, // 1-indexed for the database
      endLine,
    });

    if (endLine >= lines.length) break;
    startLine = endLine - overlapLines;
  }

  return chunks;
}
