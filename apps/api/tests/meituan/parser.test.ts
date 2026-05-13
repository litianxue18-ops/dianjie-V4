import { describe, it, expect } from 'vitest'
import { parseFormUrlencoded, parseMessageJson } from '../../src/services/meituan/parser'

describe('parseFormUrlencoded', () => {
  it('parses simple key=value pairs', () => {
    const result = parseFormUrlencoded('msgType=110009&timestamp=1711592316')
    expect(result).toEqual({ msgType: '110009', timestamp: '1711592316' })
  })

  it('url-decodes values', () => {
    const result = parseFormUrlencoded('message=%7B%22orderId%22%3A123%7D')
    expect(result.message).toBe('{"orderId":123}')
  })

  it('handles empty body gracefully', () => {
    expect(parseFormUrlencoded('')).toEqual({})
  })

  it('preserves repeated keys as last value', () => {
    expect(parseFormUrlencoded('a=1&a=2')).toEqual({ a: '2' })
  })
})

describe('parseMessageJson', () => {
  it('parses valid JSON', () => {
    expect(parseMessageJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('returns null on invalid JSON', () => {
    expect(parseMessageJson('not json')).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseMessageJson('')).toBeNull()
  })
})
