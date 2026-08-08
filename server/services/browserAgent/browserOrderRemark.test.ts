import assert from 'node:assert/strict';
import { buildBrowserOrderRemark } from './browserOrderRemark';

const originalTimeZone = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';

assert.deepEqual(buildBrowserOrderRemark({
  nickname: '海盗船长',
  phone: '13800138000',
  wechat: 'jx888',
  assignedTo: '王小明',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), [
  '#海盗船长/手机号：13800138000/微信号：jx888（对接：王小明）',
  '#入OS（2026-08-08 21:00）',
]);

assert.deepEqual(buildBrowserOrderRemark({
  nickname: '海盗船长',
  wechat: '  jx888  ',
  assignedTo: '  王小明  ',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), [
  '#海盗船长/微信号：jx888（对接：王小明）',
  '#入OS（2026-08-08 21:00）',
]);

assert.throws(() => buildBrowserOrderRemark({
  nickname: '   ',
  phone: '13800138000',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), /客户昵称不能为空，请先核对飞鸽客户昵称/);

assert.throws(() => buildBrowserOrderRemark({
  nickname: '海盗船长',
  phone: '   ',
  wechat: '   ',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), /手机号或微信号至少填写一项，请先在极享OS核对客户资料/);

assert.deepEqual(buildBrowserOrderRemark({
  nickname: '  海盗船长  ',
  phone: '  13800138000  ',
  wechat: '   ',
  assignedTo: '   ',
  completedAt: new Date('2026-08-08T13:00:00.000Z'),
}), [
  '#海盗船长/手机号：13800138000（对接：暂未分配）',
  '#入OS（2026-08-08 21:00）',
]);

if (originalTimeZone === undefined) delete process.env.TZ;
else process.env.TZ = originalTimeZone;

console.log('browser order remark: ok');
