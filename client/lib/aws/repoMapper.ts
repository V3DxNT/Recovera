import { AwsResource } from "./DiscoverResources";
import { prisma } from "@/lib/prisma";

export interface RepoMatch {
  resource: AwsResource;
  bestMatch: string | null; // repoFullName
  confidence: number;
}

/**
 * Strategy:
 * 1. Exact match (case insensitive): 1.0
 * 2. Substring match: 0.8
 * 3. Tag/Label match: 0.9
 */
export function matchResourcesToRepos(
  resources: AwsResource[],
  githubRepos: string[] // List of "owner/repo"
): RepoMatch[] {
  return resources.map((resource) => {
    let bestMatch: string | null = null;
    let maxConfidence = 0;

    const resourceName = resource.name.toLowerCase();

    for (const repoFullName of githubRepos) {
      const repoName = repoFullName.split("/")[1].toLowerCase();

      // 1. Exact match
      if (resourceName === repoName) {
        bestMatch = repoFullName;
        maxConfidence = 1.0;
        break; // Can't get better than this
      }

      // 2. Substring match (e.g. "auth-service" matches "user/auth")
      if (resourceName.includes(repoName) || repoName.includes(resourceName)) {
        const confidence = 0.8;
        if (confidence > maxConfidence) {
          bestMatch = repoFullName;
          maxConfidence = confidence;
        }
      }

      // 3. Resource ID match (if it's a name)
      const resourceId = resource.id.toLowerCase();
      if (resourceId.includes(repoName)) {
        const confidence = 0.7;
        if (confidence > maxConfidence) {
          bestMatch = repoFullName;
          maxConfidence = confidence;
        }
      }
    }

    return {
      resource,
      bestMatch,
      confidence: maxConfidence,
    };
  });
}

function normalizeRepoName(repoFullName: string): string {
  return repoFullName.includes("/") ? repoFullName.split("/")[1].toLowerCase() : repoFullName.toLowerCase();
}

interface ResolveRepoMappingInput {
  integrationId?: string;
  logGroupName?: string | null;
  serviceName?: string | null;
  resourceId?: string | null;
}

/**
 * Resolve repo mapping for incoming logs.
 *
 * Priority:
 * 1) Exact confirmed mapping by integration + logGroup + resourceId
 * 2) Exact confirmed mapping by integration + logGroup
 * 3) Service name match against confirmed mappings for same integration/log group
 * 4) Global fallback by confirmed mapping + serviceName
 */
export async function resolveRepoMapping(input: ResolveRepoMappingInput): Promise<string | null> {
  const integrationFilter = input.integrationId ? { integrationId: input.integrationId } : {};
  const logGroup = input.logGroupName ?? undefined;
  const service = input.serviceName?.toLowerCase().trim() ?? "";
  const resourceId = input.resourceId ?? undefined;

  if (logGroup && resourceId) {
    const exact = await prisma.instanceMapping.findFirst({
      where: {
        ...integrationFilter,
        logGroupName: logGroup,
        resourceId,
        status: "confirmed",
      },
      select: { repoFullName: true },
    });
    if (exact?.repoFullName) return exact.repoFullName;
  }

  if (logGroup) {
    const byGroup = await prisma.instanceMapping.findFirst({
      where: {
        ...integrationFilter,
        logGroupName: logGroup,
        status: "confirmed",
      },
      orderBy: { confidence: "desc" },
      select: { repoFullName: true },
    });
    if (byGroup?.repoFullName && !service) return byGroup.repoFullName;
  }

  if (service) {
    const candidates = await prisma.instanceMapping.findMany({
      where: {
        ...integrationFilter,
        ...(logGroup ? { logGroupName: logGroup } : {}),
        status: "confirmed",
      },
      select: { repoFullName: true },
      take: 50,
    });

    const exactServiceMatch = candidates.find(
      (c) => normalizeRepoName(c.repoFullName) === service
    );
    if (exactServiceMatch) return exactServiceMatch.repoFullName;

    const fuzzyServiceMatch = candidates.find((c) => {
      const repoName = normalizeRepoName(c.repoFullName);
      return repoName.includes(service) || service.includes(repoName);
    });
    if (fuzzyServiceMatch) return fuzzyServiceMatch.repoFullName;

    const globalCandidates = await prisma.instanceMapping.findMany({
      where: { status: "confirmed" },
      select: { repoFullName: true },
      take: 200,
    });

    const globalMatch = globalCandidates.find((c) => normalizeRepoName(c.repoFullName) === service);
    if (globalMatch) return globalMatch.repoFullName;
  }

  return null;
}
