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

assert.match(pageSource, /const loadRequestRef = React\.useRef\(0\)/, '列表刷新必须防止旧请求覆盖最新状态');
assert.match(
  pageSource,
  /withdrawRecoverySettlement[\s\S]{0,700}applySettlementMutation\(row, res\.data\)/,
  '撤回成功后必须先把已撤回状态实时写入当前列表，再用后端结果复核',
);
