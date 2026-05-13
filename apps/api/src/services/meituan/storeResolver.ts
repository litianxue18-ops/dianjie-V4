/**
 * 每个 msgType 的 shopId 字段位置不统一，统一通过 extractShopId 解出来再查 Store。
 *
 * 来源对照表（spec §5.1.1）:
 *   110009 / 110011  -> 外层 params.ePoiId
 *   110019 / 110029  -> 内层 message.vendorShopId
 *   110021           -> 内层 message.poiId（long, 转 string）
 *   110027 scope=2   -> 内层 message.vendorShopId
 *   110027 scope=1   -> 没有门店（总部级），返 null
 */
import { prisma } from '@dianjie/db'
import type { Store } from '@dianjie/db'

export function extractShopId(
  msgType: number,
  outerEPoiId: string | null,
  message: any,
): string | null {
  switch (msgType) {
    case 110009:
    case 110011:
      return outerEPoiId || null

    case 110019:
    case 110029:
      return typeof message?.vendorShopId === 'string' ? message.vendorShopId : null

    case 110021:
      if (message?.poiId == null) return null
      return String(message.poiId)

    case 110027:
      if (message?.scope === 2 && typeof message.vendorShopId === 'string') {
        return message.vendorShopId
      }
      return null

    default:
      return null
  }
}

/**
 * 把 shopId 转成本地 Store 记录。找不到返 null。
 */
export async function findStoreByShopId(shopId: string): Promise<Store | null> {
  if (!shopId) return null
  return prisma.store.findFirst({ where: { meituanShopId: shopId } })
}
