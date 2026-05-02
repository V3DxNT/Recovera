-- AlterTable
ALTER TABLE "DetectionAudit" ADD COLUMN     "processingLatencyMs" INTEGER;

-- AlterTable
ALTER TABLE "DetectionQueue" ADD COLUMN     "processingLatencyMs" INTEGER;
