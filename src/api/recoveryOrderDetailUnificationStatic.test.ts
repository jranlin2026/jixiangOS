import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');

const sharedDetailSource = read('src/shared/components/RecoveryOrderDetailContent.tsx');
const afterSalesSource = read('src/pages/AfterSales/RecoveryOrderTab.tsx');
const financeSource = read('src/pages/Finance/RecoverySettlement.tsx');

for (const section of ['客户信息', '原订单信息', '挽回成交信息', '审核与系统记录']) {
  assert.match(sharedDetailSource, new RegExp(section), `共享售后挽回资料必须包含“${section}”分区`);
}

for (const section of ['客户信息', '原订单信息', '挽回成交信息', '审核与系统记录']) {
  assert.match(afterSalesSource, new RegExp(section), `售后服务新版资料必须保留“${section}”分区`);
}
assert.match(financeSource, /<RecoveryOrderDetailContent/, '财务中心必须使用共享售后挽回资料');

const sourceDetailDialog = financeSource.slice(
  financeSource.indexOf('<Dialog open={Boolean(sourceDetailOrder)}'),
  financeSource.indexOf('<Dialog\n        open={Boolean(detailOrder)'),
);
assert.doesNotMatch(sourceDetailDialog, /源业务资料|付款资料/, '财务中心不得保留旧版售后挽回资料分区');

console.log('recovery order detail unification static tests passed');
