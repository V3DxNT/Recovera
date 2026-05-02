import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Octokit } from '@octokit/rest';

const execAsync = promisify(exec);

export interface PrCreatorOptions {
  repoFullName: string; // e.g. "user/repo"
  incidentId: string;
  patchDiff: string;
  githubToken: string;
  prTitle: string;
  prBody: string;
  baseBranch?: string;
}

export interface PrCreatorResult {
  success: boolean;
  prUrl?: string;
  branchName?: string;
  commitSha?: string;
  error?: string;
}

/**
 * Creates a PR by cloning the repo, applying the patch, pushing to a new branch, and calling Octokit to open the PR.
 */
export async function createPullRequest(options: PrCreatorOptions): Promise<PrCreatorResult> {
  const { repoFullName, incidentId, patchDiff, githubToken, prTitle, prBody, baseBranch = "main" } = options;
  const branchName = `auto-fix/inc-${incidentId}-${Date.now()}`;
  const repoParts = repoFullName.trim().split('/');

  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    return {
      success: false,
      error: `Invalid repoFullName "${repoFullName}". Expected format "owner/repo".`,
    };
  }

  const [owner, repo] = repoParts;
  const octokit = new Octokit({ auth: githubToken });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'recovera-pr-'));
  const patchPath = path.join(workDir, 'fix.patch');

  try {
    // 1. Clone repository using token for auth
    const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoFullName}.git`;
    await execAsync(`git clone --depth 1 -b ${baseBranch} ${cloneUrl} .`, { cwd: workDir });

    // 2. Create new branch
    await execAsync(`git checkout -b ${branchName}`, { cwd: workDir });

    // 3. Write and apply patch
    await fs.writeFile(patchPath, patchDiff);
    await execAsync(`git apply ${patchPath}`, { cwd: workDir });

    // 4. Commit changes
    await execAsync(`git config user.name "Recovera AutoSRE"`, { cwd: workDir });
    await execAsync(`git config user.email "bot@recovera.io"`, { cwd: workDir });
    await execAsync(`git add .`, { cwd: workDir });
    await execAsync(`git commit -m "fix: Automated remediation for incident ${incidentId}"`, { cwd: workDir });

    // 5. Get commit SHA
    const { stdout: commitShaOutput } = await execAsync(`git rev-parse HEAD`, { cwd: workDir });
    const commitSha = commitShaOutput.trim();

    // 6. Push branch to origin
    await execAsync(`git push origin ${branchName}`, { cwd: workDir });

    // 7. Open Pull Request via GitHub API
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: prTitle,
      body: prBody,
      head: branchName,
      base: baseBranch,
    });

    return {
      success: true,
      prUrl: pr.html_url,
      branchName,
      commitSha,
    };

  } catch (error: any) {
    console.error("Failed to create PR:", error);
    return {
      success: false,
      error: error.message || String(error),
    };
  } finally {
    // Cleanup temporary work tree
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`Failed to cleanup workDir ${workDir}:`, cleanupError);
    }
  }
}
