import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiSource = readFileSync(join(process.cwd(), 'src/api/recoveryOrderApi.ts'), 'utf8');
const pageSource = readFileSync(join(process.cwd(), 'src/pages/AfterSales/RecoveryOrderTab.tsx'), 'utf8');
const impactDialogSource = readFileSync(join(process.cwd(), 'src/shared/components/CommissionCorrectionImpactDialog.tsx'), 'utf8');
const recoveryCorrectionUiSource = `${pageSource}\n${impactDialogSource}`;
const financeSource = readFileSync(join(process.cwd(), 'src/pages/Finance/index.tsx'), 'utf8');
const serverSource = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
const rolePermissionSource = [
  readFileSync(join(process.cwd(), 'src/pages/Settings/RolePermission.tsx'), 'utf8'),
  readFileSync(join(process.cwd(), 'src/pages/Settings/corePermissionCatalog.ts'), 'utf8'),
].join('\n');

assert.match(apiSource, /editRecoveryOrderMetadata[\s\S]*\/metadata/);
assert.match(apiSource, /precheckRecoveryOrderCorrection[\s\S]*correction-precheck/);
assert.match(apiSource, /previewRecoveryOrderCorrection[\s\S]*correction-preview/);
assert.match(apiSource, /correctRecoveryOrder[\s\S]*\/correct/);
assert.match(
  pageSource,
  /nextMode === 'correction'[\s\S]*precheckRecoveryOrderCorrection\(row\.id\)[\s\S]*!precheck\.data\.allowed[\s\S]*setCorrectionBlocker/,
  '打开售后挽回单更正表单前必须执行服务端预检',
);
assert.match(pageSource, /编辑售后挽回订单资料/);
assert.match(pageSource, /售后挽回订单更正/);
assert.match(pageSource, /售后挽回订单更正（影响预览）/);
assert.match(pageSource, /已有发放单、提成人员、提成金额及实际发放时间永久保留/);
assert.match(pageSource, /同月阶梯联动影响/, '未发放源单也必须提示可能影响同月其他已发提成');
assert.match(
  pageSource,
  /precheckRecoveryOrderCorrection\(editingOrder\.id\)[\s\S]*requiresImpactPreview[\s\S]*previewRecoveryOrderCorrection/,
  '已发放售后挽回更正提交前必须按最新预检结果获取影响预览',
);
assert.match(pageSource, /expectedImpactHash:\s*correctionPreview\.impactHash/);
assert.match(recoveryCorrectionUiSource, /受影响员工/);
assert.match(recoveryCorrectionUiSource, /原已发/);
assert.match(recoveryCorrectionUiSource, /新应得/);
assert.match(recoveryCorrectionUiSource, /补发/);
assert.match(recoveryCorrectionUiSource, /追回/);
assert.match(pageSource, /售后挽回订单修改记录/);
assert.match(pageSource, /前往财务处理/);
assert.match(pageSource, /\/finance\?tab=recovery-settlement&search=/);
assert.match(financeSource, /initialSearch=\{searchParams\.get\('search'\) \|\| ''\}/);
assert.match(serverSource, /app\.patch\('\/api\/recovery-orders\/:id\/metadata',\s*requireRecoveryEditAccess/);
assert.match(serverSource, /app\.get\('\/api\/recovery-orders\/:id\/correction-precheck',\s*requireRecoveryCorrectAccess/);
assert.match(serverSource, /app\.post\('\/api\/recovery-orders\/:id\/correction-preview',\s*requireRecoveryCorrectAccess/);
assert.match(serverSource, /app\.post\('\/api\/recovery-orders\/:id\/correct',\s*requireRecoveryCorrectAccess/);
assert.match(rolePermissionSource, /更正售后挽回订单[^\n]*AFTER_SALES_RECOVERY_CORRECT/);
