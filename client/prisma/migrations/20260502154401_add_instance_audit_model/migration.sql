-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventCount" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentRca" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "rcaPayload" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentRca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "rawExcerpt" TEXT NOT NULL,
    "stackTop" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionAudit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT,
    "reportPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatchArtifact" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "patchDiff" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "validationStatus" TEXT NOT NULL DEFAULT 'pending',
    "validationLogs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatchArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "branchName" TEXT,
    "commitSha" TEXT,
    "prUrl" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyAuditLog" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonCodes" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_status_severity_idx" ON "Incident"("status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_repositoryId_fingerprint_key" ON "Incident"("repositoryId", "fingerprint");

-- CreateIndex
CREATE INDEX "IncidentRca_incidentId_version_idx" ON "IncidentRca"("incidentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentEvent_eventId_key" ON "IncidentEvent"("eventId");

-- CreateIndex
CREATE INDEX "IncidentEvent_incidentId_detectedAt_idx" ON "IncidentEvent"("incidentId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DetectionAudit_eventId_key" ON "DetectionAudit"("eventId");

-- CreateIndex
CREATE INDEX "DetectionAudit_eventId_idx" ON "DetectionAudit"("eventId");

-- CreateIndex
CREATE INDEX "SafetyAuditLog_incidentId_createdAt_idx" ON "SafetyAuditLog"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentRca" ADD CONSTRAINT "IncidentRca_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatchArtifact" ADD CONSTRAINT "PatchArtifact_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
