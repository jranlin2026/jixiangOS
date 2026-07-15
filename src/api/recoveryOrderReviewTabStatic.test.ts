import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pages/AfterSales/index.tsx', import.meta.url), 'utf8');
const tabSource = readFileSync(new URL('../pages/AfterSales/RecoveryOrderTab.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /value:\s*'recovery-review'[\s\S]*?permissionKeys:\s*\[PERMISSION_KEYS\.AFTER_SALES_RECOVERY_REVIEW\](?![\s\S]*?action:\s*'write')/,
  '售后员工有审核台读取权限时应保留审核台入口',
);

assert.match(
  tabSource,
  /canReviewRecoveryOrders\(currentUser\)/,
  '审核操作按钮必须使用登录用户的明确写权限，不能读取浏览器角色缓存',
);
