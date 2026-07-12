import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ordersSource = readFileSync(join(process.cwd(), 'src/pages/Orders/index.tsx'), 'utf8');
const orderFormSource = readFileSync(join(process.cwd(), 'src/pages/Orders/OrderForm.tsx'), 'utf8');
const commissionSource = readFileSync(join(process.cwd(), 'src/pages/Commission/index.tsx'), 'utf8');
const recoverySource = readFileSync(join(process.cwd(), 'src/pages/Finance/RecoverySettlement.tsx'), 'utf8');
const customerFormSource = readFileSync(join(process.cwd(), 'src/pages/Customers/CustomerForm.tsx'), 'utf8');
const customersSource = readFileSync(join(process.cwd(), 'src/pages/Customers/index.tsx'), 'utf8');
const customerDetailSource = readFileSync(join(process.cwd(), 'src/pages/Customers/CustomerDetail.tsx'), 'utf8');
const commissionApiSource = readFileSync(join(process.cwd(), 'src/api/commissionApi.ts'), 'utf8');

assert.match(ordersSource, /orderApi\.fetchOwnerCandidates/);
assert.match(ordersSource, /filterUsersByCurrentDataScope\(users, 'orders', currentUser/);
assert.match(orderFormSource, /orderApi\.fetchOwnerCandidates/);
assert.match(orderFormSource, /filterUsersByCurrentDataScope\(userRes\.data, 'orders', currentUser/);
assert.match(commissionSource, /settingsApi\.fetchAssignableDirectory/);
assert.match(recoverySource, /settingsApi\.fetchAssignableDirectory/);
assert.match(commissionApiSource, /await hydrateCommissionOrderCache\(\)/);
assert.match(customerFormSource, /const saved =/);
assert.match(customerFormSource, /if \(!saved\) return;/);
assert.match(customerFormSource, /setSubmitError/);
assert.match(customersSource, /permissionKey=\{PERMISSION_KEYS\.CUSTOMER_PUBLIC_POOL_CLAIM\}/);
assert.match(customerDetailSource, /permissionKey=\{PERMISSION_KEYS\.CUSTOMER_PUBLIC_POOL_CLAIM\}/);
assert.match(customersSource, /!isPublicPoolScope\s*&&\s*\([\s\S]*?新增客户/);
