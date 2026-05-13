-- CreateEnum
CREATE TYPE "MeituanMsgStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "RevenueChannel" AS ENUM ('MEITUAN_VOUCHER', 'MEITUAN_ORDER', 'DOUYIN_VOUCHER', 'DOUYIN_ORDER', 'AGGREGATOR', 'WECHAT_MINI', 'ALIPAY_MINI');

-- CreateEnum
CREATE TYPE "RevenueTxStatus" AS ENUM ('NORMAL', 'REFUNDED', 'PARTIAL_REFUND', 'CANCELED', 'ORPHAN');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "meituanLastAuthAt" TIMESTAMP(3),
ADD COLUMN     "meituanVoucherEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "meituan_raw_messages" (
    "id" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "msgType" INTEGER NOT NULL,
    "developerId" INTEGER NOT NULL,
    "businessId" INTEGER NOT NULL,
    "ePoiId" TEXT,
    "opBizCode" TEXT,
    "msgTimestamp" BIGINT NOT NULL,
    "rawHeaders" JSONB NOT NULL,
    "rawBody" TEXT NOT NULL,
    "rawMessage" JSONB NOT NULL,
    "status" "MeituanMsgStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "resultTxId" TEXT,

    CONSTRAINT "meituan_raw_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" "RevenueChannel" NOT NULL,
    "externalOrderNo" TEXT NOT NULL,
    "externalMsgId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "status" "RevenueTxStatus" NOT NULL DEFAULT 'NORMAL',
    "rawPayload" JSONB NOT NULL,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meituan_raw_messages_msgId_key" ON "meituan_raw_messages"("msgId");

-- CreateIndex
CREATE INDEX "meituan_raw_messages_msgType_status_idx" ON "meituan_raw_messages"("msgType", "status");

-- CreateIndex
CREATE INDEX "meituan_raw_messages_receivedAt_idx" ON "meituan_raw_messages"("receivedAt" DESC);

-- CreateIndex
CREATE INDEX "revenue_transactions_storeId_paidAt_idx" ON "revenue_transactions"("storeId", "paidAt" DESC);

-- CreateIndex
CREATE INDEX "revenue_transactions_status_idx" ON "revenue_transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_transactions_channel_externalOrderNo_key" ON "revenue_transactions"("channel", "externalOrderNo");

-- AddForeignKey
ALTER TABLE "revenue_transactions" ADD CONSTRAINT "revenue_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_transactions" ADD CONSTRAINT "revenue_transactions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

