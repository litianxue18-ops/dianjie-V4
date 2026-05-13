/**
 * 110011 开通代金券买单消息
 * 副作用: 更新 Store.meituanVoucherEnabled + 通知 ADMIN
 */
import { prisma } from '@dianjie/db'
import { findStoreByShopId } from '../storeResolver'
import { sendNotification } from '../../notification'
import type { VoucherEnableMessage } from '../types'

export interface VoucherEnableInput {
  ePoiId: string | null
  message: VoucherEnableMessage
}

export async function handleVoucherEnable(input: VoucherEnableInput): Promise<void> {
  if (!input.ePoiId) throw new Error('voucher-enable: 缺 ePoiId')

  const store = await findStoreByShopId(input.ePoiId)
  if (!store) {
    throw new Error(`voucher-enable: 未匹配门店 ePoiId=${input.ePoiId}`)
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { meituanVoucherEnabled: input.message.isOpen },
  })

  await sendNotification({
    tenantId: store.tenantId,
    recipientRole: 'ADMIN',
    type: 'MEITUAN_VOUCHER_ENABLED',
    title: input.message.isOpen ? '美团代金券买单 已开通' : '美团代金券买单 已关闭',
    body: `门店「${store.name}」`,
    refType: 'Store',
    refId: store.id,
  })
}
