import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../pages/Commission/index.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('./commissionPayoutApi.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../server/index.ts', import.meta.url), 'utf8');
const report = readFileSync(new URL('../../server/services/commissionMonthlyReportService.ts', import.meta.url), 'utf8');

assert.match(page, /导出财务核对表/);
assert.match(page, /导出原因 \*/);
assert.match(page, /全部员工/);
assert.match(page, /指定部门/);
assert.match(page, /指定员工/);
assert.doesNotMatch(page, /包含撤回、冲销和撤销发放记录/);
assert.match(page, /commissionPayoutApi\.downloadMonthlyReport/);
assert.match(page, /<Dialog open=\{Boolean\(financeReportError\)\}/, '导出失败必须使用独立错误弹窗');
assert.match(page, />月度报告导出失败</, '错误弹窗必须有明确标题');
assert.doesNotMatch(page, /financeReportError && <Alert severity="error">/, '错误不得继续以内嵌提示展示');

assert.match(client, /commission-payout-reports\/export/);
assert.match(client, /Authorization/);
assert.match(client, /content-disposition/);
assert.match(server, /app\.post\('\/api\/commission-payout-reports\/export', requireFinancePayoutReportExportAccess/);

for (const sheetName of ['月度核对总览', '员工提成汇总', '逐笔提成明细', '正式订单阶梯核对', '发放与撤销记录', '更正与差额', '异常与口径说明']) {
  assert.match(report, new RegExp(sheetName));
}
assert.match(report, /businessExportAudit\.create/);
assert.match(report, /FINANCE_PAYOUT/);

console.log('commission monthly report export wiring tests passed');
