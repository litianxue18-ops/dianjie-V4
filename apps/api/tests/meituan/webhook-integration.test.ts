import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import Fastify from 'fastify'
import formbody from '@fastify/formbody'
import crypto from 'crypto'
import { prisma } from '@dianjie/db'
import { meituanWebhookRoutes } from '../../src/routes/webhooks/meituan'
import { _resetVerifier } from '../../src/services/meituan/signature'

const APP_SECRET = 'integration_test_secret'
const DEVELOPER_ID = '999999'

let app: ReturnType<typeof Fastify>
let testStoreId: string
let testTenantId: string

function buildSignedBody(params: Record<string, string>): string {
  const toSign = Object.keys(params)
    .filter(k => k !== 'sign')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
  const sign = crypto.createHash('sha1').update(toSign + APP_SECRET).digest('hex')
  return Object.entries({ ...params, sign })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

beforeAll(async () => {
  process.env.MEITUAN_APP_SECRET = APP_SECRET
  process.env.MEITUAN_PROCESSING_ENABLED = 'true'
  _resetVerifier()

  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('需要 tenant')
  testTenantId = tenant.id
  let store = await prisma.store.findFirst({ where: { meituanShopId: 'WHTEST_SHOP' } })
  if (!store) {
    store = await prisma.store.create({
      data: { tenantId: testTenantId, no: 'WHTEST', name: 'Webhook Test', meituanShopId: 'WHTEST_SHOP' },
    })
  }
  testStoreId = store.id

  app = Fastify()
  await app.register(formbody)
  await app.register(meituanWebhookRoutes, { prefix: '/api/webhooks' })
  await app.ready()
})

afterEach(async () => {
  await prisma.meituanRawMessage.deleteMany({ where: { msgId: { startsWith: 'WHTEST_' } } })
  await prisma.revenueTransaction.deleteMany({ where: { externalOrderNo: { startsWith: 'WHTEST_' } } })
})

describe('POST /api/webhooks/meituan', () => {
  it('401 when sign missing', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/webhooks/meituan',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'msgType=110009',
    })
    expect(resp.statusCode).toBe(401)
  })

  it('401 when sign incorrect', async () => {
    const resp = await app.inject({
      method: 'POST',
      url: '/api/webhooks/meituan',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'msgType=110009&timestamp=1&developerId=1&businessId=1&msgId=WHTEST_X&message=%7B%7D&sign=' + 'a'.repeat(40),
    })
    expect(resp.statusCode).toBe(401)
  })

  it('110029 sync path returns vendorOrderId on success', async () => {
    const message = JSON.stringify({
      orderId: 'WHTEST_29_OK', vendorShopId: 'WHTEST_SHOP',
      platform: 10, orderType: 1,
      totalPrice: 1000, payPrice: 880, vendorBillPrice: 800,
      vendorDiscountPrice: 200,
      orderTime: 1700000000000, payTime: 1700000060000, bizType: 10,
      smartOrderDTO: {},
    })
    const body = buildSignedBody({
      msgType: '110029', timestamp: '1700000000',
      developerId: DEVELOPER_ID, businessId: '1',
      msgId: 'WHTEST_29_OK',
      message,
    })
    const resp = await app.inject({
      method: 'POST',
      url: '/api/webhooks/meituan',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: body,
    })
    expect(resp.statusCode).toBe(200)
    const json = JSON.parse(resp.body)
    expect(json.code).toBe(0)
    expect(json.data?.vendorOrderId).toBeTruthy()

    const raw = await prisma.meituanRawMessage.findUnique({ where: { msgId: 'WHTEST_29_OK' } })
    expect(raw?.status).toBe('PROCESSED')
  })

  it('msgId duplicate returns success without re-processing', async () => {
    const message = JSON.stringify({
      orderId: 'WHTEST_29_DUP', vendorShopId: 'WHTEST_SHOP',
      platform: 10, orderType: 1, totalPrice: 100, payPrice: 100,
      vendorBillPrice: 100, vendorDiscountPrice: 0,
      orderTime: 1, payTime: 1, bizType: 10, smartOrderDTO: {},
    })
    const body = buildSignedBody({
      msgType: '110029', timestamp: '1', developerId: DEVELOPER_ID,
      businessId: '1', msgId: 'WHTEST_29_DUP', message,
    })

    const r1 = await app.inject({
      method: 'POST', url: '/api/webhooks/meituan',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: body,
    })
    expect(r1.statusCode).toBe(200)

    const r2 = await app.inject({
      method: 'POST', url: '/api/webhooks/meituan',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: body,
    })
    expect(r2.statusCode).toBe(200)
    expect(JSON.parse(r2.body).code).toBe(0)

    const count = await prisma.meituanRawMessage.count({ where: { msgId: 'WHTEST_29_DUP' } })
    expect(count).toBe(1)
  })

  it('110009 async path returns success and falls through setImmediate', async () => {
    const message = JSON.stringify({
      orderId: 'WHTEST_09_PAY', msgType: 'payOrderSuccess',
      userPayAmount: 5.0, payTime: 1700000000000, orderStatus: 10,
    })
    const body = buildSignedBody({
      msgType: '110009', timestamp: '1', developerId: DEVELOPER_ID,
      businessId: '1', msgId: 'WHTEST_09_PAY',
      ePoiId: 'WHTEST_SHOP', message,
    })
    const resp = await app.inject({
      method: 'POST', url: '/api/webhooks/meituan',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: body,
    })
    expect(resp.statusCode).toBe(200)
    expect(JSON.parse(resp.body).code).toBe(0)

    // 等 setImmediate 跑完
    await new Promise(r => setTimeout(r, 500))
    const raw = await prisma.meituanRawMessage.findUnique({ where: { msgId: 'WHTEST_09_PAY' } })
    expect(raw?.status).toBe('PROCESSED')
  })
})
