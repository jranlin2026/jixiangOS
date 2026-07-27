const GENERIC_IMPORT_FAILURE = '导入执行失败，请重试或联系管理员';

const SAFE_BUSINESS_MESSAGES = [
  /^预检未通过的数据不能执行$/,
  /^导入人不存在或已停用$/,
  /^导入人权限已变化，任务已停止$/,
  /^导入执行上下文已失效$/,
  /^客户存在但已超出当前导入人数据范围$/,
  /^客户匹配结果(?:已变化，订单导入已停止|不唯一，导入已停止)$/,
  /^(?:目标创建人|销售人员|挽回人员|协助人员)不存在、已停用或姓名不唯一$/,
  /^(?:产品|订单类型)不存在或已停用$/,
  /^收款渠道已停用$/,
  /^售后来源(?:平台|店铺)已停用$/,
  /^导入金额无效$/,
  /^订单申请导入失败$/,
  /^售后挽回单导入失败$/,
  /^该第三方平台订单号已经创建过售后挽回订单$/,
  /^导入执行失败，请重试或联系管理员$/,
];

export function safeBusinessImportErrorMessage(value: unknown): string {
  const message = String(value instanceof Error ? value.message : value || '').trim();
  if (message.length <= 200 && !/[\r\n]/.test(message) && SAFE_BUSINESS_MESSAGES.some((pattern) => pattern.test(message))) {
    return message;
  }
  return GENERIC_IMPORT_FAILURE;
}

export function safeBusinessImportReviewException(): string {
  return '审核操作未完成，请重试';
}
