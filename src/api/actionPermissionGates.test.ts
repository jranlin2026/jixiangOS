import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const deliverySource = readFileSync(join(projectRoot, 'src/pages/Delivery/index.tsx'), 'utf8');
const financeSource = readFileSync(join(projectRoot, 'src/pages/Finance/index.tsx'), 'utf8');
const commissionSource = readFileSync(join(projectRoot, 'src/pages/Commission/index.tsx'), 'utf8');
const commissionPayoutSource = readFileSync(join(projectRoot, 'src/pages/Finance/CommissionPayout.tsx'), 'utf8');
const commissionRuleSource = readFileSync(join(projectRoot, 'src/pages/Commission/CommissionRuleConfig.tsx'), 'utf8');
const recoverySettlementSource = readFileSync(join(projectRoot, 'src/pages/Finance/RecoverySettlement.tsx'), 'utf8');
const assetsSource = readFileSync(join(projectRoot, 'src/pages/Assets/index.tsx'), 'utf8');
const marketingSource = readFileSync(join(projectRoot, 'src/pages/Marketing/index.tsx'), 'utf8');
const leadFlowConfigSource = readFileSync(join(projectRoot, 'src/pages/Leads/LeadFlowConfigTab.tsx'), 'utf8');
const customerFormSource = readFileSync(join(projectRoot, 'src/pages/Customers/CustomerForm.tsx'), 'utf8');

assert.match(
  deliverySource,
  /const canMutateDelivery\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.DELIVERY_MOVE_CARD,\s*'write'\)[\s\S]{0,120}PERMISSION_KEYS\.DELIVERY_STAGE_CONFIG,\s*'write'/,
  'Delivery mutations must require explicit delivery write permission.',
);

