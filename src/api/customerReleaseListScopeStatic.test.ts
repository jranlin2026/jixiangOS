import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve('src/pages/Customers/index.tsx'), 'utf8');
const releaseHandler = source.match(
  /const handleConfirmReleaseCustomer = async \(\) => \{([\s\S]*?)\n  const handleOpenAssignCustomer/,
)?.[1];

assert.ok(releaseHandler, 'Customer list should define a release-to-public-pool handler.');
assert.doesNotMatch(
  releaseHandler,
  /setCustomerScope\(['"]public_pool['"]\)/,
  'Releasing a customer must not switch the active customer list into public-pool mode.',
);
assert.match(
  releaseHandler,
  /scopedFilters\([\s\S]*?,\s*customerScope\s*\)/,
  'After release, the customer list should refresh using the current route scope.',
);

console.log('customerReleaseListScopeStatic.test.ts passed');
