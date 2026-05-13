import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma } from '@dianjie/db'
import { handleOrderPaid } from '../../../src/services/meituan/handlers/order-paid'

let testStoreId: string
let testTenantId: string
const EXT_NO = 'OTEST_12233'

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('需要至少 1 个 tenant 在 dianjie_v4_dev')
  testTenantId = tenant.id

  let store = await prisma.store.findFirst({ where: { meituanShopId: 'OTEST_SHOP' } })
  if (!store) {
    store = await prisma.store.create({
      data: {
        tenantId: testTenantId,
        no: 'OTEST',
        name: '美团订单测试门店',
        meituanShopId: 'OTEST_SHOP',
      },
    })
  }
  testStoreId = store.id
})

afterEach(async () => {
  await prisma.revenueTransaction.deleteMany({ where: { externalOrderNo: { in: [EXT_NO, 'NO_STORE_ORDER'] } } })
})

describe('handleOrderPaid (110029)', () => {
  it('inserts RevenueTransaction with payPrice/100, returns vendorOrderId', async () => {
    const result = await handleOrderPaid({
      message: {
        orderId: EXT_NO,
        vendorShopId: 'OTEST_SHOP',
        platform: 10,
        orderType: 1,
        totalPrice: 10000,
        payPrice: 8800,
        vendorBillPrice: 8000,
        vendorDiscountPrice: 1200,
        orderTime: 1700000000000,
        payTime: 1700000060000,
        bizType: 10,
        smartOrderDTO: {},
      },
      externalMsgId: 'msg-test-100',
    })

    expect(result.code).toBe(0)
    expect(result.data?.vendorOrderId).toBeTruthy()

    const tx = await prisma.revenueTransaction.findUnique({
      where: { id: result.data!.vendorOrderId },
    })
    expect(tx).toBeTruthy()
    expect(tx!.channel).toBe('MEITUAN_ORDER')
    expect(Number(tx!.amount)).toBe(88.0)
    expect(Number(tx!.netAmount)).toBe(88.0)
  })

  it('returns code=1 when vendorShopId not found', async () => {
    const result = await handleOrderPaid({
      message: {
        orderId: 'NO_STORE_ORDER',
        vendorShopId: 'NONEXISTENT_SHOP',
        platform: 10, orderType: 1,
        totalPrice: 100, payPrice: 100, vendorBillPrice: 100,
        vendorDiscountPrice: 0,
        orderTime: 1, payTime: 1, bizType: 10,
        smartOrderDTO: {},
      },
      externalMsgId: 'msg-test-101',
    })
    expect(result.code).toBe(1)
    expect(result.message).toContain('unknown vendorShopId')
  })
})
