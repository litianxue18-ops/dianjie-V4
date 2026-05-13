/**
 * 美团 webhook 签名验证（可插拔）
 *
 * 默认实现 StandardMeituanSignature 按业内通用规则:
 *   - 取除 sign 外所有参数
 *   - 按 key 字典序排序
 *   - 拼接 key1=val1&key2=val2&...
 *   - 末尾追加 appSecret
 *   - SHA1 → 40 字符 hex
 *
 * ⚠️ TODO: 待美团 BD 提供权威签名规则文档后核对此实现
 *           联调时如果 sign 验证全失败，唯一需要改的就是这一个文件
 */
import crypto from 'crypto'

export interface SignatureVerifier {
  verify(params: Record<string, string>, expectedSign: string): boolean
}

export class StandardMeituanSignature implements SignatureVerifier {
  constructor(private appSecret: string) {}

  verify(params: Record<string, string>, expectedSign: string): boolean {
    if (!expectedSign || expectedSign.length !== 40) return false

    const sorted = Object.keys(params)
      .filter(k => k !== 'sign')
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&')

    const computed = crypto.createHash('sha1')
      .update(sorted + this.appSecret)
      .digest('hex')

    // timingSafeEqual 防 timing attack；长度不匹配会抛，外层已经过滤
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(expectedSign, 'hex'),
      )
    } catch {
      return false
    }
  }
}

let _verifier: SignatureVerifier | null = null

export function getVerifier(): SignatureVerifier {
  if (!_verifier) {
    const secret = process.env.MEITUAN_APP_SECRET
    if (!secret) {
      throw new Error('MEITUAN_APP_SECRET 未配置')
    }
    _verifier = new StandardMeituanSignature(secret)
  }
  return _verifier
}

// for tests: 重置 cached verifier
export function _resetVerifier() {
  _verifier = null
}
