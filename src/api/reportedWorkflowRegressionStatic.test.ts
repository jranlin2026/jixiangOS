import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ordersSource = readFileSync(join(process.cwd(), 'src/pages/Orders/index.tsx'), 'utf8');
const orderFormSource = readFileSync(join(process.cwd(), 'src/pages/Orders/OrderForm.tsx'), 'utf8');
const commissionSource = readFileSync(join(process.cwd(), 'src/pages/Commission/index.tsx'), 'utf8');
const recoverySource = readFileSync(join(process.cwd(), 'src/pages/Finance/RecoverySettlement.tsx'), 'utf8');
const customerFormSource = readFileSync(join(process.cwd(), 'src/pages/Customers/CustomerForm.tsx'), 'utf8');
const customersSource = readFileSync(join(process.cwd(), 'src/pages/Customers/index.tsx'), 'utf8');
const customerDetailSource = readFileSync(join(process.cwd(), 'src/pages/Customers/CustomerDetail.tsx'), 'utf8');
const commissionApiSource = readFileSync(join(process.cwd(), 'src/api/commissionApi.ts'), 'utf8');

assert.match(ordersSource, /orderApi\.fetchOwnerCandidates/);
assert.match(ordersSource, /filterUsersByCurrentDataScope\(users, 'orders', currentUser/);
assert.match(orderFormSource, /orderApi\.fetchOwnerCandidates/);
assert.match(orderFormSource, /filterUsersByCurrentDataScope\(userRes\.data, 'orders', currentUser/);
assert.match(commissionSource, /settingsApi\.fetchAssignableDirectory/);
assert.match(recoverySource, /settingsApi\.fetchAssignableDirectory/);
const recoverySettlementSubmitSource = recoverySource.slice(
  recoverySource.indexOf('const submitSettlement = async'),
  recoverySource.indexOf('const confirmSettlement = async'),
);
assert.match(
  recoverySettlementSubmitSource,
  /if \(res\.data && detailOrder\?\.id === res\.data\.id\) \{[\s\S]*?setDetailOrder\(res\.data\);[\s\S]*?setDetailCommissions\(await loadRecoveryCommissions\(res\.data\)\);[\s\S]*?\}/,
  '保存售后分账后必须立即用接口返回的待确认订单及分账明细刷新仍在显示的详情弹窗',
);
assert.doesNotMatch(
  recoverySource,
  /closeDetail\(\);\s*openSettlement\(detailOrder\);/,
  '从详情处理售后分账时必须保留详情，保存后才能原地进入确认分账',
);
assert.match(
  recoverySource,
  /<Dialog open=\{Boolean\(detailOrder\) && !selected\} onClose=\{closeDetail\}/,
  '编辑分账时应暂时隐藏但不能销毁详情弹窗',
);
assert.match(commissionApiSource, /await hydrateCommissionOrderCache\(\)/);
assert.match(customerFormSource, /const saved =/);
assert.match(customerFormSource, /if \(!saved\) return;/);
assert.match(customerFormSource, /setSubmitError/);
assert.match(customersSource, /permissionKey=\{PERMISSION_KEYS\.CUSTOMER_PUBLIC_POOL_CLAIM\}/);
assert.match(customerDetailSource, /permissionKey=\{PERMISSION_KEYS\.CUSTOMER_PUBLIC_POOL_CLAIM\}/);
assert.match(customersSource, /!isPublicPoolScope\s*&&\s*\([\s\S]*?新增客户/);
