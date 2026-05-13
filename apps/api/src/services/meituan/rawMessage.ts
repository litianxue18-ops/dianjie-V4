/**
 * MeituanRawMessage 表 CRUD + 状态机
 *
 * 设计原则:
 *   - 入库用 INSERT (msgId unique) 做幂等，重放命中 unique 时返 null
 *   - 状态机只允许 RECEIVED → {PROCESSED, FAILED, IGNORED}
 *   - 重放: FAILED → RECEIVED (Task 15 管理 API 调用)
 */
import { prisma } from '@dianjie/db'
import type { MeituanRawMessage, MeituanMsgStatus, Prisma } from '@dianjie/db'

export interface CreateRawMessageInput {
  msgId: string
  msgType: number
  developerId: number
  businessId: number
  ePoiId: string | null
  opBizCode: string | null
  msgTimestamp: bigint
  rawHeaders: Prisma.InputJsonValue
  rawBody: string
  rawMessage: Prisma.InputJsonValue
}

/**
 * 入库一条 raw message。
 * @returns 成功 → 落库的对象；msgId 重放 (P2002) → null
 * @throws 非 P2002 的 DB 异常照常抛
 */
export async function createRawMessage(input: CreateRawMessageInput): Promise<MeituanRawMessage | null> {
  try {
    return await prisma.meituanRawMessage.create({
      data: { ...input, status: 'RECEIVED' },
    })
  } catch (err: any) {
    if (err.code === 'P2002') return null
    throw err
  }
}

export async function markStatus(
  id: string,
  status: Extract<MeituanMsgStatus, 'PROCESSED' | 'FAILED' | 'IGNORED'>,
  failReason: string | null = null,
  resultTxId: string | null = null,
): Promise<void> {
  await prisma.meituanRawMessage.update({
    where: { id },
    data: {
      status,
      processedAt: new Date(),
      failReason,
      resultTxId,
    },
  })
}

/** 重放: FAILED → RECEIVED，由管理 API 触发 */
export async function resetForReplay(id: string): Promise<MeituanRawMessage | null> {
  const found = await prisma.meituanRawMessage.findUnique({ where: { id } })
  if (!found) return null
  if (found.status !== 'FAILED') return null
  return prisma.meituanRawMessage.update({
    where: { id },
    data: {
      status: 'RECEIVED',
      processedAt: null,
      failReason: null,
      retryCount: { increment: 1 },
    },
  })
}
