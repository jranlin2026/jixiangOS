import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const deliverySource = readFileSync(join(projectRoot, 'src/pages/Delivery/index.tsx'), 'utf8');
const financeSource = readFileSync(join(projectRoot, 'src/pages/Finance/index.tsx'), 'utf8');
const commissionSource = readFileSync(join(projectRoot, 'src/pages/Commission/index.tsx'), 'utf8');
const commissionRuleSource = readFileSync(join(projectRoot, 'src/pages/Commission/CommissionRuleConfig.tsx'), 'utf8');
const recoverySettlementSource = readFileSync(join(projectRoot, 'src/pages/Finance/RecoverySettlement.tsx'), 'utf8');
const assetsSource = readFileSync(join(projectRoot, 'src/pages/Assets/index.tsx'), 'utf8');

assert.match(
  deliverySource,
  /const canMutateDelivery\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.DELIVERY_MOVE_CARD,\s*'write'\)[\s\S]{0,120}PERMISSION_KEYS\.DELIVERY_STAGE_CONFIG,\s*'write'/,
  'Delivery mutations must require explicit delivery write permission.',
);

[
  'openCreateDialog',
  'handleCreateDelivery',
  'handleDeleteDelivery',
  'handleToggleTaskCompletion',
  'handleSaveTask',
  'handleSaveMaterials',
  'handleAddException',
  'handleResolveException',
  'handleConfirmDelivery',
  'openAssign',
  'saveAssign',
].forEach((handlerName) => {
  assert.match(
    deliverySource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,320}if \\(!canMutateDelivery\\) return;`),
    `${handlerName} must fail closed without delivery write permission.`,
  );
});

assert.match(
  deliverySource,
  /<BusinessAttachmentPicker[\s\S]{0,1200}disabled=\{!canMutateDelivery \|\| delivery\.approvalStatus === '已确认'\}/,
  'Delivery attachment picker must fail closed without delivery write permission.',
);

assert.ok(
  (deliverySource.match(/\{canMutateDelivery &&/g) || []).length >= 7,
  'Read-only delivery users must not see create, assign, delete, task, exception, or confirmation controls.',
);

assert.match(
  financeSource,
  /const canManageSettlement\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.FINANCE_SETTLEMENT,\s*'write'\)/,
  'The Finance header must require write permission before exposing order-settlement creation.',
);

assert.match(
  recoverySettlementSource,
  /const canManageRecoverySettlement\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.FINANCE_RECOVERY_SETTLEMENT,\s*'write'\)/,
  'Recovery-settlement mutations must require explicit recovery-settlement write permission.',
);

[
  'openSettlement',
  'submitSettlement',
  'confirmSettlement',
  'withdrawSettlement',
  'openResetSettlementDialog',
].forEach((handlerName) => {
  assert.match(
    recoverySettlementSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,300}if \\(!canManageRecoverySettlement\\) return;`),
    `${handlerName} must fail closed without recovery-settlement write permission.`,
  );
});

assert.match(
  recoverySettlementSource,
  /const handleResetSettlement[^]{0,420}cleanupDeletedSource \? !canCleanupDeletedSettlement : !canManageRecoverySettlement/,
  '废弃分账清理必须限定超级管理员，普通分账删除仍要求财务写权限。',
);

assert.ok(
  (recoverySettlementSource.match(/\{canManageRecoverySettlement &&/g) || []).length >= 4,
  'Read-only recovery-settlement users must not see create, adjust, confirm, withdraw, or delete controls.',
);

assert.match(
  commissionRuleSource,
  /const canManageRules\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.FINANCE_RULES,\s*'write'\)/,
  'Commission rule mutations must require explicit rules write permission.',
);

[
  'saveTierConfig',
  'handleSubmitPlan',
  'handleTogglePlanActive',
  'handleDeletePlan',
  'handleSubmitRule',
  'handleToggleRuleActive',
  'handleDeleteRule',
  'handleSubmitRole',
  'handleToggleRoleActive',
  'handleDeleteRole',
].forEach((handlerName) => {
  assert.match(
    commissionRuleSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,260}if \\(!canManageRules\\) return;`),
    `${handlerName} must fail closed without rules write permission.`,
  );
});

assert.ok(
  (commissionRuleSource.match(/\{canManageRules &&/g) || []).length >= 4,
  'Read-only rules users must not see create, toggle, edit, or delete controls.',
);

assert.match(
  commissionSource,
  /const canManageOrderSettlement\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.FINANCE_SETTLEMENT,\s*'write'\)/,
  'Order-settlement mutations must require explicit settlement write permission.',
);

['generateMonthlyBatch', 'payOwner', 'payBatch', 'confirmPayoutAction'].forEach((handlerName) => {
  assert.match(
    commissionSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,260}if \\(!canManagePayout\\) return;`),
    `${handlerName} must fail closed without payout write permission.`,
  );
});

