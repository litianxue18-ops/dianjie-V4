import { describe, it, expect } from 'vitest'
import { extractShopId } from '../../src/services/meituan/storeResolver'

describe('extractShopId', () => {
  it('110009 reads from outer ePoiId', () => {
    expect(extractShopId(110009, 'STORE001', { orderId: 1 })).toBe('STORE001')
    expect(extractShopId(110009, null, { orderId: 1 })).toBeNull()
  })

  it('110011 reads from outer ePoiId', () => {
    expect(extractShopId(110011, 'STORE001', { isOpen: true })).toBe('STORE001')
  })

  it('110029 reads from inner vendorShopId', () => {
    expect(extractShopId(110029, null, { vendorShopId: 'STORE002' } as any)).toBe('STORE002')
  })

  it('110019 reads from inner vendorShopId', () => {
    expect(extractShopId(110019, null, { vendorShopId: 'STORE003' } as any)).toBe('STORE003')
  })

  it('110021 reads from poiId (long → string)', () => {
    expect(extractShopId(110021, null, { poiId: 12345 } as any)).toBe('12345')
  })

  it('110027 scope=2 reads from vendorShopId', () => {
    expect(extractShopId(110027, null, { scope: 2, vendorShopId: 'SHOP01' } as any)).toBe('SHOP01')
  })

  it('110027 scope=1 returns null (tenant-level, no shop)', () => {
    expect(extractShopId(110027, null, { scope: 1, vendorChainId: 'HQ001' } as any)).toBeNull()
  })

  it('unknown msgType returns null', () => {
    expect(extractShopId(999999, 'X', {} as any)).toBeNull()
  })
})
