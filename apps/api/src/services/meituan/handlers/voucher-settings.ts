/**
 * 110021 门店代金券买单设置变更
 * V4 当前没对应字段，仅做 OpLog + 通知，status IGNORED
 */
import { prisma } from '@dianjie/db'
import { findStoreByShopId } from '../storeResolver'
import { sendNotification } from '../../notification'
import type { VoucherSettingsMessage } from '../types'

export interface VoucherSettingsInput {
  message: VoucherSettingsMessage
}

export interface VoucherSettingsResult {
  status: 'IGNORED'
}

export async function handleVoucherSettings(
  input: VoucherSettingsInput,
): Promise<VoucherSettingsResult> {
  const m = input.message
  const shopId = String(m.poiId)
  const store = await findStoreByShopId(shopId)

  await prisma.opLog.create({
    data: {
      tenantId: store?.tenantId || '',
      action: '美团门店代金券买单设置变更',
      target: shopId,
      entityType: 'Store',
      targetId: store?.id || null,
      metadata: { changes: m.changes, operateTime: m.operateTime } as any,
      isAi: true,
    },
  })

  await sendNotification({
    tenantId: store?.tenantId || '',
    recipientRole: 'ADMIN',
    type: 'MEITUAN_VOUCHER_SETTINGS_CHANGED',
    title: '美团门店代金券买单设置已变更',
    body: `${store ? `门店「${store.name}」` : `poiId=${shopId}`} 变更项: ${m.changes.join(', ')}，请去美团商家版后台查看`,
    refType: 'Store', refId: store?.id,
  }).catch(() => {})

  return { status: 'IGNORED' }
}
