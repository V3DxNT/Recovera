export interface ParsedLogMetadata {
  serviceName: string | null;
  namespace: string | null;
  podName: string | null;
  containerImage: string | null;
  logMessage: string | null;
  stream: string | null;
  timestamp: string | null;
}

/**
 * Extract service name from common Kubernetes/CloudWatch shapes.
 */
export function extractServiceName(logEntry: Record<string, unknown>): string | null {
  const kubernetes = (logEntry?.kubernetes ?? {}) as {
    container_image?: unknown;
    labels?: Record<string, unknown>;
    container_name?: unknown;
    pod_name?: unknown;
  };
  const image = kubernetes.container_image;
  if (typeof image === "string" && image.length > 0) {
    const withoutRegistry = image.includes("/") ? image.split("/").pop() ?? image : image;
    return withoutRegistry.split(":")[0] || null;
  }

  const label = kubernetes.labels?.["app.kubernetes.io/name"];
  if (typeof label === "string" && label.length > 0) return label;

  const containerName = kubernetes.container_name;
  if (typeof containerName === "string" && containerName.length > 0) return containerName;

  const podName = kubernetes.pod_name;
  if (typeof podName === "string" && podName.length > 0) {
    const parts = podName.split("-");
    if (parts.length > 2) return parts.slice(0, -2).join("-");
    return podName;
  }

  return null;
}

export function extractLogMetadata(logEntry: Record<string, unknown>): ParsedLogMetadata {
  const kubernetes = (logEntry?.kubernetes ?? {}) as {
    namespace_name?: unknown;
    pod_name?: unknown;
    container_image?: unknown;
  };
  const fallbackTimestamp =
    typeof logEntry?.timestamp === "string"
      ? logEntry.timestamp
      : typeof logEntry?.time === "string"
      ? logEntry.time
      : null;

  return {
    serviceName: extractServiceName(logEntry),
    namespace: typeof kubernetes.namespace_name === "string" ? kubernetes.namespace_name : null,
    podName: typeof kubernetes.pod_name === "string" ? kubernetes.pod_name : null,
    containerImage: typeof kubernetes.container_image === "string" ? kubernetes.container_image : null,
    logMessage:
      typeof logEntry?.log === "string"
        ? logEntry.log
        : typeof logEntry?.message === "string"
        ? logEntry.message
        : null,
    stream: typeof logEntry?.stream === "string" ? logEntry.stream : null,
    timestamp: fallbackTimestamp,
  };
}
