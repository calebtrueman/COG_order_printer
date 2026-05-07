-- Recreate local-agent tables after removing the PrintNode-only provider path.
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "agentToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");
CREATE UNIQUE INDEX "AppSettings_agentToken_key" ON "AppSettings"("agentToken");
CREATE UNIQUE INDEX "RegisteredPrinter_shop_name_key" ON "RegisteredPrinter"("shop", "name");
CREATE INDEX "RegisteredPrinter_shop_active_idx" ON "RegisteredPrinter"("shop", "active");

ALTER TABLE "PrinterRule" ALTER COLUMN "printerProvider" SET DEFAULT 'local-agent';
ALTER TABLE "PrintJob" ALTER COLUMN "printerProvider" SET DEFAULT 'local-agent';

UPDATE "PrinterRule"
SET "printerProvider" = 'local-agent', "printerExternalId" = NULL
WHERE "printerExternalId" IS NULL;

UPDATE "PrintJob"
SET "printerProvider" = 'local-agent', "providerJobId" = NULL, "pdfBase64" = NULL
WHERE "printerExternalId" IS NULL;
