import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { ECSClient, ListClustersCommand, ListServicesCommand, DescribeServicesCommand } from "@aws-sdk/client-ecs";
import { EKSClient, ListClustersCommand as EKSListClustersCommand, DescribeClusterCommand } from "@aws-sdk/client-eks";
import { ECRClient, DescribeRepositoriesCommand } from "@aws-sdk/client-ecr";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  type LogGroup,
} from "@aws-sdk/client-cloudwatch-logs";
import { CloudCredential } from "../../generated/prisma/client";
import { decrypt } from "../encrypt";

export interface AwsResource {
  type: "ec2" | "ecs" | "eks" | "lambda" | "log_group";
  id: string;          // instance ID, service ARN, ECR image name, or log group name
  name: string;        // friendly display name
  logGroups: string[]; // associated CloudWatch log groups
  region: string;
  cluster?: string;    // EKS/ECS cluster name if applicable
  ownerId?: string;    // AWS Account ID
}

function getCredentials(credential: CloudCredential) {
  return {
    accessKeyId: decrypt(credential.accessKeyId),
    secretAccessKey: decrypt(credential.secretAccessKey),
  };
}

/**
 * Discover EC2 instances (running only) with their Name tags.
 */
async function discoverEC2(credential: CloudCredential, region: string): Promise<AwsResource[]> {
  console.log(`[AWS-EC2] Discovering instances in ${region}...`);
  const ec2 = new EC2Client({ region, credentials: getCredentials(credential) });
  const resources: AwsResource[] = [];

  try {
    const result = await ec2.send(new DescribeInstancesCommand({
      Filters: [{ Name: "instance-state-name", Values: ["running"] }],
    }));

    for (const reservation of result.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const nameTag = instance.Tags?.find(t => t.Key === "Name")?.Value;
        resources.push({
          type: "ec2",
          id: instance.InstanceId || "unknown",
          name: nameTag || instance.InstanceId || "Unnamed Instance",
          logGroups: [`/recovera/ec2/${instance.InstanceId}`],
          region,
          ownerId: reservation.OwnerId,
        });
      }
    }
  } catch (error) {
    console.warn("EC2 discovery failed (permission may be missing):", error);
  }

  return resources;
}

/**
 * Discover ECS services across all clusters.
 */
async function discoverECS(credential: CloudCredential, region: string): Promise<AwsResource[]> {
  console.log(`[AWS-ECS] Discovering clusters in ${region}...`);
  const ecs = new ECSClient({ region, credentials: getCredentials(credential) });
  const resources: AwsResource[] = [];

  try {
    const clusters = await ecs.send(new ListClustersCommand({}));
    const clusterResults = await Promise.all((clusters.clusterArns || []).map(async (clusterArn) => {
      const clusterName = clusterArn.split("/").pop() || clusterArn;
      const clusterResources: AwsResource[] = [];

      try {
        const services = await ecs.send(new ListServicesCommand({ cluster: clusterArn }));
        if (!services.serviceArns?.length) return [];

        const described = await ecs.send(new DescribeServicesCommand({
          cluster: clusterArn,
          services: services.serviceArns,
        }));

        for (const svc of described.services || []) {
          const svcName = svc.serviceName || "unknown-service";
          clusterResources.push({
            type: "ecs",
            id: svc.serviceArn || svcName,
            name: svcName,
            logGroups: [`/ecs/${svcName}`],
            region,
            cluster: clusterName,
          });
        }
      } catch (e) {
        console.warn(`Failed to discover ECS services for cluster ${clusterName}:`, e);
      }
      return clusterResources;
    }));

    resources.push(...clusterResults.flat());
  } catch (error) {
    console.warn("ECS discovery failed (permission may be missing):", error);
  }

  return resources;
}

/**
 * Discover EKS clusters and their services via ECR repositories.
 * Each ECR image roughly corresponds to a deployable service.
 */
