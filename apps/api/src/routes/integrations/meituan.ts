/**
 * 美团接入管理 API (ADMIN / FINANCE 权限)
 *
 * GET  /api/integrations/meituan/status                 最近 7 天聚合 + 门店状态
 * GET  /api/integrations/meituan/messages               raw 消息列表 (筛选)
 * GET  /api/integrations/meituan/messages/:id           单条详情
 * POST /api/integrations/meituan/messages/:id/replay    重放 FAILED 消息
 * GET  /api/integrations/meituan/transactions           RevenueTransaction 列表
 */
import type { FastifyPluginAsync } from 'fastify'
import dayjs from 'dayjs'
import { prisma } from '@dianjie/db'
import { resetForReplay } from '../../services/meituan/rawMessage'
import { processAsync, processSync } from '../../services/meituan/processor'

const auth = (app: any) => ({ preHandler: [app.authenticate] })
const ROLES_OK = new Set(['ADMIN', 'FINANCE', 'SUPER_ADMIN'])

function requireRole(req: any, reply: any): boolean {
  if (!ROLES_OK.has(req.user?.role)) {
    reply.status(403).send({ error: '需要 ADMIN / FINANCE 权限' })
    return false
  }
  return true
}

export const meituanIntegrationRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /status ─────────────────────────────────
  app.get('/status', auth(app), async (req: any, reply: any) => {
    if (!requireRole(req, reply)) return

    const sevenDaysAgo = dayjs().subtract(7, 'day').toDate()

    const [stores, msgCounts, txTotals, lastRaw] = await Promise.all([
      prisma.store.findMany({
        where: { tenantId: req.user.tenantId, meituanShopId: { not: null } },
        select: {
          id: true, name: true, meituanShopId: true,
          meituanVoucherEnabled: true, meituanLastAuthAt: true,
        },
      }),
      prisma.meituanRawMessage.groupBy({
        by: ['msgType', 'status'],
        _count: true,
        where: { receivedAt: { gte: sevenDaysAgo } },
      }),
      prisma.revenueTransaction.groupBy({
        by: ['channel'],
        _sum: { netAmount: true },
        _count: true,
        where: {
          tenantId: req.user.tenantId,
          channel: { in: ['MEITUAN_VOUCHER', 'MEITUAN_ORDER'] },
          paidAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.meituanRawMessage.findFirst({
        orderBy: { receivedAt: 'desc' }, select: { receivedAt: true },
      }),
    ])

    return {
      stores,
      msgCounts7d: msgCounts,
      revenueByChannel7d: txTotals,
      lastReceivedAt: lastRaw?.receivedAt || null,
    }
  })

  // ── GET /messages ───────────────────────────────
  app.get('/messages', auth(app), async (req: any, reply: any) => {
    if (!requireRole(req, reply)) return

    const { msgType, status, page = '1', pageSize = '20' } = req.query as any
    const where: any = {}
    if (msgType) where.msgType = Number(msgType)
    if (status) where.status = status

    const p = Math.max(1, parseInt(page))
    const ps = Math.min(100, Math.max(1, parseInt(pageSize)))

    const [items, total] = await Promise.all([
      prisma.meituanRawMessage.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
        select: {
          id: true, msgId: true, msgType: true,
          status: true, receivedAt: true, processedAt: true,
          failReason: true, retryCount: true, resultTxId: true,
        },
      }),
      prisma.meituanRawMessage.count({ where }),
    ])

    return { items, total, page: p, pageSize: ps }
  })

  // ── GET /messages/:id ───────────────────────────
  app.get('/messages/:id', auth(app), async (req: any, reply: any) => {
    if (!requireRole(req, reply)) return
    const m = await prisma.meituanRawMessage.findUnique({ where: { id: req.params.id } })
    if (!m) return reply.status(404).send({ error: 'not found' })
    return m
  })

  // ── POST /messages/:id/replay ────────────────────
  app.post('/messages/:id/replay', auth(app), async (req: any, reply: any) => {
    if (!requireRole(req, reply)) return

    const raw = await resetForReplay(req.params.id)
    if (!raw) {
      return reply.status(400).send({ error: '消息不存在或不在 FAILED 状态' })
    }

    if (raw.msgType === 110029) {
      const r = await processSync(raw.id)
      return r
    }
    await processAsync(raw.id)
    return { ok: true, message: 'replay 已触发（异步处理中）' }
  })

  // ── GET /transactions ───────────────────────────
  app.get('/transactions', auth(app), async (req: any, reply: any) => {
    if (!requireRole(req, reply)) return

    const { channel, storeId, from, to, page = '1', pageSize = '20' } = req.query as any
    const where: any = { tenantId: req.user.tenantId }
    if (channel) where.channel = channel
    if (storeId) where.storeId = storeId
    if (from || to) {
      where.paidAt = {}
      if (from) where.paidAt.gte = new Date(from)
      if (to) where.paidAt.lte = new Date(to)
    }

    const p = Math.max(1, parseInt(page))
    const ps = Math.min(100, Math.max(1, parseInt(pageSize)))

    const [items, total] = await Promise.all([
      prisma.revenueTransaction.findMany({
        where, orderBy: { paidAt: 'desc' },
        skip: (p - 1) * ps, take: ps,
      }),
      prisma.revenueTransaction.count({ where }),
    ])

    return { items, total, page: p, pageSize: ps }
  })
}
