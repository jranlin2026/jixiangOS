import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasPermission, PERMISSION_KEYS } from '../shared/utils/permissions';
import type { AuthenticatedUser } from '../types/auth';

const constantsSource = readFileSync(join(process.cwd(), 'src/shared/utils/constants.ts'), 'utf8');
const rolePermissionSource = readFileSync(join(process.cwd(), 'src/pages/Settings/RolePermission.tsx'), 'utf8');

assert.match(constantsSource, /ENABLEMENT:\s*'\/enablement'/);
assert.match(rolePermissionSource, /label:\s*'赋能中台'/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_KNOWLEDGE/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_REVIEW/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_PUBLISH/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ENABLEMENT_SENSITIVE/);

const reader: AuthenticatedUser = {
  id: 'user-reader', name: 'Reader', account: 'reader', email: '', phone: '', role: 'Employee' as any,
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE, actions: ['read'] }], isActive: true,
};
assert.equal(hasPermission(reader, PERMISSION_KEYS.ENABLEMENT), true);
assert.equal(hasPermission(reader, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE), true);
assert.equal(hasPermission(reader, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write'), false);

const publisher: AuthenticatedUser = {
  ...reader,
  id: 'user-publisher',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_PUBLISH, actions: ['read', 'write'] }],
};
assert.equal(hasPermission(publisher, PERMISSION_KEYS.ENABLEMENT), true);
assert.equal(hasPermission(publisher, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write'), true);
