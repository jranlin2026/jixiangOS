import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const selector = readFileSync('src/shared/components/ManualTagSelector.tsx', 'utf8');
const settings = readFileSync('src/pages/Settings/CustomerTagConfig.tsx', 'utf8');

assert.match(selector, /export function invalidateManualTagCatalogCache/);
assert.match(settings, /invalidateManualTagCatalogCache\(\)/, '目录 mutation 成功后必须显式失效表单缓存');
assert.match(selector, /scope: 'lead' \| 'customer'/);
assert.match(selector, /selectionMode === 'single'/);
assert.match(selector, /includeInactiveSelected/);
assert.match(selector, /validateManualTagSelection/);
assert.match(selector, /20/);
assert.match(selector, /fetchCustomerTagCatalog\(scope, false\)/);
assert.match(selector, /createManualTagCatalogCache/);
assert.match(selector, /\[scope, version\]/, '失效版本变化必须让已挂载组件主动重新加载');
assert.match(selector, /重试/);
assert.match(selector, /标签目录加载失败/);
assert.doesNotMatch(selector, /freeSolo/);

for (const path of [
  'src/pages/Customers/CustomerForm.tsx',
  'src/pages/Customers/CustomerDetail.tsx',
  'src/pages/Leads/LeadForm.tsx',
  'src/pages/Leads/LeadDetail.tsx',
]) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /ManualTagSelector/);
  assert.match(source, /manualTagIds/);
  assert.doesNotMatch(source, /标签（逗号分隔）/);
}

for (const path of ['src/pages/Customers/CustomerForm.tsx', 'src/pages/Leads/LeadForm.tsx']) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /gridTemplateColumns: \{ xs: '1fr', sm: '1fr 1fr' \}/);
}

for (const path of ['src/pages/Customers/index.tsx', 'src/pages/Leads/index.tsx']) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /ManualTagDisplay/);
}

console.log('manualTagSelectorStatic.test.ts passed');
