import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const customersPageSource = readFileSync(join(projectRoot, 'src/pages/Customers/index.tsx'), 'utf8');
const customerDetailSource = readFileSync(join(projectRoot, 'src/pages/Customers/CustomerDetail.tsx'), 'utf8');
const customerRecordPageSource = readFileSync(join(projectRoot, 'src/pages/Customers/CustomerRecordPage.tsx'), 'utf8');

assert.match(
  customersPageSource,
  /const handleViewDetail = \(customer: Customer\) => \{\s*setSelectedCustomer\(customer\);\s*setDetailOpen\(true\);\s*\}/,
  'Customer list should open the original customer profile dialog.',
);
assert.match(
  customersPageSource,
  /const handleCloseDetail = \(\) => \{\s*setDetailOpen\(false\);\s*setSelectedCustomer\(null\);/,
  'Closing the profile dialog should discard transient detail state before reopening the same customer.',
);
assert.doesNotMatch(
  customerDetailSource,
  /CustomerManagementCommandLayer/,
  'Customer profile dialog should not duplicate the management command layer.',
);
assert.match(
  customerRecordPageSource,
  /CustomerManagementCommandLayer/,
  'Customer management page should retain the management command layer.',
);
