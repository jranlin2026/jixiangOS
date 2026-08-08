export type BrowserOrderRemarkInput = {
  nickname: string;
  phone?: string | null;
  wechat?: string | null;
  assignedTo?: string | null;
  completedAt: Date;
};

function formatShanghaiMinute(value: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function buildBrowserOrderRemark(input: BrowserOrderRemarkInput): [string, string] {
  const nickname = input.nickname.trim();
  const phone = input.phone?.trim() || '';
  const wechat = input.wechat?.trim() || '';
  const assignedTo = input.assignedTo?.trim() || '暂未分配';
  if (!nickname) throw new Error('客户昵称不能为空，请先核对飞鸽客户昵称');
  if (!phone && !wechat) {
    throw new Error('手机号或微信号至少填写一项，请先在极享OS核对客户资料');
  }
  const contactFragments = [
    phone ? `/手机号：${phone}` : '',
    wechat ? `/微信号：${wechat}` : '',
  ].join('');
  return [
    `#${nickname}${contactFragments}（对接：${assignedTo}）`,
    `#入OS（${formatShanghaiMinute(input.completedAt)}）`,
  ];
}
