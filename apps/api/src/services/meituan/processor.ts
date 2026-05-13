/**
 * 业务处理路由器: 按 msgType 调对应 handler，统一错误处理 + 状态变更
 *
 * 关键行为:
 *   - processSync(rawId): 同步执行，返业务结果（给 110029 的 webhook 响应用）
 *   - processAsync(rawId): setImmediate 包装，吞所有错误（仅日志+Sentry）
 *   - 任一异常 → status=FAILED + 通知 ADMIN，靠管理 API 重放修复
 */
import * as Sentry from '@sentry/node'
import { prisma } from '@dianjie/db'
import { markStatus } from './rawMessage'
import { extractShopId, findStoreByShopId } from './storeResolver'
import { MESSAGE_SCHEMAS } from './types'
import { sendNotification } from '../notification'
import { handleVoucherOrder } from './handlers/voucher-order'
import { handleOrderPaid } from './handlers/order-paid'
import { handleVoucherEnable } from './handlers/voucher-enable'
import { handleShopAuth } from './handlers/shop-auth'
import { handleVoucherSettings } from './handlers/voucher-settings'
import { handleAuditRejected } from './handlers/audit-rejected'

export interface ProcessSyncResult {
  ok: boolean
  vendorOrderId?: string
  orderNo?: string
  errorMessage?: string
}

/**
 * 同步处理一条 raw message（用于 110029 的 webhook 响应链路）
 * 返回业务结果, 不抛错
 */
export async function processSync(rawId: string): Promise<ProcessSyncResult> {
  const raw = await prisma.meituanRawMessage.findUnique({ where: { id: rawId } })
  if (!raw || raw.status !== 'RECEIVED') return { ok: false, errorMessage: 'not found or already processed' }

  try {
    const result = await dispatchHandler(raw)
    if (result.kind === '110029_paid') {
      await markStatus(raw.id, 'PROCESSED', null, result.txId)
      return { ok: true, vendorOrderId: result.vendorOrderId, orderNo: result.orderNo }
    }
    await markStatus(raw.id, 'PROCESSED')
    return { ok: true }
  } catch (err: any) {
    await markFailureAndNotify(raw, err)
    return { ok: false, errorMessage: err.message }
  }
}

/**
 * 异步处理一条 raw message（其他 5 个 msgType）
 * 吞所有异常 — 失败只记 status=FAILED + 通知 ADMIN
 */
export async function processAsync(rawId: string): Promise<void> {
  const raw = await prisma.meituanRawMessage.findUnique({ where: { id: rawId } })
  if (!raw || raw.status !== 'RECEIVED') return

  try {
    const result = await dispatchHandler(raw)
    switch (result.kind) {
      case 'unknown':
        await markStatus(raw.id, 'IGNORED', `unknown msgType ${raw.msgType}`)
        break
      case 'ignored':
        await markStatus(raw.id, 'IGNORED', result.reason || null)
        break
      case 'processed':
        await markStatus(raw.id, 'PROCESSED', null, result.txId || null)
        break
      case '110029_paid':
        await markStatus(raw.id, 'PROCESSED', null, result.txId)
        break
    }
  } catch (err: any) {
    await markFailureAndNotify(raw, err)
  }
}

// ── 内部 ─────────────────────────────────────────────

type HandlerResult =
  | { kind: 'processed', txId?: string | null }
  | { kind: 'ignored', reason?: string }
  | { kind: 'unknown' }
  | { kind: '110029_paid', txId: string, vendorOrderId: string, orderNo: string }

async function dispatchHandler(raw: {
  id: string
  msgId: string
  msgType: number
  ePoiId: string | null
  rawMessage: any
}): Promise<HandlerResult> {
  const schema = MESSAGE_SCHEMAS[raw.msgType]
  if (!schema) return { kind: 'unknown' }

  const parsed = schema.parse(raw.rawMessage)

  switch (raw.msgType) {
    case 110009: {
      const shopId = extractShopId(110009, raw.ePoiId, parsed)
      if (!shopId) throw new Error('110009: 缺 ePoiId / 无法解析 shopId')
      const store = await findStoreByShopId(shopId)
      if (!store) throw new Error(`110009: 未匹配门店 ePoiId=${shopId}`)
      const r = await handleVoucherOrder({
        storeId: store.id, tenantId: store.tenantId,
        message: parsed, externalMsgId: raw.msgId,
      })
      return r.skipped
        ? { kind: 'ignored', reason: `subType ${(parsed as any).msgType || 'unknown'}` }
        : { kind: 'processed', txId: r.txId }
    }

    case 110011:
      await handleVoucherEnable({ ePoiId: raw.ePoiId, message: parsed })
      return { kind: 'processed' }

    case 110019: {
      const r = await handleShopAuth({ message: parsed })
      if (r.status === 'FAILED') throw new Error('110019: 未匹配门店')
      return { kind: 'processed' }
    }

    case 110021:
      await handleVoucherSettings({ message: parsed })
      return { kind: 'ignored', reason: 'no schema mapping' }

    case 110027:
      await handleAuditRejected({ message: parsed })
      return { kind: 'ignored', reason: 'V4 has no SPU/SKU model' }

    case 110029: {
      const r = await handleOrderPaid({ message: parsed, externalMsgId: raw.msgId })
      if (r.code !== 0) throw new Error(r.message)
      return {
        kind: '110029_paid',
        txId: r.data!.vendorOrderId,
        vendorOrderId: r.data!.vendorOrderId,
        orderNo: r.data!.orderNo,
      }
    }

    default:
      return { kind: 'unknown' }
  }
}

async function markFailureAndNotify(raw: { id: string, msgId: string, msgType: number }, err: Error) {
  await markStatus(raw.id, 'FAILED', err.message).catch(() => {})

  // OpLog 需要有效 tenantId（FK 约束），用第一个 tenant 兜底
  const tenant = await prisma.tenant.findFirst({ select: { id: true } }).catch(() => null)
  if (tenant) {
    await prisma.opLog.create({
      data: {
        tenantId: tenant.id,
        action: `美团 webhook 处理失败 msgType=${raw.msgType}`,
        target: raw.msgId,
        entityType: 'MeituanRawMessage',
        metadata: { error: err.message } as any,
        isAi: true,
      },
    }).catch(() => {})

    await sendNotification({
      tenantId: tenant.id,
      recipientRole: 'ADMIN',
      type: 'MEITUAN_HANDLER_FAILED',
      title: `美团 webhook 处理失败 ${raw.msgType}`,
      body: `msgId=${raw.msgId} error=${err.message}`,
      refType: 'MeituanRawMessage',
    }).catch(() => {})
  }

  Sentry.captureException(err, { extra: { msgId: raw.msgId, msgType: raw.msgType } })
}
