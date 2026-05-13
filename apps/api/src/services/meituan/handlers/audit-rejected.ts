/**
 * 110027 审核驳回通知
 * V4 当前无 SPU/SKU 表，仅 OpLog + 通知 ADMIN
 */
import { prisma } from '@dianjie/db'
import { findStoreByShopId } from '../storeResolver'
import { sendNotification } from '../../notification'
import type { AuditRejectedMessage } from '../types'

export interface AuditRejectedInput {
  message: AuditRejectedMessage
}

export interface AuditRejectedResult {
  status: 'IGNORED'
}

export async function handleAuditRejected(
  input: AuditRejectedInput,
): Promise<AuditRejectedResult> {
  const m = input.message
  const store = m.scope === 2 && m.vendorShopId ? await findStoreByShopId(m.vendorShopId) : null

  // OpLog 需要 tenantId FK；scope=1 总部级 or 找不到 store 时 fallback 到第一个 tenant
  let tenantId: string | null = store?.tenantId ?? null
  if (!tenantId) {
    const t = await prisma.tenant.findFirst({ select: { id: true } })
    tenantId = t?.id ?? null
  }
  if (tenantId) {
    await prisma.opLog.create({
      data: {
        tenantId,
        action: `美团审核驳回: ${m.auditMessage.rejectReason}`,
        target: m.auditMessage.subjectId,
        entityType: 'MeituanAudit',
        metadata: { ...m } as any,
        isAi: true,
      },
    })
  }

  await sendNotification({
    tenantId: store?.tenantId || '',
    recipientRole: 'ADMIN',
    type: 'MEITUAN_AUDIT_REJECTED',
    title: `美团审核驳回 (${m.scope === 1 ? '总部级' : '门店级'})`,
    body: `${m.auditMessage.subjectType}#${m.auditMessage.subjectId}: ${m.auditMessage.rejectReason}`,
    refType: 'MeituanAudit',
  }).catch(() => {})

  return { status: 'IGNORED' }
}
