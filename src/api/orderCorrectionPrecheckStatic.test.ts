import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const orderApiSource = readFileSync(join(process.cwd(), 'src/api/orderApi.ts'), 'utf8');
const ordersPageSource = readFileSync(join(process.cwd(), 'src/pages/Orders/index.tsx'), 'utf8');
const orderFormSource = readFileSync(join(process.cwd(), 'src/pages/Orders/OrderForm.tsx'), 'utf8');
const impactDialogSource = readFileSync(join(process.cwd(), 'src/shared/components/CommissionCorrectionImpactDialog.tsx'), 'utf8');
const orderCorrectionUiSource = `${orderFormSource}\n${impactDialogSource}`;
const serverSource = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
const financePageSource = readFileSync(join(process.cwd(), 'src/pages/Finance/index.tsx'), 'utf8');
const commissionPageSource = readFileSync(join(process.cwd(), 'src/pages/Commission/index.tsx'), 'utf8');

assert.match(orderApiSource, /precheckOrderCorrection[\s\S]*correction-precheck/);
assert.match(orderApiSource, /previewOrderCorrection[\s\S]*correction-preview/);
assert.match(serverSource, /app\.post\('\/api\/orders\/:id\/correction-preview'/);
assert.match(
  ordersPageSource,
  /mode === 'correction'[\s\S]*precheckOrderCorrection\(order\.id\)[\s\S]*!precheck\.data\.allowed[\s\S]*setCorrectionBlocker/,
  '打开订单更正表单前必须先执行服务端预检',
);
assert.match(ordersPageSource, /暂不能更正订单/);
assert.match(ordersPageSource, /searchParams\.get\('correctOrderId'\)/, '正式订单必须接收发放记录传入的一次性更正目标');
assert.match(
  ordersPageSource,
  /fetchOrderById\(correctionTargetId\)[\s\S]*handleEditOrder\(response\.data, 'correction'\)/,
  '一次性更正目标必须加载服务端最新订单并复用订单更正预检',
);
assert.match(ordersPageSource, /nextParams\.delete\('correctOrderId'\)/, '取消或完成订单更正后必须清理一次性目标参数');
assert.match(ordersPageSource, /前往订单分账处理/);
assert.match(ordersPageSource, /\/finance\?tab=settlement&search=/);
assert.match(financePageSource, /orderSplitInitialSearch=\{searchParams\.get\('search'\) \|\| ''\}/);
assert.match(commissionPageSource, /search: orderSplitInitialSearch/);
assert.match(
  orderFormSource,
  /precheckOrderCorrection\(order\.id(?:,\s*payoutContext)?\)[\s\S]*requiresImpactPreview[\s\S]*previewOrderCorrection/,
  '已发放正式订单更正提交前必须按最新预检结果获取影响预览',
);
assert.match(orderFormSource, /expectedImpactHash:\s*correctionPreview\.impactHash/);
assert.match(orderCorrectionUiSource, /受影响员工/);
assert.match(orderCorrectionUiSource, /原已发/);
assert.match(orderCorrectionUiSource, /新应得/);
assert.match(orderCorrectionUiSource, /补发/);
assert.match(orderCorrectionUiSource, /追回/);
