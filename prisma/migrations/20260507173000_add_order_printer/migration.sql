-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'PRINTING', 'PRINTED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "agentToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrinterRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "printerName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrinterRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisteredPrinter" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "agentName" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisteredPrinter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "orderCreatedAt" TIMESTAMP(3),
    "locationId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "printerName" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
    "html" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_agentToken_key" ON "AppSettings"("agentToken");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterRule_shop_locationId_key" ON "PrinterRule"("shop", "locationId");

-- CreateIndex
CREATE INDEX "PrinterRule_shop_enabled_idx" ON "PrinterRule"("shop", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredPrinter_shop_name_key" ON "RegisteredPrinter"("shop", "name");

-- CreateIndex
CREATE INDEX "RegisteredPrinter_shop_active_idx" ON "RegisteredPrinter"("shop", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PrintJob_shop_orderId_locationId_key" ON "PrintJob"("shop", "orderId", "locationId");

-- CreateIndex
CREATE INDEX "PrintJob_shop_status_createdAt_idx" ON "PrintJob"("shop", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrintJob_printerName_idx" ON "PrintJob"("printerName");

-- CreateIndex
CREATE INDEX "PrintEvent_shop_createdAt_idx" ON "PrintEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "PrintEvent_jobId_idx" ON "PrintEvent"("jobId");

-- AddForeignKey
ALTER TABLE "PrintEvent" ADD CONSTRAINT "PrintEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PrintJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
