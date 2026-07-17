import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Customers/index.tsx'), 'utf8');

assert.match(
  source,
  /customerApi\.fetchManageableUsers\(\)/,
  '客户列表必须从客户专用 endpoint 加载可管理人员',
);
assert.doesNotMatch(source, /settingsApi\.fetchAssignableUsers/);
assert.doesNotMatch(
  source,
  /getScopedLeadAssignmentCandidates/,
  '客户转交候选不得再用 lead-flow 或 localStorage 扩张服务端上界',
);

assert.match(
  source,
  /buildManageableOwnerIds\(currentUser\?\.id, manageableUsers\)/,
  '客户列表必须用当前用户和客户专用目录的稳定 ID 构造可管理范围。',
);
assert.match(
  source,
  /buildCustomerWriteActionPolicy\(\{\s*customer,\s*manageableOwnerIds,\s*permissions: customerWritePermissions,\s*readOnly: false,\s*\}\)/,
  '客户列表的写入口必须复用共享客户写操作策略。',
);

for (const action of ['release', 'transfer', 'delete'] as const) {
  assert.match(
    source,
    new RegExp(`customerActions\\.${action}`),
    `客户列表必须按 ${action} 的显式叶子与可管理范围隐藏写入入口。`,
  );
}

assert.match(
  source,
  /const handleReleaseCustomer = \(customer: Customer\) => \{\s*if \(!customerWriteActions\(customer\)\.release\) return;/,
  '释放对话框的入口 handler 必须再校验策略。',
);
assert.match(
  source,
  /if \(!releaseTarget \|\| !customerWriteActions\(releaseTarget\)\.release\) return;/,
  '释放确认 handler 必须使用当前目标重新校验策略。',
);
assert.match(
  source,
  /const handleOpenAssignCustomer = \(customer: Customer\) => \{\s*if \(!customerWriteActions\(customer\)\.transfer\) return;/,
  '转交对话框入口必须再校验策略。',
);
assert.match(
  source,
  /if \(!assignTarget \|\| !assignOwner \|\| !transferableOwnerIds\.has\(assignOwner\) \|\| !customerWriteActions\(assignTarget\)\.transfer\) return;/,
  '转交确认 handler 必须同时重新校验客户策略和服务端候选上界。',
);
assert.match(
  source,
  /const transferableOwnerIds = useMemo\(\s*\(\) => new Set\(manageableUsers\.map\(\(user\) => user\.id\)\)/,
  '转交可选 ID 必须仅由客户专用 endpoint 响应构造',
);
assert.match(
  source,
  /const handleOpenDeleteCustomer = \(customer: Customer\) => \{\s*if \(!customerWriteActions\(customer\)\.delete\) return;/,
  '删除对话框入口必须再校验策略。',
);
assert.match(
  source,
  /if \(!deleteCustomerTarget \|\| !customerWriteActions\(deleteCustomerTarget\)\.delete\) return;/,
  '删除确认 handler 必须使用当前目标重新校验策略。',
);

assert.match(
  source,
  /PERMISSION_KEYS\.CUSTOMER_PUBLIC_POOL_CLAIM/,
  '公海领取必须保留为独立的明确例外。',
);

console.log('customerWriteManageabilityStatic.test.ts passed');
