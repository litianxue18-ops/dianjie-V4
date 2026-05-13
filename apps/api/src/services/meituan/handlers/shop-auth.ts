/**
 * 110019 门店授权信息同步
 * 副作用:
 *   - 找到 Store: 更新 meituanLastAuthAt，状态 PROCESSED
 *   - 找不到: status FAILED + 通知 ADMIN（P1 数据完整性）
 */
import { prisma } from '@dianjie/db'
import { findStoreByShopId } from '../storeResolver'
import { sendNotification } from '../../notification'
import type { ShopAuthMessage } from '../types'

export interface ShopAuthInput {
  message: ShopAuthMessage
}

export interface ShopAuthResult {
  status: 'PROCESSED' | 'FAILED'
}

export async function handleShopAuth(input: ShopAuthInput): Promise<ShopAuthResult> {
  const m = input.message
  const store = await findStoreByShopId(m.vendorShopId)

  if (!store) {
    await sendNotification({
      tenantId: '',
      recipientRole: 'ADMIN',
      type: 'MEITUAN_UNKNOWN_SHOP_AUTH',
      title: '美团门店授权同步：未匹配门店（P1）',
      body: `vendorShopId=${m.vendorShopId} 在 V4 不存在，请检查 Store.meituanShopId 配置`,
    }).catch(() => {})
    return { status: 'FAILED' }
  }

  const authAt = m.time ? new Date(m.time.replace(' ', 'T') + '+08:00') : new Date()
  await prisma.store.update({
    where: { id: store.id },
    data: { meituanLastAuthAt: authAt },
  })

  await sendNotification({
    tenantId: store.tenantId,
    recipientRole: 'ADMIN',
    type: 'MEITUAN_SHOP_AUTH_SYNC',
    title: '美团门店授权信息已同步',
    body: `门店「${store.name}」于 ${authAt.toISOString()} 完成授权`,
    refType: 'Store', refId: store.id,
  })

  return { status: 'PROCESSED' }
}
