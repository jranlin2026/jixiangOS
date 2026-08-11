export type BrowserOrderRemarkInput = {
  nickname: string;
  phone?: string | null;
  wechat?: string | null;
  assignedTo?: string | null;
  operatorName: string;
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

function canonicalSingleLine(value: string | null | undefined, field: string) {
  const raw = value || '';
  if (/[\r\n]/.test(raw)) {
    throw new Error(`订单备注中的${field}不能包含换行，请先在极享OS清理后重试`);
  }
  return raw.trim();
}

export function buildBrowserOrderRemark(input: BrowserOrderRemarkInput): [string, string] {
  const nickname = canonicalSingleLine(input.nickname, '客户昵称');
  const phone = canonicalSingleLine(input.phone, '手机号');
  const wechat = canonicalSingleLine(input.wechat, '微信号');
  const assignedTo = canonicalSingleLine(input.assignedTo, '对接销售') || '暂未分配';
  const operatorName = canonicalSingleLine(input.operatorName, '入库员工');
  if (!nickname) throw new Error('客户昵称不能为空，请先核对飞鸽客户昵称');
  if (!operatorName) throw new Error('入库员工不能为空，请先核对极享OS登录员工');
  if (!phone && !wechat) {
    throw new Error('手机号或微信号至少填写一项，请先在极享OS核对客户资料');
  }
  const contactFragments = [
    phone ? `/手机号：${phone}` : '',
    wechat ? `/微信号：${wechat}` : '',
  ].join('');
  return [
    `#${nickname}${contactFragments}（对接：${assignedTo}）`,
    `#入OS（${operatorName}：${formatShanghaiMinute(input.completedAt)}）`,
  ];
}
