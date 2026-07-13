import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const selector = readFileSync('src/shared/components/ManualTagSelector.tsx', 'utf8');
const settings = readFileSync('src/pages/Settings/CustomerTagConfig.tsx', 'utf8');

assert.match(selector, /export function invalidateManualTagCatalogCache/);
assert.match(settings, /invalidateManualTagCatalogCache\(\)/, '目录 mutation 成功后必须显式失效表单缓存');
assert.match(selector, /selectionMode === 'single'/);
assert.match(selector, /includeInactiveSelected/);
assert.match(selector, /validateManualTagSelection/);
assert.match(selector, /20/);
assert.match(selector, /CUSTOMER_SCOPE = 'customer'/);
assert.match(selector, /fetchCustomerTagCatalog\(CUSTOMER_SCOPE, false\)/);
assert.match(selector, /createManualTagCatalogCache/);
assert.match(selector, /\[version\]/, '失效版本变化必须让已挂载组件主动重新加载');
assert.match(selector, /重试/);
assert.match(selector, /标签目录加载失败/);
assert.doesNotMatch(selector, /freeSolo/);
assert.doesNotMatch(selector, /scope:\s*'lead'/);

for (const path of [
  'src/pages/Customers/CustomerForm.tsx',
  'src/pages/Customers/CustomerDetail.tsx',
]) {
  const source = readFileSync(path, 'utf8');
  if (path.endsWith('CustomerForm.tsx')) {
    assert.doesNotMatch(source, /CustomerTagDialog|<ManualTagSelector|label="客户标签"/, 'Customer form should not expose a tag input.');
  } else {
    assert.match(source, /ManualTagSelector/);
  }
  assert.match(source, /manualTagIds/);
  assert.doesNotMatch(source, /标签（逗号分隔）/);
}

for (const path of ['src/pages/Customers/CustomerForm.tsx']) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /gridTemplateColumns: \{ xs: '1fr', sm: '1fr 1fr' \}/);
}

for (const path of ['src/pages/Customers/index.tsx']) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /ManualTagDisplay/);
}

for (const path of [
  'src/pages/Leads/LeadForm.tsx',
  'src/pages/Leads/LeadDetail.tsx',
  'src/pages/Leads/index.tsx',
]) {
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(source, /ManualTagSelector|ManualTagDisplay|预设标签|manualTagIds/);
}

assert.doesNotMatch(settings, /适用范围|线索与客户|<MenuItem value="lead"|<MenuItem value="both"/);

console.log('manualTagSelectorStatic.test.ts passed');
