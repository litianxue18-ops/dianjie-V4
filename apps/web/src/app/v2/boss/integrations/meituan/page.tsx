'use client'

import { useEffect, useState } from 'react'
import { getToken } from '@/lib/v2-auth'

interface StatusResp {
  stores: Array<{
    id: string; name: string; meituanShopId: string | null
    meituanVoucherEnabled: boolean; meituanLastAuthAt: string | null
  }>
  msgCounts7d: Array<{ msgType: number; status: string; _count: number }>
  revenueByChannel7d: Array<{ channel: string; _sum: { netAmount: number | null }; _count: number }>
  lastReceivedAt: string | null
}

const MSG_TYPE_NAMES: Record<number, string> = {
  110009: '代金券买单',
  110011: '开通代金券买单',
  110019: '门店授权同步',
  110021: '设置变更',
  110027: '审核驳回',
  110029: '新订单已支付',
}

export default function MeituanIntegrationPage() {
  const [data, setData] = useState<StatusResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const token = getToken()
      const resp = await fetch(`/api/integrations/meituan/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setData(await resp.json())
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="p-6">加载中…</div>
  if (error) return <div className="p-6 text-red-600">错误: {error}</div>
  if (!data) return null

  const msgRows = Object.keys(MSG_TYPE_NAMES).map(mt => {
    const t = Number(mt)
    const received = data.msgCounts7d.filter(r => r.msgType === t).reduce((s, r) => s + r._count, 0)
    const processed = data.msgCounts7d.find(r => r.msgType === t && r.status === 'PROCESSED')?._count || 0
    const failed = data.msgCounts7d.find(r => r.msgType === t && r.status === 'FAILED')?._count || 0
    const ignored = data.msgCounts7d.find(r => r.msgType === t && r.status === 'IGNORED')?._count || 0
    return { msgType: t, received, processed, failed, ignored }
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">美团到店接入</h1>

      {/* 状态卡 */}
      <section className="bg-white rounded-lg p-4 shadow mb-4">
        <h2 className="font-bold mb-3">连接状态</h2>
        <div className="text-sm text-gray-600">
          最近一次 webhook 收到: {data.lastReceivedAt ? new Date(data.lastReceivedAt).toLocaleString('zh-CN') : '从未'}
        </div>
        <table className="w-full mt-3 text-sm">
          <thead className="text-gray-500 text-left">
            <tr><th>门店</th><th>美团门店 ID</th><th>代金券买单</th><th>授权时间</th></tr>
          </thead>
          <tbody>
            {data.stores.map(s => (
              <tr key={s.id} className="border-t">
                <td className="py-2">{s.name}</td>
                <td>{s.meituanShopId || '—'}</td>
                <td>{s.meituanVoucherEnabled ? '已开通' : '未开通'}</td>
                <td>{s.meituanLastAuthAt ? new Date(s.meituanLastAuthAt).toLocaleString('zh-CN') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 7 天消息流量 */}
      <section className="bg-white rounded-lg p-4 shadow mb-4">
        <h2 className="font-bold mb-3">过去 7 天消息流量</h2>
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-left">
            <tr>
              <th>msgType</th><th>消息名</th>
              <th className="text-right">收到</th>
              <th className="text-right">成功</th>
              <th className="text-right">失败</th>
              <th className="text-right">忽略</th>
            </tr>
          </thead>
          <tbody>
            {msgRows.map(r => (
              <tr key={r.msgType} className="border-t">
                <td className="py-2">{r.msgType}</td>
                <td>{MSG_TYPE_NAMES[r.msgType]}</td>
                <td className="text-right">{r.received}</td>
                <td className="text-right text-green-600">{r.processed}</td>
                <td className={`text-right ${r.failed > 0 ? 'text-red-600 font-bold' : ''}`}>{r.failed}</td>
                <td className="text-right text-gray-500">{r.ignored}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 7 天营收 */}
      <section className="bg-white rounded-lg p-4 shadow">
        <h2 className="font-bold mb-3">过去 7 天美团营收（webhook 入账）</h2>
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-left">
            <tr><th>渠道</th><th className="text-right">笔数</th><th className="text-right">净额</th></tr>
          </thead>
          <tbody>
            {data.revenueByChannel7d.map(r => (
              <tr key={r.channel} className="border-t">
                <td className="py-2">{r.channel === 'MEITUAN_VOUCHER' ? '代金券买单' : '新订单'}</td>
                <td className="text-right">{r._count}</td>
                <td className="text-right">¥ {Number(r._sum.netAmount || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
