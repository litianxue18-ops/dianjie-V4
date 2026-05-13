/**
 * POST /api/webhooks/meituan
 *
 * 美团 webhook 入口:
 *   1. 验签
 *   2. 解 message JSON
 *   3. 落 MeituanRawMessage (msgId unique 防重放)
 *   4. 110029 同步快路径返 data.vendorOrderId
 *      其他 5 种 setImmediate 异步处理
 *   5. 永远返 code:0 (除非验签/格式错), 业务失败靠 raw 表 status 后台重放
 *
 * 重要: 本路由不走 jwt; idempotency 中间件依赖 Idempotency-Key header (美团不发, 自然跳过);
 *       rate-limit 通过 routeOptions.config.rateLimit=false 显式关掉。
 */
import type { FastifyPluginAsync } from 'fastify'
import * as Sentry from '@sentry/node'
import { getVerifier } from '../../services/meituan/signature'
import { parseMessageJson } from '../../services/meituan/parser'
import { createRawMessage } from '../../services/meituan/rawMessage'
import { processSync, processAsync } from '../../services/meituan/processor'

interface MeituanWebhookBody {
  msgType?: string
  timestamp?: string
  sign?: string
  developerId?: string
  businessId?: string
  msgId?: string
  message?: string
  ePoiId?: string
  opBizCode?: string
  [k: string]: string | undefined
}

export const meituanWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: MeituanWebhookBody }>(
    '/meituan',
    {
      config: { rateLimit: false },
    },
    async (req, reply) => {
      if (process.env.MEITUAN_PROCESSING_ENABLED !== 'true') {
        return reply.send({ code: 0, message: 'success (processing disabled)' })
      }

      const params = (req.body || {}) as Record<string, string>

      // ── 1. 验签 ───────────────────────────────────────
      const sign = params.sign
      if (!sign) {
        return reply.code(401).send({ code: -1, message: 'sign missing' })
      }
      try {
        const verifier = getVerifier()
        if (!verifier.verify(params, sign)) {
          req.log.warn({ msgId: params.msgId, msgType: params.msgType }, 'meituan sig invalid')
          return reply.code(401).send({ code: -1, message: 'signature invalid' })
        }
      } catch (err) {
        Sentry.captureException(err)
        return reply.code(500).send({ code: -3, message: 'verifier init error' })
      }

      // ── 2. 解 message ───────────────────────────────
      if (!params.msgId || !params.msgType || !params.timestamp || !params.message) {
        return reply.code(400).send({ code: -2, message: 'required params missing' })
      }
      const messageJson = parseMessageJson(params.message)
      if (messageJson === null) {
        return reply.code(400).send({ code: -2, message: 'message json invalid' })
      }

      // ── 3. 落 raw 表（unique 防重放）──────────────────
      const msgType = Number(params.msgType)
      const created = await createRawMessage({
        msgId: params.msgId,
        msgType,
        developerId: Number(params.developerId || 0),
        businessId: Number(params.businessId || 0),
        ePoiId: params.ePoiId || null,
        opBizCode: params.opBizCode || null,
        msgTimestamp: BigInt(params.timestamp),
        rawHeaders: req.headers as any,
        rawBody: serializeFormUrlencoded(params),
        rawMessage: messageJson as any,
      }).catch(err => {
        req.log.error({ err, msgId: params.msgId }, 'meituan rawMessage insert fail')
        Sentry.captureException(err)
        return undefined
      })

      if (created === undefined) {
        return reply.code(500).send({ code: -4, message: 'storage error, please retry' })
      }
      if (created === null) {
        // msgId 重放
        return reply.send({ code: 0, message: 'success' })
      }

      // ── 4. 110029 同步快路径 ──────────────────────────
      if (msgType === 110029) {
        try {
          const result = await processSync(created.id)
          if (result.ok && result.vendorOrderId) {
            return reply.send({
              code: 0, message: 'success',
              data: { vendorOrderId: result.vendorOrderId, orderNo: result.orderNo },
            })
          }
          return reply.send({ code: 0, message: 'success', data: {} })
        } catch (err) {
          Sentry.captureException(err)
          return reply.send({ code: 0, message: 'success', data: {} })
        }
      }

      // ── 5. 其他 msgType 异步处理 ──────────────────────
      reply.send({ code: 0, message: 'success' })
      setImmediate(() => {
        processAsync(created.id).catch(err => {
          req.log.error({ err, msgId: params.msgId }, 'meituan async process fail')
        })
      })
    },
  )
}

function serializeFormUrlencoded(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&')
}
