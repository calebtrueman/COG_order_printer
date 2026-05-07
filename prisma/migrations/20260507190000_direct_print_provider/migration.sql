-- AlterEnum
ALTER TYPE "PrintJobStatus" ADD VALUE 'SUBMITTED';

-- AlterTable
ALTER TABLE "PrinterRule"
ADD COLUMN "printerProvider" TEXT NOT NULL DEFAULT 'printnode',
ADD COLUMN "printerExternalId" TEXT;

-- AlterTable
ALTER TABLE "PrintJob"
ADD COLUMN "printerProvider" TEXT NOT NULL DEFAULT 'printnode',
ADD COLUMN "printerExternalId" TEXT,
ADD COLUMN "providerJobId" TEXT,
ADD COLUMN "pdfBase64" TEXT;
