import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiSource = readFileSync(join(process.cwd(), 'src/api/recoveryOrderApi.ts'), 'utf8');
const pageSource = readFileSync(join(process.cwd(), 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');
const financeSource = readFileSync(join(process.cwd(), 'src/pages/Finance/index.tsx'), 'utf8');
const serverSource = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
const rolePermissionSource = [
  readFileSync(join(process.cwd(), 'src/pages/Settings/RolePermission.tsx'), 'utf8'),
  readFileSync(join(process.cwd(), 'src/pages/Settings/corePermissionCatalog.ts'), 'utf8'),
].join('\n');

assert.match(apiSource, /editRecoveryOrderMetadata[\s\S]*\/metadata/);
assert.match(apiSource, /precheckRecoveryOrderCorrection[\s\S]*correction-precheck/);
assert.match(apiSource, /correctRecoveryOrder[\s\S]*\/correct/);
assert.match(
  pageSource,
  /nextMode === 'correction'[\s\S]*precheckRecoveryOrderCorrection\(row\.id\)[\s\S]*!precheck\.data\.allowed[\s\S]*setCorrectionBlocker/,
  '打开售后挽回单更正表单前必须执行服务端预检',
);
assert.match(pageSource, /编辑售后挽回订单资料/);
assert.match(pageSource, /售后挽回订单更正/);
assert.match(pageSource, /售后挽回订单修改记录/);
assert.match(pageSource, /前往财务处理/);
assert.match(pageSource, /\/finance\?tab=recovery-settlement&search=/);
assert.match(financeSource, /initialSearch=\{searchParams\.get\('search'\) \|\| ''\}/);
assert.match(serverSource, /app\.patch\('\/api\/recovery-orders\/:id\/metadata',\s*requireRecoveryEditAccess/);
assert.match(serverSource, /app\.get\('\/api\/recovery-orders\/:id\/correction-precheck',\s*requireRecoveryCorrectAccess/);
assert.match(serverSource, /app\.post\('\/api\/recovery-orders\/:id\/correct',\s*requireRecoveryCorrectAccess/);
assert.match(rolePermissionSource, /更正售后挽回订单[^\n]*AFTER_SALES_RECOVERY_CORRECT/);
