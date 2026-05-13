import { describe, it, expect } from 'vitest'
import { StandardMeituanSignature } from '../../src/services/meituan/signature'
import crypto from 'crypto'

describe('StandardMeituanSignature', () => {
  const appSecret = 'test_secret_abc123'
  const verifier = new StandardMeituanSignature(appSecret)

  function computeExpected(params: Record<string, string>): string {
    const sorted = Object.keys(params)
      .filter(k => k !== 'sign')
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&')
    return crypto.createHash('sha1').update(sorted + appSecret).digest('hex')
  }

  it('verifies a correctly-signed payload', () => {
    const params = {
      msgType: '110009',
      developerId: '123456',
      businessId: '1',
      msgId: 'msg-001',
      timestamp: '1711592316',
      message: '{"orderId":1234}',
    }
    const sign = computeExpected(params)
    expect(verifier.verify(params, sign)).toBe(true)
  })

  it('rejects a tampered payload (wrong sign)', () => {
    const params = { msgType: '110009', timestamp: '1', message: 'x' }
    expect(verifier.verify(params, 'deadbeef'.repeat(5))).toBe(false)
  })

  it('rejects a tampered payload (wrong field)', () => {
    const params: Record<string, string> = { msgType: '110009', timestamp: '1', message: 'x' }
    const sign = computeExpected(params)
    params.message = 'tampered'
    expect(verifier.verify(params, sign)).toBe(false)
  })

  it('handles SHA1 length mismatch without crashing', () => {
    const params = { msgType: '1', message: 'x' }
    expect(verifier.verify(params, 'short')).toBe(false)
    expect(verifier.verify(params, '')).toBe(false)
  })
})
