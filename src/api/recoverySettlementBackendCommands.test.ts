import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiSource = readFileSync(join(process.cwd(), 'src/api/recoveryOrderApi.ts'), 'utf8');
const serverSource = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
const pageSource = readFileSync(join(process.cwd(), 'src/pages/Finance/RecoverySettlement.tsx'), 'utf8');

for (const action of ['settle', 'confirm-settlement', 'reset-settlement', 'withdraw-settlement']) {
  assert.match(
    apiSource,
    new RegExp(`/recovery-orders/\\$\\{encodeURIComponent\\(id\\)\\}/${action}`),
    `服务器模式必须把售后挽回分账 ${action} 写入后端，不能只改浏览器缓存`,
  );
  assert.match(
    serverSource,
    new RegExp(`/api/recovery-orders/:id/${action}`),
    `后端必须提供售后挽回分账 ${action} 命令端点`,
  );
}

assert.match(
  apiSource,
  /reset-settlement[\s\S]{0,500}syncBackendStorageScopeFromServer\('commissions', 0\)/,
  '重置售后挽回分账后必须强制同步提成缓存，避免详情继续显示旧明细',
);

assert.match(pageSource, /const loadRequestRef = React\.useRef\(0\)/, '列表刷新必须防止旧请求覆盖最新状态');
assert.match(
  pageSource,
  /withdrawRecoverySettlement[\s\S]{0,700}applySettlementMutation\(row, res\.data\)/,
  '撤回成功后必须先把已撤回状态实时写入当前列表，再用后端结果复核',
);
assert.match(
  pageSource,
  /handleResetSettlement[\s\S]{0,2200}setDetailOrder\(res\.data\);[\s\S]{0,300}loadRecoveryCommissions\(res\.data\)/,
  '重置成功后必须在原处理页刷新为待处理状态和空明细，由用户主动关闭',
);

assert.match(
  pageSource,
  /openSettlement[\s\S]{0,1000}getCurrentSettlementRoundCommissions\(commissions, order\)/,
  '调整售后挽回分账只能加载当前有效轮次，不能把已撤回历史重新带入编辑器',
);
assert.match(
  pageSource,
  /loadRecoveryCommissions[\s\S]{0,500}fetchCommissions\(\{ page: 1, pageSize: 5000 \}\)/,
  '售后挽回分账明细读取必须覆盖完整提成集合，不能因 500 条分页截断而把当前轮次误判为空',
);
assert.match(
  pageSource,
  /getCurrentDetailRows\(detailOrder\)[\s\S]{0,500}getCurrentDetailRows\(detailOrder\)\.length/,
  '售后挽回分账详情顶部的金额和角色数必须只统计当前有效轮次',
);