assert.match(
  deliverySource,
  /settingsApi\.fetchAssignableUsers\(\{ isActive: true \}\)/,
  '交付负责人必须使用业务候选目录，不得依赖系统组织架构查看权限。',
);
assert.doesNotMatch(
  deliverySource,
  /settingsApi\.fetchUsers\(\{ isActive: true \}\)/,
  '交付中心不得通过组织管理接口加载分配候选人。',
);
assert.match(
  deliverySource,
  /usersRes\.code !== 0[\s\S]{0,420}alert\([\s\S]{0,160}'交付负责人加载失败'/,
  '交付候选人接口失败时必须弹窗告知，不得伪装成“只有待分配”。',
);

assert.match(
  assetsSource,
  /settingsApi\.fetchAssignableDirectory\(\)/,
  '资产负责人与部门选项必须使用业务候选目录。',
);
assert.doesNotMatch(
  assetsSource,
  /settingsApi\.fetchUsers\(/,
  '资产业务页不得依赖系统组织架构员工接口。',
);

assert.match(
  leadFlowConfigSource,
  /settingsApi\.fetchLeadFlowDirectory\(\)/,
  '线索流转配置必须使用自己的业务目录。',
);
assert.doesNotMatch(
  leadFlowConfigSource,
  /settingsApi\.fetchUsers\(|roleApi\.getRoles\(|departmentApi\.getDepartments\(/,
  '线索流转权限不得隐式依赖员工、角色或部门管理权限。',
);
assert.doesNotMatch(
  assetsSource,
  /departmentApi\.getDepartments\(/,
  '资产业务页不得依赖系统组织架构部门接口。',
);
assert.match(
  assetsSource,
  /const canEditDevices\s*=\s*hasPermission\(currentUser, PERMISSION_KEYS\.ASSETS_DEVICES, 'write'\)[\s\S]{0,220}const canEditPhones[\s\S]{0,220}const canEditAccounts/,
  '资产编辑必须校验明确的设备、手机号和账号写权限。',
);
assert.doesNotMatch(
  assetsSource,
  /const canEditAssets|hasPermission\(currentUser, PERMISSION_KEYS\.ASSETS, 'write'\)/,
  '资产父权限会展开所有叶子，不能用作编辑门槛。',
);

assert.match(
  customerFormSource,
  /customerApi\.fetchManageableUsers\(\)/,
  '新增或编辑客户必须使用客户数据范围内的可管理人员目录。',
);
assert.doesNotMatch(
  customerFormSource,
  /settingsApi\.fetchAssignableUsers|getScopedLeadAssignmentCandidates/,
  '客户表单不得通过全公司候选目录扩大数据范围。',
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

assert.match(
  commissionPayoutSource,
  /const canManage\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.FINANCE_PAYOUT,\s*'write'\)/,
  'Payout batch mutations must require explicit payout write permission.',
);

[
  'openCreateSplitDialog',
  'handleSaveSplitRows',
  'confirmOrderFromDetail',
  'withdrawOrderFromDetail',
].forEach((handlerName) => {
  assert.match(
    commissionSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,320}if \\(!canManageOrderSettlement\\) return;`),
    `${handlerName} must fail closed without order-settlement write permission.`,
  );
});

for (const handlerName of ['openDeleteOrderSplitDialog', 'confirmDeleteOrderSplit']) {
  assert.match(
    commissionSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,420}sourceOrderDeleted \\? !canCleanupDeletedOrderSettlement : !canManageOrderSettlement`),
    `${handlerName} must require super-admin cleanup permission for deleted sources and settlement write permission for reset.`,
  );
}

const orderSettlementRowActionsStart = commissionSource.indexOf('<Tooltip title="查看分账">');
const orderSettlementRowActionsEnd = commissionSource.indexOf('</TableCell>', orderSettlementRowActionsStart);
const orderSettlementRowActions = commissionSource.slice(orderSettlementRowActionsStart, orderSettlementRowActionsEnd);
const guardedOrderSettlementRowActions = orderSettlementRowActions.match(
  /\{canManageOrderSettlement && \(\s*<>([\s\S]*?)<\/>\s*\)\}/,
)?.[1];
assert.ok(guardedOrderSettlementRowActions, '订单分账行操作必须整体受分账写权限控制。');
for (const actionLabel of ['调整分账', '重新分账', '重置订单分账', '清理废弃记录']) {
  assert.match(
    guardedOrderSettlementRowActions,
    new RegExp(actionLabel),
    `订单分账行操作“${actionLabel}”不得出现在写权限门禁之外。`,
  );
}

const standaloneOrderSettlementHeader = commissionSource.slice(
  commissionSource.indexOf('{!embedded && ('),
  commissionSource.indexOf('{embedded && tabValue === 0 && !hideEmbeddedOrderSplitViewButton'),
);
assert.match(
  standaloneOrderSettlementHeader,
  /\{canManageOrderSettlement && \([\s\S]*?onClick=\{openCreateSplitDialog\}[\s\S]*?>\s*新建订单分账\s*<\/Button>[\s\S]*?\)\}/,
  '独立订单分账页的新建入口必须要求分账写权限。',
);

const embeddedOrderSettlementHeader = commissionSource.slice(
  commissionSource.indexOf('{embedded && tabValue === 0 && !hideEmbeddedOrderSplitViewButton'),
  commissionSource.indexOf('{tabValue === 0 && (', commissionSource.indexOf('{embedded && tabValue === 0 && !hideEmbeddedOrderSplitViewButton')),
);
assert.match(
  embeddedOrderSettlementHeader,
  /\{canManageOrderSettlement && \([\s\S]*?onClick=\{openCreateSplitDialog\}[\s\S]*?>\s*新建订单分账\s*<\/Button>[\s\S]*?\)\}/,
  '嵌入式订单分账页的新建入口必须要求分账写权限。',
);

const orderSettlementDetailActions = commissionSource.slice(
  commissionSource.indexOf('const renderSettlementDetailActions = () => {'),
  commissionSource.indexOf('const renderMonthlyPayout = () => ('),
);
assert.match(
  orderSettlementDetailActions,
  /const renderSettlementDetailActions = \(\) => \{\s*if \(!summaryDetail\) return null;\s*if \(!canManageOrderSettlement\) \{\s*return <Typography[^;]+>当前账号只能查看分账信息。<\/Typography>;\s*\}\s*if \(summaryDetail\.sourceOrderDeleted\)/,
  '详情操作必须在任何状态分支之前对无分账写权限用户整体早返回。',
);

assert.match(
  commissionPayoutSource,
  /\{canManage && \(/,
  'Read-only payout users must not see issue controls.',
);

assert.doesNotMatch(
  commissionPayoutSource,
  /aria-label="撤销发放"|>确认撤销</,
  'The first release must not expose an in-system payout reversal control.',
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
  /const canEditAssetType\s*=\s*\(type: AssetFormType\)[\s\S]{0,220}canEditDevices[\s\S]{0,220}canEditPhones[\s\S]{0,220}canEditAccounts/,
  'Asset create and edit actions must require explicit device, phone, or account write permission.',
);

assert.match(
  assetsSource,
  /const canDeleteAssetType\s*=\s*\(type: AssetFormType\)[\s\S]{0,360}PERMISSION_KEYS\.ASSETS_DEVICES[\s\S]{0,220}ASSETS_PHONES[\s\S]{0,220}ASSETS_ACCOUNTS/,
  'Asset deletion must require the matching asset type write or delete permission.',
);

assert.match(
  assetsSource,
  /const canHandleOffboarding\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS_OFFBOARDING,\s*'write'\)/,
  'Asset offboarding actions must require explicit write permission.',
);

assert.match(
  marketingSource,
  /const canPublish\s*=\s*hasPermission\([\s\S]{0,100}PERMISSION_KEYS\.MARKETING_PUBLISH,[\s\S]{0,50}"write"/,
  'Publish-plan mutations must require explicit content-operations write permission.',
);

assert.match(
  assetsSource,
  /const canRevealSensitive\s*=\s*hasPermission\(currentUser,\s*PERMISSION_KEYS\.ASSETS_SENSITIVE_VIEW,\s*'read'\)/,
  'Sensitive asset fields must require an explicit sensitive-view action.',
);

['openCreateForm', 'openEditForm', 'submitForm'].forEach((handlerName) => {
  assert.match(
    assetsSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,360}if \\(!canEditAssetType\\(`),
    `${handlerName} must fail closed without asset write permission.`,
  );
});

['openDeleteConfirm', 'submitDelete'].forEach((handlerName) => {
  assert.match(
    assetsSource,
    new RegExp(`const ${handlerName}[\\s\\S]{0,360}if \\(!canDeleteAssetType\\(`),
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

assert.doesNotMatch(assetsSource, /createMatrixPublishTask|handleCompleteMatrixTarget/, '资产管理不得承载发布计划写操作');
