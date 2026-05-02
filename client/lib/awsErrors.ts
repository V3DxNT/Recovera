/**
 * Translates raw AWS/HTTP error messages into user-friendly strings.
 * Used by IntegrateModal and InstanceSelectModal.
 */
export function parseProvisioningError(errorMessage: string | undefined | null): string {
  if (!errorMessage) return "An unexpected error occurred. Please try again.";

  if (
    errorMessage.includes("AccessDeniedException") ||
    errorMessage.includes("AccessDenied") ||
    errorMessage.includes("is not authorized")
  ) {
    return "Your IAM credentials lack the required permissions. Please attach the Recovera IAM policy to your AWS user and try again.";
  }

  if (
    errorMessage.includes("InvalidClientTokenId") ||
    errorMessage.includes("InvalidAccessKeyId")
  ) {
    return "Invalid Access Key ID. Please verify the key copied from the AWS console and try again.";
  }

  if (errorMessage.includes("SignatureDoesNotMatch")) {
    return "Invalid Secret Access Key. Please verify the secret key and try again.";
  }

  if (
    errorMessage.includes("ExpiredTokenException") ||
    errorMessage.includes("TokenRefreshRequired") ||
    errorMessage.includes("expired")
  ) {
    return "Your AWS credentials have expired. Please generate a new access key pair in the AWS console.";
  }

  if (
    errorMessage.includes("ETIMEDOUT") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("Timeout")
  ) {
    return "The request timed out. AWS resource creation can take up to 60 seconds — please try again.";
  }

  if (errorMessage.includes("BucketAlreadyExists")) {
    return "S3 bucket name conflict. Your AWS account may already have this bucket under a different user. Please contact support.";
  }

  if (
    errorMessage.includes("ResourceInUseException") ||
    errorMessage.includes("already exists")
  ) {
    return "Some resources already exist in your AWS account. The integration may be partially set up. Please try again — existing resources will be reused safely.";
  }

  if (errorMessage.includes("LimitExceededException")) {
    return "AWS service limit reached. You may have hit the maximum number of Firehose delivery streams or CloudWatch subscription filters. Check your AWS service quotas.";
  }

  if (errorMessage.includes("credentials")) {
    return "Failed to validate AWS credentials. Please check your Access Key ID and Secret Access Key.";
  }

  return errorMessage.length > 200
    ? errorMessage.slice(0, 200) + "…"
    : errorMessage;
}