assert.match(
  commissionSource,
  /const showPayoutFinanceActions\s*=\s*canManagePayout\s*&&\s*!hidePayoutFinanceActions/,
  'Read-only payout users must not see finance payout actions.',
);

[
  'openCreateSplitDialog',
  'handleSaveSplitRows',
  'openDeleteOrderSplitDialog',
  'confirmDeleteOrderSplit',
  'confirmOrderFromDetail',
  'withdrawOrderFromDetail',
].forEach((handlerName) => {
  assert.match(
    commissionSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,320}if \\(!canManageOrderSettlement\\) return;`),
    `${handlerName} must fail closed without order-settlement write permission.`,
  );
});

assert.ok(
  (commissionSource.match(/\{canManageOrderSettlement &&/g) || []).length >= 4,
  'Read-only settlement users must not see create, adjust, delete, or detail mutation controls.',
);

assert.match(
  commissionSource,
  /const canManagePayout\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.FINANCE_PAYOUT,\s*'write'\)/,
  'Monthly payout mutations must require explicit payout write permission.',
);

assert.match(
  financeSource,
  /const canManageRecoverySettlement\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.FINANCE_RECOVERY_SETTLEMENT,\s*'write'\)/,
  'The Finance header must require write permission before exposing recovery-settlement creation.',
);

assert.match(
  assetsSource,
  /const canImportExport\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS_IMPORT_EXPORT,\s*'write'\)/,
  'Asset import and export actions must require explicit write permission.',
);

assert.match(
  assetsSource,
  /const canEditAssets\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS,\s*'write'\)/,
  'Asset create and edit actions must require explicit asset write permission.',
);

assert.match(
  assetsSource,
  /const canDeleteAssets\s*=\s*canEditAssets\s*\|\|\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS,\s*'delete'\)/,
  'Asset deletion must require explicit asset write or delete permission.',
);

assert.match(
  assetsSource,
  /const canHandleOffboarding\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS_OFFBOARDING,\s*'write'\)/,
  'Asset offboarding actions must require explicit write permission.',
);

assert.match(
  assetsSource,
  /const canManageMatrixPublish\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS_MATRIX_PUBLISH,\s*'write'\)/,
  'Matrix-publish mutations must require explicit write permission.',
);

assert.match(
  assetsSource,
  /const canRevealSensitive\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS_SENSITIVE_VIEW,\s*'read'\)/,
  'Sensitive asset fields must require an explicit sensitive-view action.',
);

['openCreateForm', 'openEditForm', 'submitForm'].forEach((handlerName) => {
  assert.match(
    assetsSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,300}if \\(!canEditAssets\\)`),
    `${handlerName} must fail closed without asset write permission.`,
  );
});

['openDeleteConfirm', 'submitDelete'].forEach((handlerName) => {
  assert.match(
    assetsSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,300}if \\(!canDeleteAssets\\)`),
    `${handlerName} must fail closed without asset delete permission.`,
  );
});

['openImportDialog', 'downloadImportTemplate', 'downloadFailedRows', 'submitImport', 'exportCurrentRows'].forEach((handlerName) => {
  assert.match(
    assetsSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,300}if \\(!canImportExport\\)`),
    `${handlerName} must fail closed without asset import/export write permission.`,
  );
});

['submitMatrixPublishTask', 'handleCompleteMatrixTarget'].forEach((handlerName) => {
  assert.match(
    assetsSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,260}if \\(!canManageMatrixPublish\\)`),
    `${handlerName} must fail closed without matrix-publish write permission.`,
  );
});

assert.match(
  assetsSource,
  /\{canManageMatrixPublish \? \([\s\S]{0,320}handleCompleteMatrixTarget/,
  'Read-only matrix-publish users must not see completion controls.',
);
