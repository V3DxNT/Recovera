/*
  Warnings:

  - You are about to drop the column `sercetAccesssKey` on the `CloudCredential` table. All the data in the column will be lost.
  - You are about to drop the column `updateAt` on the `Integration` table. All the data in the column will be lost.
  - Added the required column `secretAccessKey` to the `CloudCredential` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Integration` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CloudCredential" DROP COLUMN "sercetAccesssKey",
ADD COLUMN     "secretAccessKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Integration" DROP COLUMN "updateAt",
ADD COLUMN     "firehoseArn" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
