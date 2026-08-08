export function mergeOsOrderRemark(
  existing: string,
  lines: readonly [string, string],
): string {
  const currentLines = existing.split(/\r\n|\n|\r/);
  const missing = lines.filter((line) => !currentLines.includes(line));
  if (!missing.length) return existing;
  const newline = existing.match(/\r\n|\n|\r/)?.[0] || '\n';
  const separator = existing && !/(?:\r\n|\n|\r)$/.test(existing) ? newline : '';
  return `${existing}${separator}${missing.join(newline)}`;
}

export function isPaidOrderStatus(status: string): boolean {
  const normalized = status.trim();
  if (!normalized || /未付款|待付款|退款|已关闭|取消/.test(normalized)) return false;
  return /已付款|待发货|已发货|已收货|交易成功|已完成/.test(normalized);
}
