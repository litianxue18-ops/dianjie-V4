'use client'

import Link from 'next/link'

/**
 * 第三方平台接入总览
 * 当前只有美团；以后加抖音 / 聚合支付 / 微信小程序时在这里横向扩展
 */
const INTEGRATIONS = [
  { slug: 'meituan', name: '美团到店餐饮', status: 'connected',  desc: 'webhook 营收入账（6 种 msgType）' },
  { slug: 'douyin',  name: '抖音生活服务', status: 'not-started', desc: '团购券 / 代金券（待接入）' },
  { slug: 'aggregator', name: '聚合支付（收钱吧）', status: 'not-started', desc: '桌签码扫码 / 微信支付宝聚合（待接入）' },
]

export default function IntegrationsIndexPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">第三方平台接入</h1>
      <p className="text-sm text-gray-500 mb-4">
        营收自动入账 / 状态同步等外部 webhook 接入入口
      </p>

      <div className="space-y-3">
        {INTEGRATIONS.map(it => (
          <div key={it.slug} className="bg-white rounded-lg border border-border p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{it.name}</span>
                <span className={
                  it.status === 'connected'
                    ? 'text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded'
                    : 'text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded'
                }>
                  {it.status === 'connected' ? '✓ 已接入' : '未接入'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{it.desc}</p>
            </div>
            {it.status === 'connected' ? (
              <Link
                href={`/v2/boss/integrations/${it.slug}`}
                className="text-sm text-amber-fg hover:underline"
              >
                查看 →
              </Link>
            ) : (
              <span className="text-sm text-gray-400">敬请期待</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
