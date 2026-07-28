import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getRoleEditorPermissionActions,
  PERMISSION_KEYS,
  roleHasPermission,
} from '../shared/utils/permissions';
import type { Role } from '../types/role';

const role = (permissions: Role['permissions']): Role => ({
  id: 'role-core-permission-test',
  name: '核心权限测试',
  code: 'core_permission_test',
  permissions,
  memberCount: 0,
  isActive: true,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
});

assert.equal(roleHasPermission(role([
  { module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] },
]), PERMISSION_KEYS.LEADS_EDIT, 'write'), false, '新增线索不得隐式授予编辑线索');
assert.equal(roleHasPermission(role([
  { module: PERMISSION_KEYS.LEADS_EDIT, actions: ['read', 'write'] },
]), PERMISSION_KEYS.LEADS_EDIT, 'write'), true);
assert.deepEqual(getRoleEditorPermissionActions(PERMISSION_KEYS.LEADS_EDIT), ['read', 'write']);
assert.deepEqual(getRoleEditorPermissionActions(PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS), ['read', 'write']);

const root = process.cwd();
const server = readFileSync(join(root, 'server/index.ts'), 'utf8');
const leadPage = readFileSync(join(root, 'src/pages/Leads/LeadDetail.tsx'), 'utf8');
const commissionPage = readFileSync(join(root, 'src/pages/Commission/index.tsx'), 'utf8');
const financePage = readFileSync(join(root, 'src/pages/Finance/index.tsx'), 'utf8');
const customerCommandService = readFileSync(join(root, 'server/services/customerCommandService.ts'), 'utf8');

assert.match(server, /requireLeadEditAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_EDIT, 'write'\)/);
assert.match(server, /commission-payout-reports\/export', requireFinancePayoutReportExportAccess/);
assert.match(server, /finance-transactions\/export', requireFinanceFlowExportAccess/);
assert.match(leadPage, /PERMISSION_KEYS\.LEADS_EDIT, 'write'/);
assert.match(customerCommandService, /hasPermission\(currentUser, PERMISSION_KEYS\.LEADS_EDIT, 'write'\)/);
assert.match(commissionPage, /PERMISSION_KEYS\.FINANCE_PAYOUT_REPORT_EXPORT/);
assert.match(financePage, /PERMISSION_KEYS\.FINANCE_FLOW_EXPORT/);

console.log('core permission enforcement tests passed');
