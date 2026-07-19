import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../pages/Customers/index.tsx', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../pages/Customers/batch/CustomerBatchActionDialog.tsx', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../pages/Customers/batch/CustomerBatchTaskDrawer.tsx', import.meta.url), 'utf8');
const toolbar = readFileSync(new URL('../pages/Customers/batch/CustomerBatchToolbar.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../layouts/Sidebar.tsx', import.meta.url), 'utf8');

assert.match(page, /<Checkbox[\s\S]*选择当前页客户/);
assert.match(page, /selectCurrentFilterResult\(scopedFilters\(\)\)/);
assert.match(page, /CUSTOMER_BATCH_ACTION_PERMISSION_MAP[\s\S]*hasExplicitPermission/);
assert.match(page, /<CustomerBatchToolbar/);
assert.match(page, /label: '合并客户'/);
assert.match(page, /selectedIds\.join\(','\)/);
assert.doesNotMatch(page, />重复客户治理</, '客户页顶部不应保留独立合并入口');
assert.match(page, /<CustomerBatchActionDialog/);
assert.match(page, /<CustomerBatchTaskDrawer/);
assert.doesNotMatch(page, /onClose=\{[^}]*customerBatchApi\.cancel/, '关闭页面或抽屉不得自动取消任务');

assert.match(dialog, /customerBatchApi\.precheck/);
assert.match(dialog, /customerBatchApi\.createJob/);
assert.match(dialog, /confirmationToken/);
assert.match(dialog, /删除客户/);
assert.match(dialog, /revisionRef/, '修改表单后不得接受旧请求返回的预检令牌');

assert.match(drawer, /window\.setInterval\([^,]+, 2_000\)/);
assert.match(drawer, /isTerminalCustomerBatchJobStatus/);
assert.match(drawer, /customerBatchApi\.cancel/);
assert.match(drawer, /result\.items\.map/);
assert.match(toolbar, /additionalActions/);
assert.doesNotMatch(sidebar, /label: '重复客户治理'/, '侧边栏不应保留独立合并入口');

console.log('customer batch interface static tests passed');
