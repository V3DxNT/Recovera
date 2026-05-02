/**
 * A rudimentary parser and validator for unified diffs to enforce policy.
 */

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const MAX_FILES = 3;
const MAX_LINES = 120;
const BLOCKED_PATHS = [
  'prisma/migrations/',
  '.env',
  '.env.example',
  'package.json',
  'package-lock.json',
  'client/lib/auth/', // Example sensitive path
];

/**
 * Validates a unified diff string against hardcoded policies.
 */
export function validatePatch(patchDiff: string): ValidationResult {
  if (!patchDiff || patchDiff.trim() === '') {
    return { valid: false, reason: "Patch is empty." };
  }

  const lines = patchDiff.split('\n');
  const filesTouched = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of lines) {
    if (line.startsWith('+++ b/') || line.startsWith('--- a/')) {
      const filePath = line.substring(6).trim();
      if (filePath !== '/dev/null') {
        filesTouched.add(filePath);
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      linesAdded++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      linesRemoved++;
    }
  }

  // Check file count constraint
  if (filesTouched.size > MAX_FILES) {
    return {
      valid: false,
      reason: `Patch modifies too many files (${filesTouched.size}). Max allowed is ${MAX_FILES}.`
    };
  }

  // Check total lines constraint
  const totalLinesChanged = linesAdded + linesRemoved;
  if (totalLinesChanged > MAX_LINES) {
    return {
      valid: false,
      reason: `Patch modifies too many lines (${totalLinesChanged}). Max allowed is ${MAX_LINES}.`
    };
  }

  // Check blocked paths
  for (const file of filesTouched) {
    for (const blocked of BLOCKED_PATHS) {
      if (file.includes(blocked) || file === blocked) {
        return {
          valid: false,
          reason: `Patch attempts to modify a blocked path: ${file} (matches ${blocked})`
        };
      }
    }
  }

  return { valid: true };
}
