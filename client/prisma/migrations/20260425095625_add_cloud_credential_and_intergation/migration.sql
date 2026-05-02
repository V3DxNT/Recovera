-- CreateTable
CREATE TABLE "CloudCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "accessKeyId" TEXT NOT NULL,
    "sercetAccesssKey" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "roleArn" TEXT,
    "sessionToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAT" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "s3BucketName" TEXT,
    "logGroups" TEXT[],
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CloudCredential_userId_provider_label_key" ON "CloudCredential"("userId", "provider", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_key" ON "Integration"("userId", "provider");

-- AddForeignKey
ALTER TABLE "CloudCredential" ADD CONSTRAINT "CloudCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "CloudCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
