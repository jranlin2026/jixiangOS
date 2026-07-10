import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_ROLES } from '../shared/utils/organizationConfig';
import { PERMISSION_KEYS, roleHasPermission } from '../shared/utils/permissions';

const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
const sidebarSource = readFileSync(join(process.cwd(), 'src', 'layouts', 'Sidebar.tsx'), 'utf8');
const rolePermissionSource = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings', 'RolePermission.tsx'), 'utf8');
const pageSource = readFileSync(join(process.cwd(), 'src', 'pages', 'EcommerceSettlement', 'index.tsx'), 'utf8');

assert.match(appSource, /ROUTES\.ECOMMERCE_SETTLEMENT/);
assert.match(sidebarSource, /电商结算中心/);
assert.match(rolePermissionSource, /PERMISSION_KEYS\.ECOMMERCE_SETTLEMENT_WORKBENCH/);
assert.match(pageSource, /店铺对账/);
assert.match(pageSource, /生成当前店铺/);
assert.match(pageSource, /结算结果/);
assert.match(pageSource, /店铺利润/);
assert.match(pageSource, /达人利润/);
assert.match(pageSource, /异常核对/);
assert.match(pageSource, /资金流水明细核对/);

const financeRole = DEFAULT_ROLES.find((role) => role.code === 'finance_specialist');
const opsRole = DEFAULT_ROLES.find((role) => role.code === 'ops_admin');
assert.ok(financeRole);
assert.ok(opsRole);
assert.equal(roleHasPermission(financeRole, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT), true);
assert.equal(roleHasPermission(financeRole, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH, 'write'), true);
assert.equal(roleHasPermission(opsRole, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS, 'write'), true);
