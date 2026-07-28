import assert from 'node:assert/strict';
import { getSettlementRowActionVisibility } from './settlementListActions';

for (const moduleName of ['正式订单分账', '售后挽回分账']) {
  const withdrawn = getSettlementRowActionVisibility('已撤回', false);
  assert.deepEqual(
    withdrawn,
    {
      showAdjust: false,
      showReopen: true,
      showResetOrCleanup: false,
    },
    `${moduleName}的已撤回行只应显示重新分账，不应再显示不可用的调整或重置图标`,
  );
}

assert.deepEqual(
  getSettlementRowActionVisibility('待确认', false),
  {
    showAdjust: true,
    showReopen: false,
    showResetOrCleanup: true,
  },
  '待确认行仍应保留调整与重置操作',
);

assert.deepEqual(
  getSettlementRowActionVisibility('已撤回', true),
  {
    showAdjust: false,
    showReopen: false,
    showResetOrCleanup: true,
  },
  '源业务已删除时应隐藏重新分账，只保留废弃记录清理入口',
);

console.log('settlement list action visibility tests passed');
