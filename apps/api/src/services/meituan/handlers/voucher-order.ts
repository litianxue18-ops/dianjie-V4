/**
 * 110009 代金券买单订单消息（必接）
 *
 * 处理策略（按 message.msgType 子状态分流）:
 *   payOrderSuccess     → INSERT RevenueTransaction(NORMAL) + RevenueRecord += amount
 *   refundOrderSuccess  → UPDATE 现有 tx(REFUNDED) + RevenueRecord -= refundAmount
 *   其他子状态           → 仅记 OpLog，不入账
 */
import { prisma } from '@dianjie/db'
import dayjs from 'dayjs'
import type { VoucherOrderMessage } from '../types'

export interface VoucherOrderInput {
  storeId: string
  tenantId: string
  message: VoucherOrderMessage
  externalMsgId: string
}

export interface VoucherOrderResult {
  txId: string | null
  skipped: boolean
}

export async function handleVoucherOrder(input: VoucherOrderInput): Promise<VoucherOrderResult> {
  const { storeId, tenantId, message: m, externalMsgId } = input
  const externalOrderNo = m.orderId != null ? String(m.orderId) : null
  if (!externalOrderNo) {
    throw new Error('voucher-order: 缺 orderId')
  }

  const subType = m.msgType
  const paidAt = m.payTime ? new Date(m.payTime) : new Date()
  const paidAtDate = dayjs(paidAt).startOf('day').toDate()

  switch (subType) {
    case 'payOrderSuccess': {
      const amount = m.userPayAmount ?? 0
      const [tx] = await prisma.$transaction([
        prisma.revenueTransaction.create({
          data: {
            tenantId, storeId,
            channel: 'MEITUAN_VOUCHER',
            externalOrderNo,
            externalMsgId,
            amount, netAmount: amount,
            paidAt, status: 'NORMAL',
            rawPayload: m as any,
          },
        }),
        prisma.revenueRecord.upsert({
          where: { storeId_date: { storeId, date: paidAtDate } },
          create: {
            storeId, date: paidAtDate,
            amount, source: 'meituan',
          },
          update: { amount: { increment: amount } },
        }),
      ])
      return { txId: tx.id, skipped: false }
    }

    case 'refundOrderSuccess': {
      const existing = await prisma.revenueTransaction.findUnique({
        where: { channel_externalOrderNo: { channel: 'MEITUAN_VOUCHER', externalOrderNo } },
      })
      if (!existing) {
        throw new Error(`refund without prior pay tx (externalOrderNo=${externalOrderNo})`)
      }

      // 美团 110009 退款消息没有明确的 refundAmount 字段，按设计稿默认全退
      const refundAmount = Number(existing.amount)
      const newRefund = Number(existing.refundAmount) + refundAmount
      const newNet = Number(existing.amount) - newRefund
      const status = newNet <= 0 ? 'REFUNDED' : 'PARTIAL_REFUND'

      const [tx] = await prisma.$transaction([
        prisma.revenueTransaction.update({
          where: { id: existing.id },
          data: {
            refundAmount: newRefund,
            netAmount: newNet,
            status,
            refundedAt: new Date(m.refundInfo?.refundTime ?? Date.now()),
          },
        }),
        prisma.revenueRecord.update({
          where: { storeId_date: { storeId, date: dayjs(existing.paidAt).startOf('day').toDate() } },
          data: { amount: { decrement: refundAmount } },
        }),
      ])
      return { txId: tx.id, skipped: false }
    }

    case 'createOrder':
    case 'payOrderError':
    case 'refundingOrder':
    case 'refundOrderError':
    case 'unknownOrder':
    case undefined:
      return { txId: null, skipped: true }

    default:
      return { txId: null, skipped: true }
  }
}
