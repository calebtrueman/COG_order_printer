CREATE TABLE "RestockDocument" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RestockDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestockDocument_shop_key" ON "RestockDocument"("shop");
