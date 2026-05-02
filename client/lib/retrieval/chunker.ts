/**
 * Chunker for source code retrieval.
 * Splits files into manageable chunks for embedding and search.
 */

export interface CodeChunk {
  content: string;
  startLine: number;
  endLine: number;
  filePath: string;
  language: string;
}

export function chunkFile(filePath: string, content: string, language: string): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];
  const chunkSize = 50; // Lines per chunk
  const overlap = 10;   // Overlap lines

  for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
    const startLine = i + 1;
    const endLine = Math.min(i + chunkSize, lines.length);
    const chunkContent = lines.slice(i, endLine).join('\n');

    chunks.push({
      content: chunkContent,
      startLine,
      endLine,
      filePath,
      language
    });

    if (endLine === lines.length) break;
  }

  return chunks;
}

export function getLanguageFromExtension(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    default:
      return 'text';
  }
}
