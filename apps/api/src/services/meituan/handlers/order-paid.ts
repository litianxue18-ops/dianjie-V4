/**
 * 110029 新订单推送（已支付）
 *
 * 同步快路径（spec §4.4）: 直接处理完返 data.vendorOrderId 给美团
 * 嵌套 DTO (orderSkuDTOList / dealInfoDTOList 等) Phase 1 不展开，全部存 rawPayload
 */
import { prisma } from '@dianjie/db'
import dayjs from 'dayjs'
import { findStoreByShopId } from '../storeResolver'
import { sendNotification } from '../../notification'
import type { OrderPaidMessage } from '../types'

export interface OrderPaidInput {
  message: OrderPaidMessage
  externalMsgId: string
}

export interface OrderPaidResult {
  code: number
  message: string
  data?: { vendorOrderId: string; orderNo: string }
}

export async function handleOrderPaid(input: OrderPaidInput): Promise<OrderPaidResult> {
  const { message: m, externalMsgId } = input

  const store = await findStoreByShopId(m.vendorShopId)
  if (!store) {
    await sendNotification({
      tenantId: '',
      recipientRole: 'ADMIN',
      type: 'MEITUAN_UNKNOWN_SHOP',
      title: '美团订单：未匹配门店',
      body: `vendorShopId=${m.vendorShopId} 在 V4 不存在`,
    }).catch(() => {})
    return { code: 1, message: `unknown vendorShopId ${m.vendorShopId}` }
  }

  const externalOrderNo = String(m.orderId)
  const amountYuan = m.payPrice / 100
  const paidAt = new Date(m.payTime)
  const paidAtDate = dayjs(paidAt).startOf('day').toDate()

  let tx
  try {
    const [created] = await prisma.$transaction([
      prisma.revenueTransaction.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          channel: 'MEITUAN_ORDER',
          externalOrderNo,
          externalMsgId,
          amount: amountYuan,
          netAmount: amountYuan,
          paidAt,
          status: 'NORMAL',
          rawPayload: m as any,
        },
      }),
      prisma.revenueRecord.upsert({
        where: { storeId_date: { storeId: store.id, date: paidAtDate } },
        create: {
          storeId: store.id, date: paidAtDate,
          amount: amountYuan, source: 'meituan',
        },
        update: { amount: { increment: amountYuan } },
      }),
    ])
    tx = created
  } catch (err: any) {
    if (err.code === 'P2002') {
      const existing = await prisma.revenueTransaction.findUnique({
        where: { channel_externalOrderNo: { channel: 'MEITUAN_ORDER', externalOrderNo } },
      })
      if (existing) {
        return {
          code: 0, message: 'success',
          data: { vendorOrderId: existing.id, orderNo: `MTORD-${existing.id.slice(0, 8)}` },
        }
      }
    }
    throw err
  }

  return {
    code: 0,
    message: 'success',
    data: { vendorOrderId: tx.id, orderNo: `MTORD-${tx.id.slice(0, 8)}` },
  }
}