async function discoverEKS(credential: CloudCredential, region: string): Promise<AwsResource[]> {
  console.log(`[AWS-EKS] Discovering clusters and repositories in ${region}...`);
  const eks = new EKSClient({ region, credentials: getCredentials(credential) });
  const ecr = new ECRClient({ region, credentials: getCredentials(credential) });
  const resources: AwsResource[] = [];

  try {
    const clusters = await eks.send(new EKSListClustersCommand({}));
    const clusterNames = clusters.clusters || [];

    // Get ECR repositories — each image maps to a service running on EKS
    const ecrRepos = await ecr.send(new DescribeRepositoriesCommand({}));
    const repositories = ecrRepos.repositories || [];

    await Promise.all(clusterNames.map(async (clusterName) => {
      // The main EKS container log group
      const eksLogGroup = `/aws/eks/${clusterName}/containers`;

      // Each ECR repo is a service that can be mapped to a GitHub repo
      for (const repo of repositories) {
        const imageName = repo.repositoryName || "unknown";
        resources.push({
          type: "eks",
          id: `${clusterName}/${imageName}`,
          name: imageName,
          logGroups: [eksLogGroup],
          region,
          cluster: clusterName,
        });
      }

      // If no ECR repos, still show the cluster as a single resource
      if (repositories.length === 0) {
        resources.push({
          type: "eks",
          id: clusterName,
          name: clusterName,
          logGroups: [eksLogGroup],
          region,
          cluster: clusterName,
        });
      }
    }));
  } catch (error) {
    console.warn("EKS/ECR discovery failed (permission may be missing):", error);
  }

  return resources;
}

/**
 * Discover all CloudWatch Log Groups (catches Lambda, custom apps, etc.)
 */
async function discoverLogGroups(credential: CloudCredential, region: string): Promise<LogGroup[]> {
  console.log(`[AWS-CW] Fetching CloudWatch log groups in ${region}...`);
  const cwLogs = new CloudWatchLogsClient({ region, credentials: getCredentials(credential) });
  const allGroups: LogGroup[] = [];
  let nextToken: string | undefined;

  try {
    do {
      const response = await cwLogs.send(new DescribeLogGroupsCommand({ nextToken }));
      allGroups.push(...(response.logGroups || []));
      nextToken = response.nextToken;
    } while (nextToken);
  } catch (error) {
    console.warn("CloudWatch discovery failed:", error);
  }

  return allGroups;
}

/**
 * Main discovery function — merges all resource types into a unified list.
 * Log groups already claimed by EC2/ECS/EKS are excluded from the standalone list.
 */
export async function discoverAwsResources(credential: CloudCredential): Promise<AwsResource[]> {
  const region = credential.region || "us-east-1";

  // Run all discoveries in parallel
  const [ec2Resources, ecsResources, eksResources, allLogGroups] = await Promise.all([
    discoverEC2(credential, region),
    discoverECS(credential, region),
    discoverEKS(credential, region),
    discoverLogGroups(credential, region),
  ]);

  console.log(`[AWS] Parallel discovery finished. EC2: ${ec2Resources.length}, ECS: ${ecsResources.length}, EKS: ${eksResources.length}, CW Logs: ${allLogGroups.length}`);

  // Collect all log group names claimed by discovered services
  const claimedLogGroups = new Set<string>();
  for (const r of [...ec2Resources, ...ecsResources, ...eksResources]) {
    r.logGroups.forEach(lg => claimedLogGroups.add(lg));
  }

  // Standalone log groups (Lambda, custom apps, etc.) — only those not already claimed
  const standaloneResources: AwsResource[] = [];
  for (const group of allLogGroups) {
    const name = group.logGroupName;
    if (!name || claimedLogGroups.has(name)) continue;

    // Only include if it's a Lambda (standalone log groups are hidden for auto-connect)
    if (isLambda) {
      standaloneResources.push({
        type: "lambda",
        id: name,
        name: name.replace("/aws/lambda/", ""),
        logGroups: [name],
        region,
      });
    }
  }

  return [...ec2Resources, ...ecsResources, ...eksResources, ...standaloneResources];
}
