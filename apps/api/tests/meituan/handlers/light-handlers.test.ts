import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@dianjie/db'
import { handleVoucherEnable } from '../../../src/services/meituan/handlers/voucher-enable'
import { handleShopAuth } from '../../../src/services/meituan/handlers/shop-auth'
import { handleVoucherSettings } from '../../../src/services/meituan/handlers/voucher-settings'
import { handleAuditRejected } from '../../../src/services/meituan/handlers/audit-rejected'

let testStoreId: string
let testTenantId: string

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('需要 tenant')
  testTenantId = tenant.id
  let store = await prisma.store.findFirst({ where: { meituanShopId: 'LIGHT_SHOP' } })
  if (!store) {
    store = await prisma.store.create({
      data: { tenantId: testTenantId, no: 'LIGHT', name: 'Light Test', meituanShopId: 'LIGHT_SHOP' },
    })
  }
  testStoreId = store.id
})

describe('handleVoucherEnable (110011)', () => {
  it('updates Store.meituanVoucherEnabled to true', async () => {
    await handleVoucherEnable({ ePoiId: 'LIGHT_SHOP', message: { isOpen: true } })
    const store = await prisma.store.findUnique({ where: { id: testStoreId } })
    expect(store!.meituanVoucherEnabled).toBe(true)
  })

  it('updates to false', async () => {
    await handleVoucherEnable({ ePoiId: 'LIGHT_SHOP', message: { isOpen: false } })
    const store = await prisma.store.findUnique({ where: { id: testStoreId } })
    expect(store!.meituanVoucherEnabled).toBe(false)
  })

  it('throws if shop not found', async () => {
    await expect(
      handleVoucherEnable({ ePoiId: 'GHOST', message: { isOpen: true } }),
    ).rejects.toThrow(/未匹配门店/)
  })
})

describe('handleShopAuth (110019)', () => {
  it('updates meituanLastAuthAt', async () => {
    const result = await handleShopAuth({
      message: { vendorShopId: 'LIGHT_SHOP', type: 1, time: '2026-05-13 10:00:00' },
    })
    expect(result.status).toBe('PROCESSED')
    const store = await prisma.store.findUnique({ where: { id: testStoreId } })
    expect(store!.meituanLastAuthAt).toBeTruthy()
  })

  it('returns FAILED when shop not found (data integrity warning)', async () => {
    const result = await handleShopAuth({
      message: { vendorShopId: 'GHOST_SHOP', type: 1 },
    })
    expect(result.status).toBe('FAILED')
  })
})

describe('handleVoucherSettings (110021)', () => {
  it('logs + notifies but no schema write (IGNORED status)', async () => {
    const result = await handleVoucherSettings({
      message: { poiId: 999, changes: ['voucher_min_amount'], operateTime: 1000 },
    })
    expect(result.status).toBe('IGNORED')
  })
})

describe('handleAuditRejected (110027)', () => {
  it('returns IGNORED with reject reason logged', async () => {
    const result = await handleAuditRejected({
      message: {
        scope: 1, vendorChainId: 'HQ001',
        auditMessage: { subjectType: 10, subjectId: 'SPU_001', rejectReason: '敏感词' },
      },
    })
    expect(result.status).toBe('IGNORED')
  })
})
