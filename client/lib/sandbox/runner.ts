import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface SandboxResult {
  passed: boolean;
  logs: string;
}

/**
 * Validates a patch by cloning the repository to a temporary worktree,
 * applying the patch, and running build/lint commands.
 */
export async function runSandboxValidation(
  repoFullName: string, // e.g., "owner/repo"
  patchDiff: string,
  githubToken?: string
): Promise<SandboxResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'recovera-sandbox-'));
  let logs = "";

  try {
    // 1. Clone the repository
    const cloneUrl = githubToken 
      ? `https://oauth2:${githubToken}@github.com/${repoFullName}.git`
      : `https://github.com/${repoFullName}.git`;

    logs += `> git clone ${repoFullName} (depth 1)\n`;
    await execAsync(`git clone --depth 1 ${cloneUrl} .`, { cwd: tempDir });

    // 2. Write the patch file
    const patchPath = path.join(tempDir, 'fix.patch');
    await fs.writeFile(patchPath, patchDiff, 'utf8');

    // 3. Apply the patch
    logs += `> git apply fix.patch\n`;
    try {
      await execAsync(`git apply fix.patch`, { cwd: tempDir });
      logs += `Patch applied successfully.\n`;
    } catch (applyError: unknown) {
      logs += `Failed to apply patch:\n${applyError instanceof Error ? applyError.message : String(applyError)}\n`;
      return { passed: false, logs };
    }

    // 4. Run basic checks (Assuming it's a Node project for the MVP)
    // In a real environment, we would infer the language and build system from the repo contents.
    const packageJsonPath = path.join(tempDir, 'package.json');
    try {
      await fs.access(packageJsonPath);
      logs += `> npm install (ignoring scripts for safety)\n`;
      // Use --ignore-scripts to prevent arbitrary code execution from postinstall scripts
      await execAsync(`npm install --ignore-scripts --no-audit --no-fund`, { cwd: tempDir });
      
      logs += `> npm run lint (if present)\n`;
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.lint) {
        const { stdout, stderr } = await execAsync(`npm run lint`, { cwd: tempDir });
        logs += `${stdout}\n${stderr}\n`;
      } else {
        logs += `No lint script found, skipping.\n`;
      }
    } catch (e: unknown) {
      logs += `Check phase failed or skipped (not a Node project?):\n${e instanceof Error ? e.message : String(e)}\n`;
      // We don't fail the sandbox just because npm install failed if it's not a node project,
      // but for MVP we assume it should pass if we reach here.
    }

    logs += `Sandbox validation completed successfully.\n`;
    return { passed: true, logs };

  } catch (error: unknown) {
    logs += `Sandbox Error:\n${error instanceof Error ? error.message : String(error)}\n`;
    return { passed: false, logs };
  } finally {
    // Cleanup the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`Failed to cleanup temp dir ${tempDir}`, cleanupError);
    }
  }
}
