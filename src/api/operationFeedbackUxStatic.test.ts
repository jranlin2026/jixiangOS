import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const dialogSource = read('src/shared/components/OperationFeedbackDialog.tsx');
const hookSource = read('src/shared/hooks/useAppFeedback.tsx');
const collectTsx = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry);
  if (statSync(path).isDirectory()) return collectTsx(path);
  return entry.endsWith('.tsx') ? [path] : [];
});

assert.match(dialogSource, /<Dialog[\s\S]*open=\{open\}/, 'Operation results must use a real modal dialog.');
assert.match(dialogSource, /操作完成/);
assert.match(dialogSource, /操作失败/);
assert.doesNotMatch(dialogSource, /Snackbar/, 'Operation feedback must never fall back to a page-edge snackbar.');
assert.match(hookSource, /OperationFeedbackDialog/, 'Imperative app feedback must share the same operation-result dialog.');

const snackbarOffenders = collectTsx(join(root, 'src'))
  .filter((path) => /\bSnackbar\b/.test(readFileSync(path, 'utf8')));
assert.deepEqual(snackbarOffenders, [], 'Page-edge Snackbars are not allowed for operation feedback.');

const migratedPages = [
  'src/pages/Settings/RolePermission.tsx',
  'src/pages/Settings/AIProviderConfig.tsx',
  'src/pages/Settings/DeliveryAssignmentConfig.tsx',
  'src/pages/Settings/AfterSalesSourceConfig.tsx',
  'src/pages/Leads/LeadFlowConfigTab.tsx',
  'src/pages/AfterSales/RecoveryOrderTab.tsx',
  'src/pages/EcommerceSettlement/index.tsx',
  'src/pages/CoCreation/index.tsx',
  'src/pages/Enablement/PublishingCenter.tsx',
  'src/pages/Customers/CustomerDuplicateGovernance.tsx',
  'src/pages/Commission/index.tsx',
  'src/pages/Finance/CommissionPayout.tsx',
  'src/pages/Finance/RecoverySettlement.tsx',
  'src/pages/Orders/index.tsx',
  'src/shared/components/StorageSyncFailureNotice.tsx',
];

migratedPages.forEach((path) => {
  const source = read(path);
  assert.match(source, /OperationFeedbackDialog/, `${path} should use the unified operation-result dialog.`);
});

assert.doesNotMatch(read('src/pages/Settings/RolePermission.tsx'), /saveMessage\s*&&\s*\(\s*<Alert/);
assert.doesNotMatch(read('src/pages/AfterSales/RecoveryOrderTab.tsx'), /message\s*&&\s*\(\s*<Alert/);
assert.doesNotMatch(read('src/pages/EcommerceSettlement/index.tsx'), /message\s*&&\s*<Alert/);
assert.doesNotMatch(read('src/pages/CoCreation/index.tsx'), /message\s*&&\s*<Alert/);
assert.doesNotMatch(read('src/pages/Settings/AIProviderConfig.tsx'), /message\s*&&\s*<Alert/);
assert.doesNotMatch(read('src/pages/Settings/DeliveryAssignmentConfig.tsx'), /message\s*&&\s*<Alert/);
assert.doesNotMatch(read('src/pages/Settings/AfterSalesSourceConfig.tsx'), /message\s*&&\s*<Typography/);
assert.doesNotMatch(read('src/pages/Leads/LeadFlowConfigTab.tsx'), /saved\s*&&\s*<Alert/);
assert.doesNotMatch(read('src/pages/Enablement/PublishingCenter.tsx'), /notice\s*\?\s*<Alert/);
assert.doesNotMatch(read('src/pages/Customers/CustomerDuplicateGovernance.tsx'), /notice\s*&&\s*<Alert/);
assert.doesNotMatch(read('src/pages/Orders/index.tsx'), /<Snackbar/);
assert.doesNotMatch(read('src/shared/components/StorageSyncFailureNotice.tsx'), /Snackbar/);
