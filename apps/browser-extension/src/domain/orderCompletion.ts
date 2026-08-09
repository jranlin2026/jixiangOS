function assertValidRemarkLines(lines: unknown): asserts lines is [string, string] {
  if (!Array.isArray(lines)
    || lines.length !== 2
    || lines.some((line) => typeof line !== 'string' || !line.trim() || /[\r\n]/.test(line))) {
    throw new Error('极享OS返回的订单备注格式不正确，请刷新后重试');
  }
}

export function mergeOsOrderRemark(
  existing: string,
  lines: readonly [string, string],
): string {
  assertValidRemarkLines(lines);
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

export function isIntakeEligibleOrderStatus(status: string): boolean {
  const normalized = status.trim();
  if (!normalized) return true;
  if (/取消/.test(normalized)) return false;
  if (/已关闭/.test(normalized)) return true;
  if (/未付款|待付款|退款/.test(normalized)) return false;
  return isPaidOrderStatus(normalized);
}
