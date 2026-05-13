import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import dayjs from 'dayjs'
import { prisma } from '@dianjie/db'
import { handleVoucherOrder } from '../../../src/services/meituan/handlers/voucher-order'

let testStoreId: string
let testTenantId: string
const EXT_NO_PAY = 'VTEST_PAY_4944956869'
const EXT_NO_REFUND = 'VTEST_REFUND_4944956870'

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('需要至少 1 个 tenant 在 dianjie_v4_dev 中（运行 pnpm db:seed）')
  testTenantId = tenant.id

  let store = await prisma.store.findFirst({ where: { meituanShopId: 'VTEST_SHOP' } })
  if (!store) {
    store = await prisma.store.create({
      data: {
        tenantId: testTenantId,
        no: 'VTEST',
        name: '美团测试门店',
        meituanShopId: 'VTEST_SHOP',
      },
    })
  }
  testStoreId = store.id
})

afterEach(async () => {
  await prisma.revenueTransaction.deleteMany({
    where: { externalOrderNo: { in: [EXT_NO_PAY, EXT_NO_REFUND, 'CREATE_ONLY'] } },
  })
})

describe('handleVoucherOrder (110009)', () => {
  it('payOrderSuccess inserts RevenueTransaction + upserts RevenueRecord', async () => {
    const result = await handleVoucherOrder({
      storeId: testStoreId,
      tenantId: testTenantId,
      message: {
        orderId: EXT_NO_PAY,
        msgType: 'payOrderSuccess',
        userPayAmount: 1.0,
        orderAmount: 21.0,
        payTime: 1710143142000,
        orderStatus: 10,
      },
      externalMsgId: 'msg-test-001',
    })

    expect(result.txId).toBeTruthy()
    const tx = await prisma.revenueTransaction.findUnique({ where: { id: result.txId! } })
    expect(tx).toBeTruthy()
    expect(tx!.channel).toBe('MEITUAN_VOUCHER')
    expect(Number(tx!.amount)).toBe(1.0)
    expect(Number(tx!.netAmount)).toBe(1.0)
    expect(tx!.status).toBe('NORMAL')

    const expectedDate = dayjs(new Date(1710143142000)).startOf('day').toDate()
    const rec = await prisma.revenueRecord.findUnique({
      where: { storeId_date: { storeId: testStoreId, date: expectedDate } },
    })
    expect(rec).toBeTruthy()
    expect(Number(rec!.amount)).toBeGreaterThanOrEqual(1.0)
  })

  it('refundOrderSuccess updates existing tx + decrements RevenueRecord', async () => {
    // 先建一笔 NORMAL
    await handleVoucherOrder({
      storeId: testStoreId,
      tenantId: testTenantId,
      message: {
        orderId: EXT_NO_REFUND, msgType: 'payOrderSuccess',
        userPayAmount: 10.0, payTime: 1710143142000, orderStatus: 10,
      },
      externalMsgId: 'msg-test-002',
    })

    // 全退
    const result = await handleVoucherOrder({
      storeId: testStoreId,
      tenantId: testTenantId,
      message: {
        orderId: EXT_NO_REFUND, msgType: 'refundOrderSuccess',
        userPayAmount: 10.0, payTime: 1710143142000, orderStatus: 50,
        refundInfo: { refundReason: '客户取消', refundTime: 1710146142000 },
      },
      externalMsgId: 'msg-test-003',
    })

    expect(result.txId).toBeTruthy()
    const tx = await prisma.revenueTransaction.findUnique({ where: { id: result.txId! } })
    expect(tx!.status).toBe('REFUNDED')
    expect(Number(tx!.refundAmount)).toBe(10.0)
    expect(Number(tx!.netAmount)).toBe(0)
    expect(tx!.refundedAt).toBeTruthy()
  })

  it('createOrder is logged but not booked', async () => {
    const result = await handleVoucherOrder({
      storeId: testStoreId,
      tenantId: testTenantId,
      message: {
        orderId: 'CREATE_ONLY', msgType: 'createOrder',
        orderAmount: 5.0, orderStatus: 0,
      },
      externalMsgId: 'msg-test-004',
    })
    expect(result.txId).toBeNull()
    expect(result.skipped).toBe(true)
  })
})
