/**
 * 6 种 msgType 的 message JSON 体的 Zod schema
 *
 * 字段定义来源: 美团到店餐饮技术服务文档（reedom 本地 ~/PyCharmMiscProject/美团到店餐饮技术服务.md）
 * 严格性: 必填字段 strict, 嵌套 DTO (orderSkuDTOList / dealInfoDTOList 等) 用 passthrough() 容错
 *         (允许美团未来加字段不影响我方)
 */
import { z } from 'zod'

// 公共参数（form-urlencoded 解出来的外层）
export const CommonParamsSchema = z.object({
  msgType:     z.string().min(1),
  timestamp:   z.string().min(1),
  sign:        z.string().length(40),
  developerId: z.string().min(1),
  businessId:  z.string().min(1),
  msgId:       z.string().min(1),
  message:     z.string(),
  ePoiId:      z.string().optional(),
  opBizCode:   z.string().optional(),
})

// 110009 代金券买单订单消息（必接）
// 文档说全部字段 "是否必传"=否，所以全部用 optional + passthrough
export const VoucherOrderMessageSchema = z.object({
  orderId:                    z.union([z.number(), z.bigint(), z.string()]).optional(),
  serialNumber:               z.string().optional(),
  msgType:                    z.enum([
    'createOrder', 'payOrderSuccess', 'payOrderError',
    'refundingOrder', 'refundOrderSuccess', 'refundOrderError',
    'unknownOrder',
  ]).optional(),
  msgContent:                 z.string().optional(),
  userId:                     z.union([z.number(), z.bigint(), z.string()]).optional(),
  userType:                   z.number().optional(),
  mobileNo:                   z.string().optional(),
  orderAddTime:               z.number().optional(),
  orderUpdateTime:            z.number().optional(),
  payTime:                    z.number().optional(),
  mtCityId:                   z.number().optional(),
  orderStatus:                z.number().optional(),
  orderAmount:                z.number().optional(),
  noDiscountAmount:           z.number().optional(),
  userPayAmount:              z.number().optional(),
  groupVoucherDiscountAmount: z.number().optional(),
  couponInfoList:             z.any().optional(),
  productId:                  z.union([z.number(), z.bigint()]).optional(),
  refundInfo:                 z.object({
    refundSource:  z.string().optional(),
    operator:      z.string().optional(),
    operatorIp:    z.string().optional(),
    refundReason:  z.string().optional(),
    refundTime:    z.number().optional(),
  }).passthrough().optional(),
  extraInfo:                  z.any().optional(),
}).passthrough()

// 110029 新订单已支付
export const OrderPaidMessageSchema = z.object({
  openId:                  z.string().optional(),
  platform:                z.number(),
  orderId:                 z.union([z.number(), z.bigint(), z.string()]),
  vendorShopId:            z.string(),
  orderType:               z.number(),
  takeTime:                z.number().optional(),
  mtTakeCode:              z.string().optional(),
  totalPrice:              z.number(),
  payPrice:                z.number(),
  mtMopDiscountPrice:      z.number().optional(),
  mtDealDiscountPrice:     z.number().optional(),
  vendorBillPrice:         z.number(),
  vendorDealBillPrice:     z.number().optional(),
  vendorMOPBillPrice:      z.number().optional(),
  mtDiscountPrice:         z.number().optional(),
  vendorDiscountPrice:     z.number(),
  vendorDealDiscountPrice: z.number().optional(),
  vendorMOPDiscountPrice:  z.number().optional(),
  orderTime:               z.number(),
  payTime:                 z.number(),
  packageOrder:            z.boolean().optional(),
  orderSkuDTOList:         z.array(z.any()).optional(),
  orderComboDTOList:       z.array(z.any()).optional(),
  dealInfoDTOList:         z.array(z.any()).optional(),
  orderActivityList:       z.array(z.any()).optional(),
  shopTablewareType:       z.number().optional(),
  orderExt:                z.string().optional(),
  bizType:                 z.number(),
  smartOrderDTO:           z.any(),
}).passthrough()

// 110011 开通代金券买单
export const VoucherEnableMessageSchema = z.object({
  isOpen: z.boolean(),
})

// 110019 门店授权信息同步
export const ShopAuthMessageSchema = z.object({
  vendorShopId: z.string(),
  type:         z.number(),
  time:         z.string().optional(),
})

// 110021 门店代金券买单设置变更
export const VoucherSettingsMessageSchema = z.object({
  poiId:       z.union([z.number(), z.bigint()]),
  changes:     z.array(z.string()),
  operateTime: z.number(),
})

// 110027 审核驳回通知
export const AuditRejectedMessageSchema = z.object({
  scope:         z.number(),
  vendorChainId: z.string().optional(),
  vendorShopId:  z.string().optional(),
  auditMessage: z.object({
    subjectType:    z.number(),
    subjectId:      z.string(),
    subSubjectId:   z.string().optional(),
    rejectReason:   z.string(),
  }),
})

// 按 msgType 映射到对应 schema
export const MESSAGE_SCHEMAS: Record<number, z.ZodTypeAny> = {
  110009: VoucherOrderMessageSchema,
  110011: VoucherEnableMessageSchema,
  110019: ShopAuthMessageSchema,
  110021: VoucherSettingsMessageSchema,
  110027: AuditRejectedMessageSchema,
  110029: OrderPaidMessageSchema,
}

export type VoucherOrderMessage    = z.infer<typeof VoucherOrderMessageSchema>
export type OrderPaidMessage       = z.infer<typeof OrderPaidMessageSchema>
export type VoucherEnableMessage   = z.infer<typeof VoucherEnableMessageSchema>
export type ShopAuthMessage        = z.infer<typeof ShopAuthMessageSchema>
export type VoucherSettingsMessage = z.infer<typeof VoucherSettingsMessageSchema>
export type AuditRejectedMessage   = z.infer<typeof AuditRejectedMessageSchema>
