export function formatCustomerTagDialogError(code: number, message?: string): string {
  const prefix = code === 403 ? '无管理权限：' : code === 409 ? '数据已变化：' : '';
  return `${prefix}${message || '操作失败'}`;
}

export function staleMigrationMessage(message?: string): string {
  return `${message || '预览已过期'}，请重新预览后再整理。`;
}
