import assert from 'node:assert/strict';
import { buildBrowserOrderRemark } from './browserOrderRemark';

const originalTimeZone = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';

assert.deepEqual(buildBrowserOrderRemark({
  nickname: '海盗船长',
  phone: '13800138000',
  wechat: 'jx888',
  assignedTo: '王小明',
  operatorName: '客服小李',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), [
  '#海盗船长/手机号：13800138000/微信号：jx888（对接：王小明）',
  '#入OS（客服小李：2026-08-08 21:00）',
]);

for (const invalid of [
  { field: '客户昵称', patch: { nickname: '海盗\n船长' } },
  { field: '手机号', patch: { phone: '1380013\r8000' } },
  { field: '微信号', patch: { wechat: 'jx\n888' } },
  { field: '对接销售', patch: { assignedTo: '王小\r\n明' } },
  { field: '入库员工', patch: { operatorName: '客服\n小李' } },
] as const) {
  assert.throws(() => buildBrowserOrderRemark({
    nickname: '海盗船长',
    phone: '13800138000',
    wechat: 'jx888',
    assignedTo: '王小明',
    operatorName: '客服小李',
    completedAt: new Date('2026-08-08T13:00:00.000Z'),
    ...invalid.patch,
  }), new RegExp(`订单备注中的${invalid.field}不能包含换行，请先在极享OS清理后重试`));
}

const physicalLines = buildBrowserOrderRemark({
  nickname: '  海盗船长  ',
  phone: '  13800138000  ',
  assignedTo: '  王小明  ',
  operatorName: '  客服小李  ',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
});
assert.equal(physicalLines.every((line) => !/[\r\n]/.test(line)), true, '每个 tuple 成员必须恰好是一个物理行');

assert.deepEqual(buildBrowserOrderRemark({
  nickname: '海盗船长',
  wechat: '  jx888  ',
  assignedTo: '  王小明  ',
  operatorName: '  客服小李  ',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), [
  '#海盗船长/微信号：jx888（对接：王小明）',
  '#入OS（客服小李：2026-08-08 21:00）',
]);

assert.throws(() => buildBrowserOrderRemark({
  nickname: '   ',
  phone: '13800138000',
  operatorName: '客服小李',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), /客户昵称不能为空，请先核对飞鸽客户昵称/);

assert.throws(() => buildBrowserOrderRemark({
  nickname: '海盗船长',
  phone: '   ',
  wechat: '   ',
  operatorName: '客服小李',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), /手机号或微信号至少填写一项，请先在极享OS核对客户资料/);

assert.deepEqual(buildBrowserOrderRemark({
  nickname: '  海盗船长  ',
  phone: '  13800138000  ',
  wechat: '   ',
  assignedTo: '   ',
  operatorName: '  客服小李  ',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), [
  '#海盗船长/手机号：13800138000（对接：暂未分配）',
  '#入OS（客服小李：2026-08-08 21:00）',
]);

assert.throws(() => buildBrowserOrderRemark({
  nickname: '海盗船长',
  phone: '13800138000',
  operatorName: '   ',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), /入库员工不能为空，请先核对极享OS登录员工/);

if (originalTimeZone === undefined) delete process.env.TZ;
else process.env.TZ = originalTimeZone;

console.log('browser order remark: ok');
