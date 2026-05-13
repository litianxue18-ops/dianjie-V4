#!/usr/bin/env node
/**
 * 美团 webhook 本地测试工具
 *
 * 用法:
 *   node scripts/meituan-test-webhook.js 110009     # 代金券买单（成功）
 *   node scripts/meituan-test-webhook.js 110009 refund  # 代金券退款
 *   node scripts/meituan-test-webhook.js 110011     # 开通代金券买单
 *   node scripts/meituan-test-webhook.js 110019     # 门店授权同步
 *   node scripts/meituan-test-webhook.js 110021     # 设置变更
 *   node scripts/meituan-test-webhook.js 110027     # 审核驳回
 *   node scripts/meituan-test-webhook.js 110029     # 新订单已支付（推荐）
 *
 * 前置:
 *   - 本地 dev 在跑 (pnpm dev)
 *   - .env 里 MEITUAN_APP_SECRET=local_dev_secret_placeholder（默认）
 *   - dianjie_v4_dev 有 store with meituanShopId='VTEST_SHOP' (跑过任何 handler 测试会自动建)
 *
 * 输出: HTTP 响应 + 提示如何看 DB
 */

const crypto = require('crypto')

const API_BASE = process.env.API_BASE || 'http://localhost:4444'
const APP_SECRET = process.env.MEITUAN_APP_SECRET || 'local_dev_secret_placeholder'
const DEVELOPER_ID = process.env.MEITUAN_DEVELOPER_ID || '999999'
const SHOP_ID = process.env.MEITUAN_TEST_SHOP_ID || 'VTEST_SHOP'

const msgType = process.argv[2] || '110029'
const variant = process.argv[3] || ''
const orderId = `DEMO_${Date.now()}`

// 6 种 msgType 的 message 体
const MESSAGES = {
  '110009': variant === 'refund' ? {
    orderId: 'PRE_PAID_TEST_001',  // 假设之前有这笔（实际测试要先跑成功支付才能 refund 匹配）
    msgType: 'refundOrderSuccess',
    userPayAmount: 5.0,
    payTime: Date.now() - 3600000,
    orderStatus: 50,
    refundInfo: { refundReason: '客户取消', refundTime: Date.now() },
  } : {
    orderId,
    msgType: 'payOrderSuccess',
    orderAmount: 21.0,
    userPayAmount: 1.0,
    groupVoucherDiscountAmount: 20.0,
    payTime: Date.now(),
    orderStatus: 10,
  },

  '110011': { isOpen: true },

  '110019': { vendorShopId: SHOP_ID, type: 1, time: new Date().toISOString().slice(0, 19).replace('T', ' ') },

  '110021': { poiId: 12345, changes: ['voucher_min_amount'], operateTime: Date.now() },

  '110027': {
    scope: 2, vendorShopId: SHOP_ID,
    auditMessage: { subjectType: 10, subjectId: 'SPU_001', rejectReason: '名称含敏感词' },
  },

  '110029': {
    orderId,
    vendorShopId: SHOP_ID,
    platform: 10,
    orderType: 1,
    totalPrice: 10000,
    payPrice: 8800,
    vendorBillPrice: 8000,
    vendorDiscountPrice: 1200,
    orderTime: Date.now() - 60000,
    payTime: Date.now(),
    bizType: 10,
    smartOrderDTO: {},
  },
}

const message = MESSAGES[msgType]
if (!message) {
  console.error(`unsupported msgType: ${msgType}`)
  process.exit(1)
}

// 公共参数
const params = {
  msgType,
  timestamp: String(Math.floor(Date.now() / 1000)),
  developerId: DEVELOPER_ID,
  businessId: '1',
  msgId: `LOCAL_TEST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  ePoiId: SHOP_ID,
  opBizCode: 'LOCAL',
  message: JSON.stringify(message),
}

// 签名
const sorted = Object.keys(params).filter(k => k !== 'sign').sort()
  .map(k => `${k}=${params[k]}`).join('&')
const sign = crypto.createHash('sha1').update(sorted + APP_SECRET).digest('hex')

// 发请求
const body = Object.entries({ ...params, sign })
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  .join('&')

console.log(`==> POST ${API_BASE}/api/webhooks/meituan`)
console.log(`    msgType=${msgType} ${variant ? `variant=${variant}` : ''}`)
console.log(`    msgId=${params.msgId}`)
console.log(`    message=${params.message}`)
console.log()

;(async () => {
  const resp = await fetch(`${API_BASE}/api/webhooks/meituan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await resp.text()
  console.log(`<== HTTP ${resp.status}`)
  console.log(`    ${text}`)
  console.log()
  console.log(`-- 看 DB:`)
  console.log(`   psql -U reedom -d dianjie_v4_dev -c "SELECT \\"msgId\\", \\"msgType\\", status, \\"failReason\\" FROM meituan_raw_messages WHERE \\"msgId\\"='${params.msgId}'"`)
  if (msgType === '110009' || msgType === '110029') {
    console.log(`   psql -U reedom -d dianjie_v4_dev -c "SELECT channel, \\"externalOrderNo\\", amount, status FROM revenue_transactions WHERE \\"externalOrderNo\\"='${orderId}'"`)
  }
})()
