import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');

const dialogSource = read('src/shared/components/BusinessSubmissionResultDialog.tsx');
const customerSource = read('src/pages/Customers/index.tsx');
const orderSource = read('src/pages/Orders/index.tsx');
const recoverySource = read('src/pages/AfterSales/RecoveryOrderTab.tsx');

assert.match(dialogSource, /留在当前页面/, '统一提交结果弹窗必须允许用户留在原页面');
assert.match(dialogSource, /reviewActionLabel[\s\S]*onViewReview/, '审核台跳转必须由用户在结果弹窗中主动触发');

assert.match(customerSource, /<BusinessSubmissionResultDialog[\s\S]{0,1600}查看订单审核台/, '客户列表提交订单后必须使用统一结果弹窗');
assert.match(orderSource, /const \[submittedOrderApplication, setSubmittedOrderApplication\]/, '订单管理必须保存本次提交结果');
assert.match(orderSource, /<BusinessSubmissionResultDialog[\s\S]{0,1600}查看订单审核台/, '订单管理提交订单后必须使用统一结果弹窗');
assert.doesNotMatch(
  orderSource,
  /onSuccess=\{\(application\) => \{[\s\S]{0,700}nextParams\.set\('tab', 'review'\)/,
  '订单管理提交成功后不能自动切换到审核台',
);

assert.match(recoverySource, /const \[submittedRecoveryOrder, setSubmittedRecoveryOrder\]/, '售后服务必须保存本次提交结果');
assert.match(recoverySource, /<BusinessSubmissionResultDialog[\s\S]{0,1600}查看售后审核台/, '新建售后挽回申请后必须使用统一结果弹窗');
assert.doesNotMatch(
  recoverySource,
  /if \(formMode === 'create' \|\| formMode === 'review-edit'\) navigate\(`\$\{ROUTES\.AFTER_SALES\}\?tab=recovery-review`\)/,
  '售后挽回申请提交成功后不能自动跳转审核台',
);

console.log('business submission result UX static tests passed');
