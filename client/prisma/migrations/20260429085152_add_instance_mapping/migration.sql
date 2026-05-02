/*
  Warnings:

  - You are about to drop the column `logGroups` on the `Integration` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,provider,credentialId]` on the table `Integration` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Integration_userId_provider_key";

-- AlterTable
ALTER TABLE "Integration" DROP COLUMN "logGroups";

-- CreateTable
CREATE TABLE "InstanceMapping" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "logGroupName" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceLabel" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstanceMapping_integrationId_logGroupName_resourceId_key" ON "InstanceMapping"("integrationId", "logGroupName", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_credentialId_key" ON "Integration"("userId", "provider", "credentialId");

-- AddForeignKey
ALTER TABLE "InstanceMapping" ADD CONSTRAINT "InstanceMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
