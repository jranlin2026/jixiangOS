import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const selector = readFileSync('src/shared/components/ManualTagSelector.tsx', 'utf8');
assert.match(selector, /scope: 'lead' \| 'customer'/);
assert.match(selector, /selectionMode === 'single'/);
assert.match(selector, /includeInactiveSelected/);
assert.match(selector, /validateManualTagSelection/);
assert.match(selector, /20/);
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

for (const path of ['src/pages/Customers/index.tsx', 'src/pages/Leads/index.tsx']) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /ManualTagDisplay/);
}

console.log('manualTagSelectorStatic.test.ts passed');
