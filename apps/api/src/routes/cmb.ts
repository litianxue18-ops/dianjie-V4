/**
 * 招行实时账户接口（前端 → api → cmb 微服务转发）
 * 权限: ADMIN / FINANCE / SUPER_ADMIN
 * 文档: docs/cmb/2026-05-13-招行BB1PAY-报文规范.md
 *
 * GET  /api/cmb/balance?account=          余额查询 NTQACINF
 * POST /api/cmb/transactions               交易明细 trsQryByBreakPoint
 * POST /api/cmb/receipt                    电子回单 DCSIGREC
 */
import type { FastifyPluginAsync } from 'fastify'
import {
  cmbBalance,
  cmbTransactions,
  cmbReceipt,
  cmbHealthCheck,
} from '../services/cmbPayment'

const auth = (app: any) => ({ preHandler: [app.authenticate] })
const ROLES_OK = new Set(['ADMIN', 'FINANCE', 'SUPER_ADMIN'])

function requireFinance(req: any, reply: any): boolean {
  if (!ROLES_OK.has(req.user?.role)) {
    reply.status(403).send({ error: '需要 ADMIN / FINANCE 权限' })
    return false
  }
  return true
}

export const cmbRoutes: FastifyPluginAsync = async (app) => {

  // 健康 / 在线状态（不返钱相关数据，给前端探活用）
  app.get('/status', auth(app), async (req: any, reply: any) => {
    if (!requireFinance(req, reply)) return
    const online = await cmbHealthCheck()
    return { online }
  })

  // 余额
  app.get('/balance', auth(app), async (req: any, reply: any) => {
    if (!requireFinance(req, reply)) return
    const { account } = req.query as { account?: string }
    try {
      return await cmbBalance(account || undefined)
    } catch (e: any) {
      return reply.status(502).send({ success: false, resultCode: 'CMB_UPSTREAM_ERROR', resultMsg: e.message })
    }
  })

  // 交易明细（对账）
  app.post('/transactions', auth(app), async (req: any, reply: any) => {
    if (!requireFinance(req, reply)) return
    const { account, beginDate, endDate } = (req.body || {}) as {
      account?: string; beginDate?: string; endDate?: string
    }
    try {
      return await cmbTransactions({ account, beginDate, endDate })
    } catch (e: any) {
      return reply.status(502).send({ success: false, resultCode: 'CMB_UPSTREAM_ERROR', resultMsg: e.message })
    }
  })

  // 电子回单 PDF (返 base64 给前端 → 浏览器 blob 下载)
  app.post('/receipt', auth(app), async (req: any, reply: any) => {
    if (!requireFinance(req, reply)) return
    const { account, yurRef, date, sequence } = (req.body || {}) as {
      account?: string; yurRef: string; date: string; sequence: string
    }
    if (!yurRef || !date || !sequence) {
      return reply.status(400).send({ error: '缺少 yurRef / date / sequence' })
    }
    try {
      return await cmbReceipt({ account, yurRef, date, sequence })
    } catch (e: any) {
      return reply.status(502).send({ success: false, resultCode: 'CMB_UPSTREAM_ERROR', resultMsg: e.message })
    }
  })
}
