/**
 * 美团 webhook 消息解析
 *
 * 美团推送是 application/x-www-form-urlencoded，需要先按 form 解 → 拿 params；
 * 然后 params.message 字段又是 url-encoded 的 JSON 字符串，再解一次。
 */

/**
 * 把 form-urlencoded body 解成 Record<string, string>。
 * 同名 key 取最后值；空 body 返空对象。
 */
export function parseFormUrlencoded(body: string): Record<string, string> {
  if (!body) return {}
  const result: Record<string, string> = {}
  for (const segment of body.split('&')) {
    if (!segment) continue
    const eqIdx = segment.indexOf('=')
    if (eqIdx < 0) continue
    const k = decodeURIComponent(segment.slice(0, eqIdx))
    const v = decodeURIComponent(segment.slice(eqIdx + 1))
    result[k] = v
  }
  return result
}

/**
 * 解析 message 字段的 JSON。失败返 null（不抛错）。
 */
export function parseMessageJson(messageStr: string): unknown {
  if (!messageStr) return null
  try {
    return JSON.parse(messageStr)
  } catch {
    return null
  }
}
