import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const financeSource = readFileSync(new URL('../pages/Finance/index.tsx', import.meta.url), 'utf8');
const payoutSource = readFileSync(new URL('../pages/Finance/CommissionPayout.tsx', import.meta.url), 'utf8');
const commissionSource = readFileSync(new URL('../pages/Commission/index.tsx', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../../server/index.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('../../server/services/commissionPayoutService.ts', import.meta.url), 'utf8');

assert.match(financeSource, /value:\s*'disbursement',\s*label:\s*'提成发放'/);
assert.doesNotMatch(financeSource, /value:\s*'payout',\s*label:\s*'员工提成月报'/);
assert.doesNotMatch(commissionSource, /生成发放单|确认本月已发放|确认此人已发/);
assert.match(commissionSource, /导出月度总表/);

assert.match(payoutSource, /待发放/);
assert.match(payoutSource, /发放记录/);
assert.match(payoutSource, /label="月度报告"/);
assert.match(payoutSource, /确认发放/);
assert.match(payoutSource, /撤销发放/);
assert.match(payoutSource, /付款流水号/);
assert.match(payoutSource, /fetchRecordsWorkspace/);
assert.match(payoutSource, /subscribePageRefresh/);
assert.match(payoutSource, /setInterval[\s\S]{0,80}30_000/);
assert.doesNotMatch(payoutSource, /发放记录月份|RefreshOutlinedIcon|>刷新<|本月暂无发放记录/);
assert.doesNotMatch(payoutSource, /新建发放批次|核对并锁定|确认已付款/);
assert.match(commissionSource, /renderMinePayoutWorkspace\(\[selectedFinancePayoutRow\]\)/);
assert.match(commissionSource, /导出员工明细/);
assert.match(payoutSource, /commissionSnapshots/);

assert.match(serverSource, /\/api\/commission-payout-workspace/);
assert.match(serverSource, /scope === 'records'/);
assert.match(serverSource, /\/api\/commission-payouts\/issue/);
assert.match(serverSource, /\/api\/commission-payout-records\/:id\/reverse/);
assert.match(serviceSource, /STORAGE_KEYS\.COMMISSION_PAYOUT_BATCHES/);
assert.match(serviceSource, /status:\s*'已发放' as const/);
assert.match(serviceSource, /status:\s*'已撤销'/);
assert.match(serviceSource, /active\.every[\s\S]{0,120}\? '已发放'/);

console.log('commission payout flow static tests passed');
