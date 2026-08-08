export type OsRemarkInput = {
  nickname: string;
  phone?: string;
  wechat?: string;
};

export function buildOsRemarkLines(input: OsRemarkInput): string[] {
  const nickname = input.nickname.trim();
  const contact = input.phone?.trim() || input.wechat?.trim() || '';
  if (!nickname) throw new Error('抖音昵称不能为空');
  if (!contact) throw new Error('手机号或微信至少填写一项');
  return [`#${nickname}/${contact}`, '#入OS'];
}

export function mergeOsOrderRemark(existing: string, input: OsRemarkInput): string {
  const lines = buildOsRemarkLines(input);
  const currentLines = existing.split(/\r?\n/).map((line) => line.trim());
  const missing = lines.filter((line) => !currentLines.includes(line));
  if (!missing.length) return existing;
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  return `${existing}${separator}${missing.join('\n')}`;
}

export function isPaidOrderStatus(status: string): boolean {
  const normalized = status.trim();
  if (!normalized || /未付款|待付款|退款|已关闭|取消/.test(normalized)) return false;
  return /已付款|待发货|已发货|已收货|交易成功|已完成/.test(normalized);
}
