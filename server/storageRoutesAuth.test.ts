import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf8');

assert.match(source, /const requireCustomerListAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_LIST\);/);
assert.match(source, /const requireCustomerEditAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_EDIT, 'write'\);/);
assert.match(source, /const requireCustomerAssignAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_ASSIGN, 'write'\);/);
assert.match(source, /const requireLeadListAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_LIST\);/);
assert.match(source, /app\.get\('\/api\/customers', requireCustomerListAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/follow-ups', requireCustomerEditAccess,/);
assert.match(source, /app\.post\('\/api\/customers\/:id\/release', requireCustomerAssignAccess,/);
assert.match(source, /app\.get\('\/api\/leads', requireLeadListAccess,/);
assert.match(source, /canAccessLegacyStorageKey\(req\.currentUser, key, 'read'\)/);
assert.match(source, /canAccessLegacyStorageKey\(req\.currentUser, key, 'write'\)/);
assert.match(source, /Legacy storage deletion is disabled/);
assert.match(source, /app\.delete\('\/api\/storage', requireDataMaintenanceAccess,/);
