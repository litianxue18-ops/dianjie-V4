import { describe, it, expect } from 'vitest'
import {
  CommonParamsSchema,
  VoucherOrderMessageSchema,
  OrderPaidMessageSchema,
  VoucherEnableMessageSchema,
  ShopAuthMessageSchema,
  VoucherSettingsMessageSchema,
  AuditRejectedMessageSchema,
} from '../../src/services/meituan/types'

describe('CommonParamsSchema', () => {
  it('accepts all required fields', () => {
    const r = CommonParamsSchema.safeParse({
      msgType: '110009', timestamp: '1711592316', sign: 'a'.repeat(40),
      developerId: '123456', businessId: '1', msgId: 'msg-001',
      message: '{}',
    })
    expect(r.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    expect(CommonParamsSchema.safeParse({ msgType: '110009' }).success).toBe(false)
  })

  it('accepts optional ePoiId / opBizCode', () => {
    const r = CommonParamsSchema.safeParse({
      msgType: '110009', timestamp: '1', sign: 'a'.repeat(40),
      developerId: '1', businessId: '1', msgId: 'm', message: '{}',
      ePoiId: 'STORE001', opBizCode: '1711591987',
    })
    expect(r.success).toBe(true)
  })
})

describe('VoucherOrderMessageSchema (110009)', () => {
  it('accepts example payload from doc', () => {
    const r = VoucherOrderMessageSchema.safeParse({
      orderId: 4944956869796271279,
      msgType: 'payOrderSuccess',
      orderAmount: 21.0,
      userPayAmount: 1.0,
      groupVoucherDiscountAmount: 20.0,
      payTime: 1710143142000,
      orderStatus: 50,
    })
    expect(r.success).toBe(true)
  })

  it('allows partial fields (all optional per doc)', () => {
    expect(VoucherOrderMessageSchema.safeParse({}).success).toBe(true)
  })
})

describe('OrderPaidMessageSchema (110029)', () => {
  it('accepts minimum required fields', () => {
    const r = OrderPaidMessageSchema.safeParse({
      platform: 10,
      orderId: 12233,
      vendorShopId: '123',
      orderType: 1,
      totalPrice: 100,
      payPrice: 88,
      vendorBillPrice: 80,
      vendorDiscountPrice: 12,
      orderTime: 1000,
      payTime: 1000,
      bizType: 10,
      smartOrderDTO: { customerCount: 1, orderStatus: 1, pickupType: 1, pickupNo: 'x', payDTOList: [] },
    })
    expect(r.success).toBe(true)
  })

  it('rejects missing vendorShopId', () => {
    const r = OrderPaidMessageSchema.safeParse({
      platform: 10, orderId: 1, orderType: 1, totalPrice: 1,
      payPrice: 1, vendorBillPrice: 1, vendorDiscountPrice: 1,
      orderTime: 1, payTime: 1, bizType: 10, smartOrderDTO: {},
    } as any)
    expect(r.success).toBe(false)
  })
})

describe('VoucherEnableMessageSchema (110011)', () => {
  it('accepts isOpen boolean', () => {
    expect(VoucherEnableMessageSchema.safeParse({ isOpen: true }).success).toBe(true)
    expect(VoucherEnableMessageSchema.safeParse({ isOpen: false }).success).toBe(true)
  })

  it('rejects non-boolean', () => {
    expect(VoucherEnableMessageSchema.safeParse({ isOpen: 'yes' }).success).toBe(false)
  })
})

describe('ShopAuthMessageSchema (110019)', () => {
  it('accepts example', () => {
    const r = ShopAuthMessageSchema.safeParse({
      vendorShopId: 'STORE001',
      type: 1,
      time: '2025-02-28 15:58:20',
    })
    expect(r.success).toBe(true)
  })
})

describe('VoucherSettingsMessageSchema (110021)', () => {
  it('accepts example', () => {
    const r = VoucherSettingsMessageSchema.safeParse({
      poiId: 123,
      changes: ['example'],
      operateTime: 1000,
    })
    expect(r.success).toBe(true)
  })
})

describe('AuditRejectedMessageSchema (110027)', () => {
  it('accepts scope=1 (tenant) without vendorShopId', () => {
    const r = AuditRejectedMessageSchema.safeParse({
      scope: 1, vendorChainId: 'HQ001',
      auditMessage: { subjectType: 10, subjectId: 'SPU_001', rejectReason: '敏感词' },
    })
    expect(r.success).toBe(true)
  })

  it('accepts scope=2 (shop) with vendorShopId', () => {
    const r = AuditRejectedMessageSchema.safeParse({
      scope: 2, vendorShopId: 'SHOP01',
      auditMessage: { subjectType: 10, subjectId: 'SPU_001', rejectReason: 'x' },
    })
    expect(r.success).toBe(true)
  })
})
