import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const dialogPath = 'src/shared/components/CustomerTagDialog.tsx';
assert.equal(existsSync(dialogPath), true, '客户详情标签弹窗必须存在');
const dialog = readFileSync(dialogPath, 'utf8');
const detail = readFileSync('src/pages/Customers/CustomerDetail.tsx', 'utf8');

assert.match(dialog, /设置标签/);
assert.match(dialog, /搜索/);
assert.match(dialog, /selectionMode === 'single'/);
assert.match(dialog, /fetchCustomerTagCatalog\('customer', false\)/);
assert.match(dialog, /const initialIdsKey = JSON\.stringify\(initialIds\)/, '空标签数组必须使用稳定内容键，避免每次渲染重复加载目录');
assert.match(dialog, /\}, \[normalizedInitialIds, open\]\);/, '标签目录加载只能随弹窗开关或标签内容变化触发');
assert.match(dialog, /validateManualTagSelection/);
assert.match(detail, /CustomerTagDialog/);
assert.match(detail, /\+ 标签/);

console.log('customerTagDialogStatic.test.ts passed');
